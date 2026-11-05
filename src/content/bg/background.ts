import { introActive, onIntroEnd } from '../ui/intro/gate';
import type { Background, Palette, ShaderId } from '../../shared/settings';
import { BG_IMAGE_KEY } from '../../shared/settings';
import { PALETTES, SHADER_IDS } from './shaders';
import type { FluxField } from './flux';
import { setupQuad, ShaderProgram } from './program';
import { h } from '../ui/dom';
import { GlassLens } from './lens';
import { GateFlow } from './gate';
import { onMotionChange, reducedMotion } from '../motion';

const LAST_KEY = 'margin:last-shader';

/** 首页背景层：WebGL 着色器（半分辨率、约 60fps（掉帧自动降到 30）、隐藏时暂停）或自定义图片 */
export class BackgroundLayer {
  readonly el = h('div', { class: 'bg', 'aria-hidden': 'true' });
  private canvas = h('canvas', {});
  private img = h('div', { class: 'bg-img' });
  private gl: WebGLRenderingContext | null = null;
  private prog: ShaderProgram | null = null;
  private raf = 0;
  private last = 0;
  private start = performance.now();
  private current: ShaderId | null = null;
  private theme: 'light' | 'dark' = 'dark';
  private palette: Palette = 'classic';
  private cfg!: Background;
  private lens: GlassLens | null = null;
  private lensEl: HTMLElement | null = null;
  private pending = 0;

