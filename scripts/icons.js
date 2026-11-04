// Renders build/icon.svg to the PNG/ICO files used by the app, tray and installer.
// Requires Playwright's Chromium and ImageMagick: node scripts/icons.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
(async () => {
  const svg = fs.readFileSync(path.join(root, 'build', 'icon.svg'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (size, out) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
    await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sa3a-icons-'));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  for (const s of sizes) await render(s, path.join(tmp, `${s}.png`));
  await render(512, path.join(root, 'build', 'icon.png'));
  await render(256, path.join(root, 'src', 'assets', 'icon.png'));
  await render(32, path.join(root, 'src', 'assets', 'tray.png'));
  await browser.close();
  execFileSync('convert', [...sizes.map((s) => path.join(tmp, `${s}.png`)), path.join(root, 'build', 'icon.ico')]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('icons written');
})();
