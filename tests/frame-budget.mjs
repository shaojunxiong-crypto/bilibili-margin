import assert from 'node:assert/strict';
import { build } from 'vite';
import { chromium } from 'playwright';

const bundle = await build({ configFile: false, publicDir: false, logLevel: 'error', build: {
  write: false, minify: false, lib: { entry: 'tests/frame-budget-entry.ts', name: 'frameTest', formats: ['iife'] },
} });
const code = (Array.isArray(bundle) ? bundle[0] : bundle).output.find((x) => x.type === 'chunk').code;
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }) });
try {
  const page = await browser.newPage({ reducedMotion: 'no-preference' });
  await page.addScriptTag({ content: code });
  for (const hz of [60, 120, 144]) {
    const result = await page.evaluate((hz) => frameTest.frameBudget(hz), hz);
    console.log(`scheduler ${hz}Hz: ${JSON.stringify(result)} draws in three-second phases`);
    assert.ok(result.full >= 175 && result.full <= 181, `${hz}Hz initial 60fps cadence`);
    assert.ok(result.capped >= 88 && result.capped <= 92, `${hz}Hz explicit 30fps cap`);
    assert.ok(result.restored >= 174 && result.restored <= 181, `${hz}Hz must resume 60fps immediately after intentional cap`);
  }
} finally { await browser.close(); }