  constructor() {
    this.el.append(this.canvas, this.img, h('div', { class: 'bg-scrim' }));
    // #31：设置没变时 chrome.storage.onChanged 不会触发，换图后得靠这个事件立刻重读到新图
    addEventListener('margin:bg-image', () => this.reloadImage());
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.loop()));
    new ResizeObserver(([e]) => { this.size = { w: e.contentRect.width, h: e.contentRect.height }; this.resize(); }).observe(this.el);
    onMotionChange(() => {
      this.stop();
      this.syncLens();
      if (this.cfg?.mode === 'random' || this.cfg?.mode === 'fixed') {
        if (reducedMotion()) { this.kFrom = this.kTo = this.theme === 'dark' ? 1 : 0; this.kT0 = 0; }
        this.draw(performance.now());
        this.loop();
      }
    });
  }
  /** 昼夜切换的调色板插值，时长/缓动和日月按钮一致（1740ms，cubic-bezier(.65,0,.35,1)） */
  fadeMs = 1740;
  private kFrom = 0; private kTo = 0; private kT0 = 0;
  private kNow(now: number): number {
    if (!this.kT0) return this.kTo;
    const x = Math.min(1, (now - this.kT0) / this.fadeMs);
    if (x >= 1) { this.kT0 = 0; return this.kTo; }
    const e = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    return this.kFrom + (this.kTo - this.kFrom) * e;
  }

  async apply(cfg: Background, theme: 'light' | 'dark', palette: Palette = 'classic'): Promise<void> {
    this.palette = palette;
    const first = !this.cfg;
    const prevMode = this.cfg?.mode;
    this.cfg = cfg;
    const target = theme === 'dark' ? 1 : 0;
    if (!first && theme !== this.theme && !reducedMotion() && !this.soft) { this.kFrom = this.kNow(performance.now()); this.kTo = target; this.kT0 = performance.now(); }
    else { this.kFrom = this.kTo = target; this.kT0 = 0; }
    this.theme = theme;
    this.el.dataset.mode = cfg.mode;
    this.el.style.setProperty('--bg-o', String(cfg.intensity));
    if (cfg.mode === 'off') { this.stop(); this.syncLens(); return; }
    if (cfg.mode === 'image') {
      this.stop(); this.syncLens();
      const r = await chrome.storage.local.get(BG_IMAGE_KEY);
      const url = r[BG_IMAGE_KEY] as string | undefined;
      this.img.style.backgroundImage = url ? `url("${url}")` : '';
      if (!url) this.el.dataset.mode = 'off';
      return;
    }
    let id: ShaderId = cfg.shader;
    if (cfg.mode === 'random') {
      if (first || prevMode !== 'random' || !this.current) {
        const prev = localStorage.getItem(LAST_KEY);
        const allowed = cfg.pool?.length ? SHADER_IDS.filter((s) => cfg.pool!.includes(s)) : SHADER_IDS;
        const pool = allowed.length > 1 ? allowed.filter((s) => s !== prev) : allowed;
        id = pool[Math.floor(Math.random() * pool.length)];
        localStorage.setItem(LAST_KEY, id);
      } else id = this.current;
    }
    this.use(id);
    this.syncLens();
    this.draw(performance.now());
    this.loop();
  }

  get shader(): ShaderId | null { return this.current; }

  /** #31：换了背景图但设置没变（mode 本来就是 image）时，重新读一次存储 */
  reloadImage(): void {
    if (this.cfg?.mode !== 'image') return;
    void chrome.storage.local.get(BG_IMAGE_KEY).then((r) => {
      const url = r[BG_IMAGE_KEY] as string | undefined;
      this.img.style.backgroundImage = url ? `url("${url}")` : '';
      if (!url) this.el.dataset.mode = 'off';
    });
  }

  /** 让某个元素成为「液态玻璃」：背景着色器在它的位置做透镜折射（bubbbly GitHub Glass Card 的做法） */
  setLens(el: HTMLElement | null): void {
    this.lensEl?.removeAttribute('data-lens');
    this.lensEl = el;
    this.syncLens();
  }

  /** 滚动等让透镜位置变化时调用：下一帧立刻重画，不等 30fps 节拍 */
  redraw(): void {
    if (reducedMotion() || this.pending || !this.lensEl?.hasAttribute('data-lens') || document.hidden) return;
    this.pending = requestAnimationFrame(() => { this.pending = 0; this.draw(performance.now(), true); });
  }

  /** 没有显卡加速（SwiftShader / llvmpipe 等软件渲染）时：背景只画静止的一帧，不做玻璃透镜。
   *  软件合成下画布每变一次都要整张回读，动画和滚动时的透镜会把主线程拖到个位数帧率 */
  private soft = false;

  private syncLens(): void {
    const on = !this.soft && !reducedMotion() && !!this.lensEl && !!this.prog && (this.cfg?.mode === 'random' || this.cfg?.mode === 'fixed');
    this.lensEl?.toggleAttribute('data-lens', on);
  }

  private use(id: ShaderId): void {
    if (!this.gl) {
      this.gl = this.canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
      if (!this.gl) { this.el.dataset.mode = 'off'; return; }
      setupQuad(this.gl);
      this.soft = isSoftwareGl(this.gl);
      if (this.soft) this.el.dataset.soft = '';
    }
    if (id === this.current && this.prog) return;
    if (this.prog) this.gl.deleteProgram(this.prog.prog);
    if (id === 'gate') this.mountGate(); else this.unmountGate();
    if (this.flux && id !== 'flux') { this.flux.dispose(); this.flux = null; this.gl.deleteTexture(this.fluxTex); this.fluxTex = null; }
    this.prog = new ShaderProgram(this.gl, id);
    this.prog.bind();
    this.current = id;
    this.el.dataset.shader = id;
    this.resize();
  }

  /** 由 ResizeObserver 写入；还没回调时按视口算（背景铺满视口），避免读布局（v0.44） */
  private size: { w: number; h: number } | null = null;
  private resize(): void {
    const r = { width: this.size?.w || innerWidth, height: this.size?.h || innerHeight };
    // 背景本身很柔和：缓冲区最宽 640px，再由 CSS 放大，肉眼看不出差别，GPU 负担小很多
    const scale = Math.min(0.5, 640 / Math.max(1, r.width));
    const W = Math.max(1, Math.round(r.width * scale)), H = Math.max(1, Math.round(r.height * scale));
    if (this.canvas.width !== W) this.canvas.width = W;
    if (this.canvas.height !== H) this.canvas.height = H;
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gate?.resize(r.width, r.height);
    this.draw(performance.now());
  }

  /** 汇流：Canvas 2D 叠层（整像素清晰的点线），GL 只铺底色 */
  private gate: GateFlow | null = null;
  private gateT = 0;
  private focusEl: HTMLElement | null = null;
  private onGateClick = (e: PointerEvent): void => { if (e.isPrimary && !reducedMotion()) this.gate?.explode(e.clientX, e.clientY); };
  /** 汇流款的汇聚点：元素中心（首页是搜索栏）；不设时是屏幕中心 */
  setFocus(el: HTMLElement | null): void { this.focusEl = el; }
  private mountGate(): void {
    if (this.gate) return;
    const g = new GateFlow();
    g.focus = () => {
      const el = this.focusEl;
      if (!el || !el.isConnected) return null;
      const r = el.getBoundingClientRect(), b = this.el.getBoundingClientRect();
      if (!r.width) return null;
      return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top };
    };
    this.gate = g;
    this.gateT = 0;
    this.el.insertBefore(g.canvas, this.img);
    const r = this.el.getBoundingClientRect();
    g.resize(r.width, r.height);
    window.addEventListener('pointerdown', this.onGateClick, { passive: true });
  }
  private unmountGate(): void {
    if (!this.gate) return;
    this.gate.canvas.remove();
    this.gate = null;
    window.removeEventListener('pointerdown', this.onGateClick);
  }

  /** 上一帧画进纹理的着色器状态；滚动时着色器本身不动，只需要把纹理按新位置重新做一次透镜 */
  private texKey = '';
  private hadRect = false;

  private draw(now: number, moveOnly = false): void {
    if (!this.gl || !this.prog) return;
    const gl = this.gl, w = this.canvas.width, hh = this.canvas.height;
    const still = reducedMotion();
    const t = still ? 12 : (now - this.start) / 1000;
    const rect = this.lensRect();
    // 滚动触发、而玻璃一直在屏幕外：画面没有变化，什么都不用画
    if (moveOnly && !rect && !this.hadRect) return;
    this.hadRect = !!rect;
    // 有玻璃时由 GL 自己合成强度和遮罩（canvas 满不透明），没有时走原来的 CSS opacity + scrim
    this.el.toggleAttribute('data-composite', !!rect);
    const k = this.kNow(now);
    if (!rect) { this.texKey = ''; this.shade(w, hh, t, k); return; }
    this.lens ??= new GlassLens(gl);
    const key = `${this.current}|${w}x${hh}|${k}`;
    if (!moveOnly || this.texKey !== key) {
      this.shade(w, hh, t, k, () => this.lens!.target(w, hh));
      this.texKey = key;
    }
    this.lens.present(w, hh, rect, k, this.cfg.intensity);
  }

  /** 画一帧着色器。流光款先让 WebGPU 推进一帧，再把结果上传成纹理交给 GL 程序 */
  private shade(w: number, hh: number, t: number, k: number, bindTarget?: () => void): void {
    const prog = this.prog!;
    if (this.current === 'flux') this.stepFlux(w, hh, t, k);
    bindTarget?.();
    prog.bind();
    prog.draw(w, hh, t, k);
    if (this.gate) {
      // 原版按 60fps 每帧推进固定步长；这里按真实间隔折算，降到 30fps 时速度不变
      const now = performance.now();
      const step = this.gateT ? Math.min(4, (now - this.gateT) / (1000 / 60)) : 1;
      this.gateT = now;
      const still = reducedMotion();
      this.gate.render(still ? 0 : step, k, !still);
    }
  }

  private flux: FluxField | null = null;
  private fluxLoading = false;
  private fluxFailed = false;
  private fluxTex: WebGLTexture | null = null;
  private stepFlux(w: number, hh: number, t: number, k: number): void {
    const gl = this.gl!, prog = this.prog!;
    if (reducedMotion()) return;
    if (!this.flux) {
      if (this.soft || this.fluxLoading || this.fluxFailed || !('gpu' in navigator)) return;
      this.fluxLoading = true;
      // 单独打包的 flux.js，只在选中流光时才下载/解析
      import(/* @vite-ignore */ chrome.runtime.getURL('flux.js'))
        .then(async (mod: { FluxField: new () => FluxField }) => {
          const f = new mod.FluxField();
          const ok = await f.start();
          if (!ok) this.fluxFailed = true;  // 这台机器没有 WebGPU：本页不再重试，一直用 WebGL 版
          if (!ok || this.current !== 'flux') { f.dispose(); return; }
          this.flux = f;
          this.draw(performance.now());
        })
        .catch((e) => { this.fluxFailed = true; console.info('[MARGIN] 流光加载失败，使用 WebGL 版', e); })
        .finally(() => { this.fluxLoading = false; });
      return;
    }
    const L = PALETTES.light.flux!, D = PALETTES.dark.flux!;
    const m = (a: readonly number[], b: readonly number[]) => a.map((v, i) => v + (b[i] - v) * k) as unknown as [number, number, number];
    const ok = this.flux.render(w, hh, t, { bg: m(L.bg, D.bg), c1: m(L.c[0], D.c[0]), c2: m(L.c[1], D.c[1]), c3: m(L.c[2], D.c[2]) }, k);
    if (!ok) { prog.tex = null; if (!this.flux.ready) { this.flux.dispose(); this.flux = null; this.fluxFailed = true; } return; }
    if (!this.fluxTex) {
      this.fluxTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.fluxTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fluxTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.flux.canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    prog.tex = this.fluxTex;
  }

  /** 透镜元素在画布上的矩形（画布像素，y 向上）；不可见时返回 null */
  private lensRect(): { x: number; y: number; w: number; h: number; r: number; px: number } | null {
    const el = this.lensEl;
    if (!el || !el.hasAttribute('data-lens')) return null;
    const b = this.el.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.bottom < b.top || r.top > b.bottom || r.width < 2) return null;
    const k = this.canvas.width / Math.max(1, b.width);
    // 圆角只在换元素/尺寸变化时读一次：每帧 getComputedStyle 会在滚动中强制样式重算
    if (this.radFor !== el || this.radW !== r.width) { this.radFor = el; this.radW = r.width; this.rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 18; }
    const rad = this.rad;
    return { x: (r.left - b.left) * k, y: (b.bottom - r.bottom) * k, w: r.width * k, h: r.height * k, r: rad * k, px: k };
  }

  private radFor: HTMLElement | null = null;
  private radW = 0;
  private rad = 18;
  /** 帧间隔：默认约 60fps；连续掉帧（GPU 跟不上）时自动降到约 30fps，恢复后再升回去 */
  private frameMs = 1000 / 60;
  private nextFrame = 0;
  private slow = 0;
  private fastRun = 0;

  /**
   * 暂停原因（v0.43）：播放视频、全屏等场景；只要还有一个原因在，背景就停在当前帧。
   * 背景停着，上面那些毛玻璃也就不用每帧重算模糊。
   */
  private holds = new Set<string>();
  hold(reason: string, on: boolean): void {
    if (on === this.holds.has(reason)) return;
    if (on) { this.holds.add(reason); this.stop(); }
    else { this.holds.delete(reason); this.loop(); }
  }
  /** 帧率上限（v0.43）：首屏之外背景大多被卡片盖住，降到 30fps */
  private capMs = 0;
  cap(fps: number): void { this.capMs = fps > 0 ? 1000 / fps : 0; }

  private loop = (): void => {
    if (this.soft || this.holds.size) return;
    if (this.raf || !this.cfg || (this.cfg.mode !== 'random' && this.cfg.mode !== 'fixed') || document.hidden) return;
    if (reducedMotion() && !this.kT0) return;
    const tick = (now: number) => {
      this.raf = 0;
      // 开场盖住整页时不画，开场一结束接着画
      if (introActive()) { onIntroEnd(() => this.loop()); return; }
      if (now + 0.1 >= this.nextFrame) {
        const gap = now - this.last;
        this.last = now;
        const t0 = performance.now();
        this.draw(now);
        const cost = performance.now() - t0;
        if (gap < 200 && (cost > 6 || gap > this.frameMs * 1.8)) this.slow++; else this.slow = Math.max(0, this.slow - 0.25);
        if (this.slow > 30 && this.frameMs < 30) { this.frameMs = 1000 / 30; this.slow = 0; }
        else if (this.frameMs > 30 && this.slow === 0 && gap < 40) { this.fastRun++; if (this.fastRun > 600) { this.frameMs = 1000 / 60; this.fastRun = 0; } }
        else this.fastRun = 0;
        // Advance the deadline instead of restarting the interval on each drawn frame.
        // Restarting rounds 60fps down to 48fps on 144Hz displays.
        const fm = Math.max(this.frameMs, this.capMs);
        if (!this.nextFrame || now - this.nextFrame > fm * 2) this.nextFrame = now;
        this.nextFrame += fm;
      }
      if (reducedMotion() && !this.kT0) return;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  };

  private stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.nextFrame = 0;
  }
}

/** 压缩上传的图片为 JPEG dataURL（最长边 2400px） */
export async function compressImage(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

function isSoftwareGl(gl: WebGLRenderingContext): boolean {
  try { if (localStorage.getItem('margin:force-gl')) return false; } catch { /* ignore */ }
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);
}
