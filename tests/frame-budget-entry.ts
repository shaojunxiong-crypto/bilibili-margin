import { BackgroundLayer } from '../src/content/bg/background';

/** 只验证实际帧调度，不用模拟计时声称真实 GPU 帧率。 */
export function frameBudget(hz: number): { full: number; capped: number; restored: number } {
  const nativeRaf = requestAnimationFrame, nativeCancel = cancelAnimationFrame;
  let pending: FrameRequestCallback | null = null, handle = 0, frames = 0, time = 0;
  const layer = new BackgroundLayer() as any;
  try {
    window.requestAnimationFrame = (fn) => { pending = fn; return ++handle; };
    window.cancelAnimationFrame = () => { pending = null; };
    layer.cfg = { mode: 'fixed', shader: 'silk', intensity: .6 };
    layer.soft = false;
    layer.draw = () => { frames++; };
    const run = () => {
      const before = frames;
      for (let i = 0; i < hz * 3; i++) {
        time += 1000 / hz;
        const fn = pending; pending = null;
        if (!fn) throw new Error('scheduler unexpectedly stopped');
        fn(time);
      }
      return frames - before;
    };
    layer.loop();
    const full = run(); layer.cap(30);
    const capped = run(); layer.cap(0);
    const restored = run();
    return { full, capped, restored };
  } finally { layer.stop(); window.requestAnimationFrame = nativeRaf; window.cancelAnimationFrame = nativeCancel; }
}
