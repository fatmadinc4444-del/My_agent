// Usage: node tools/shot.mjs <url> <out.png> [width] [height] [waitMs]
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
const [url, out, w = '1280', h = '720', wait = '1500'] = process.argv.slice(2);
const cands = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'];
const executablePath = cands.find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
try {
  await page.waitForFunction('window.__shotReady === true', null, { timeout: 60000 });
} catch {
  logs.push('timeout waiting for __shotReady');
}
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
console.log(logs.slice(-30).join('\n'));
await browser.close();
