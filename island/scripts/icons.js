// Renders build/icon.svg and build/tray.svg to PNGs with Chromium (run: node scripts/icons.js),
// then `convert` (ImageMagick) packs the PNGs into build/icon.ico.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  async function render(svgFile, size, out) {
    const svg = fs.readFileSync(path.join(root, svgFile), 'utf8');
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg style="width:${size}px;height:${size}px;display:block" `)}</body></html>`);
    await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  }
  const tmp = path.join(root, 'build', '.icons');
  fs.mkdirSync(tmp, { recursive: true });
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  for (const s of sizes) await render('build/icon.svg', s, path.join(tmp, `icon-${s}.png`));
  await render('build/icon.svg', 512, path.join(root, 'build', 'icon.png'));
  await render('build/tray.svg', 32, path.join(root, 'src', 'assets', 'tray.png'));
  await browser.close();
  fs.copyFileSync(path.join(tmp, 'icon-256.png'), path.join(root, 'src', 'assets', 'icon.png'));
  execFileSync('convert', sizes.map(s => path.join(tmp, `icon-${s}.png`)).concat([path.join(root, 'build', 'icon.ico')]));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('icons written');
})();
