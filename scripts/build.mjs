import { build } from 'vite';
import { wgslVitePlugin } from '@vgpu/wgsl/loader-vite';
import { cp, rm, mkdir } from 'node:fs/promises';

// 圆角强度（v0.50，设置 → 布局与细节 → 圆角）：把 CSS 里所有 px / em 圆角改成乘 --margin-rk（html 上设置，默认 1）。
// 百分比圆角（头像、圆点）不动。在构建时统一改，源码保持原样好读。
const RADIUS_RE = /(border(?:-(?:top|bottom)-(?:left|right))?-radius\s*:\s*)([^;}"'`\n!]+)/g;
const radiusPlugin = {
  name: 'margin-radius',
  enforce: 'post',
  transform(code, id) {
    if (!/\.(css|ts)(\?|$)/.test(id) || !code.includes('radius')) return null;
    const out = code.replace(RADIUS_RE, (_m, k, v) => k + v.replace(/(^|[\s(,])(\d*\.?\d+)(px|em)\b/g, (_n, pre, n, u) => (Number(n) === 0 ? `${pre}${n}${u}` : `${pre}calc(${n}${u}*var(--margin-rk,1))`)));
    return out === code ? null : { code: out, map: null };
  },
};

// 经典脚本（IIFE）：内容脚本入口、弹窗、后台 service worker
const entries = [
  { name: 'content', entry: 'src/content/main.ts' },
  { name: 'popup', entry: 'src/popup/popup.ts' },
  { name: 'background', entry: 'src/background/sw.ts' },
];
// 按路由动态 import 的页面模块（ES，共享代码自动拆成 pages/chunk-*.js）
const PAGES = ['home', 'watch', 'space', 'message', 'history', 'feed', 'detail', 'space-hooks'];

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

for (const { name, entry } of entries) {
  await build({
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    plugins: [wgslVitePlugin({ minify: { whitespace: true } }), radiusPlugin],
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      target: 'chrome110',
      minify: !process.env.NOMIN,
      lib: { entry, name: `margin_${name}`, formats: ['iife'], fileName: () => `${name}.js` },
    },
  });
}

await build({
  configFile: false,
  publicDir: false,
  logLevel: 'warn',
  plugins: [wgslVitePlugin({ minify: { whitespace: true } }), radiusPlugin],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome110',
    minify: !process.env.NOMIN,
    lib: {
      entry: Object.fromEntries(PAGES.map((p) => [p, `src/content/pages/${p}.ts`])),
      formats: ['es'],
      fileName: (_f, name) => `pages/${name}.js`,
    },
    rolldownOptions: { output: { minify: !process.env.NOMIN, chunkFileNames: 'pages/chunk-[hash].js' } },
  },
});

// 流光（WebGPU / vgpu，约 200KB）单独打包，只有用户选到这款背景时才由内容脚本动态 import
await build({
  configFile: false,
  publicDir: false,
  logLevel: 'warn',
  plugins: [wgslVitePlugin({ minify: { whitespace: true } }), radiusPlugin],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome113',
    minify: !process.env.NOMIN,
    lib: { entry: 'src/content/bg/flux/index.ts', formats: ['es'], fileName: () => 'flux.js' },
    rolldownOptions: { output: { minify: !process.env.NOMIN } },
  },
});

await cp('public', 'dist', { recursive: true });
console.log('built → dist/');
