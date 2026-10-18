'use strict';
// Renders assets/icon.svg to icon.png (512) and a multi-size icon.ico. Run with: electron scripts/build-icons.cjs
const {app, BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const assets = path.join(__dirname, '..', 'assets');
const svg = fs.readFileSync(path.join(assets, 'icon.svg'), 'utf8');

async function render(size) {
  const win = new BrowserWindow({width: size, height: size, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: {offscreen: true}});
  const file = path.join(app.getPath('temp'), `aster-icon-${size}.html`);
  fs.writeFileSync(file, `<html><body style="margin:0;background:transparent;overflow:hidden">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await win.loadFile(file);
  await new Promise(r => setTimeout(r, 400));
  const image = await win.webContents.capturePage({x: 0, y: 0, width: size, height: size});
  win.destroy();
  fs.rmSync(file, {force: true});
  return image;
}

// ICO with PNG-compressed entries (supported since Windows Vista).
function ico(pngs) {
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({size, data}, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map(p => p.data)]);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const big = await render(1024);
  fs.writeFileSync(path.join(assets, 'icon.png'), big.toPNG()); // 1024 px, used for the macOS .icns
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const pngs = [];
  // Downscale progressively (halving) so small sizes stay crisp.
  const scaled = size => { let img = big; let s = 1024; while (s / 2 >= size) { s /= 2; img = img.resize({width: s, height: s, quality: 'best'}); } return s === size ? img : img.resize({width: size, height: size, quality: 'best'}); };
  for (const size of sizes) pngs.push({size, data: scaled(size).toPNG()});
  fs.writeFileSync(path.join(assets, 'icon.ico'), ico(pngs));
  console.log('icons written:', sizes.join(', '));
  app.quit();
});
