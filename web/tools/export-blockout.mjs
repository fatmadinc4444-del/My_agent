// Writes docs/blockout/{room,character}_blockout.glb using the running dev server.
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
mkdirSync('../docs/blockout', { recursive: true });
for (const what of ['room']) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://localhost:5173/?view=export&what=${what}`);
  await page.waitForFunction('window.__shotReady === true', null, { timeout: 120000 });
  const b64 = await page.evaluate('window.__export');
  const buf = Buffer.from(b64, 'base64');
  writeFileSync(`../docs/blockout/${what}_blockout.glb`, buf);
  console.log(what, buf.length);
  await page.close();
}
await browser.close();
