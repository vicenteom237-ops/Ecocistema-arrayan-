// Genera los íconos PNG de la app a partir de public/icons/icon.svg (requiere Playwright).
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'public', 'icons', 'icon.svg'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shot = async (size, file, pad = 0) => {
    await page.setViewportSize({ width: size, height: size });
    const bg = pad ? '#2F4A3A' : 'transparent';
    await page.setContent(`<html><body style="margin:0;background:${bg};display:grid;place-items:center;height:100vh">
      <div style="width:${size - pad * 2}px;height:${size - pad * 2}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
    await page.screenshot({ path: path.join(__dirname, '..', 'public', 'icons', file), omitBackground: !pad });
  };
  await shot(192, 'icon-192.png');
  await shot(512, 'icon-512.png');
  await shot(512, 'icon-maskable-512.png', 56);
  await browser.close();
})();
