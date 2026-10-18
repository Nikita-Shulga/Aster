'use strict';
// Generates README artwork from the real UI in preview mode (sample data only):
//   docs/images/hero-{light,dark}.png, how-it-works-{light,dark}.svg, and screenshot pairs.
// Run with: electron scripts/readme-assets.cjs && electron scripts/readme-assets.cjs --hero-only
// (the hero step runs separately: Electron fails to load a new offscreen window right after another closes).
const {app, BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'docs', 'images');
const RENDERER = path.join(__dirname, '..', 'src', 'renderer', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const THEMES = {
  light: {bg1: '#FAFAFB', bg2: '#F1EEFF', glow: 'rgba(124,109,255,.20)', card: '#FFFFFF', stroke: '#E4E4E7', title: '#18181B', text: '#52525B', faint: '#71717A', accent: '#5B4CF0', soft: '#EEECFF', green: '#0D7A3B', greenSoft: '#E6F6EC', amber: '#9A6200', amberSoft: '#FFF4DD', red: '#B32424', redSoft: '#FDECEC'},
  dark: {bg1: '#0A0A0B', bg2: '#14111F', glow: 'rgba(124,109,255,.30)', card: '#1A1A1F', stroke: '#2A2A31', title: '#F5F5F7', text: '#C4C4CC', faint: '#8A8A93', accent: '#9A8FFF', soft: 'rgba(124,109,255,.16)', green: '#5AD690', greenSoft: 'rgba(46,194,107,.14)', amber: '#F4C060', amberSoft: 'rgba(240,169,43,.14)', red: '#FF8080', redSoft: 'rgba(240,82,82,.14)'}
};
const FONT = `Inter, 'Segoe UI', -apple-system, Helvetica, Arial, sans-serif`;

function diagram(t) {
  const steps = [
    {n: 1, title: 'Scan', lines: ['Read-only. Nothing', 'changes while Aster', 'looks around.'], icon: 'M-14 -2a12 12 0 1 0 24 0a12 12 0 1 0 -24 0M7 7l10 10'},
    {n: 2, title: 'Explain', lines: ['Every item says what', 'it is, what you lose', 'and whether it’s safe.'], icon: 'M-14 -12h28M-14 -2h28M-14 8h18'},
    {n: 3, title: 'You choose', lines: ['See before → after.', 'Untick anything you', 'want to keep.'], icon: 'M-13 0l8 8l18 -18'},
    {n: 4, title: 'Clean safely', lines: ['Caches are deleted, your', 'files go to the Trash,', 'registry is backed up.'], icon: 'M-12 -12h24l-2 26h-20zM-16 -12h32M-5 -18h10'}
  ];
  const W = 1280, H = 330, cw = 262, gap = (W - 80 - cw * 4) / 3;
  const verdicts = [['Safe to delete', t.green, t.greenSoft], ['Read first', t.amber, t.amberSoft], ['Better to keep', t.red, t.redSoft]];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="How Aster works: scan read-only, explain every item, you choose with a before and after preview, then clean safely with backups and the Trash.">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.bg1}"/><stop offset="1" stop-color="${t.bg2}"/></linearGradient>
  <marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="${t.accent}"/></marker></defs>
  <rect width="${W}" height="${H}" rx="24" fill="url(#bg)"/>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="23.5" fill="none" stroke="${t.stroke}"/>
  ${steps.map((s, i) => {
    const x = 40 + i * (cw + gap), y = 40;
    return `<g>
    <rect x="${x}" y="${y}" width="${cw}" height="200" rx="18" fill="${t.card}" stroke="${t.stroke}"/>
    <rect x="${x + 22}" y="${y + 22}" width="52" height="52" rx="14" fill="${t.soft}"/>
    <g transform="translate(${x + 48} ${y + 48})" fill="none" stroke="${t.accent}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="${s.icon}"/></g>
    <text x="${x + cw - 24}" y="${y + 58}" text-anchor="end" fill="${t.faint}" font-family="${FONT}" font-size="15" font-weight="600">STEP ${s.n}</text>
    <text x="${x + 24}" y="${y + 112}" fill="${t.title}" font-family="${FONT}" font-size="26" font-weight="600" letter-spacing="-0.5">${s.title}</text>
    ${s.lines.map((l, k) => `<text x="${x + 24}" y="${y + 142 + k * 22}" fill="${t.text}" font-family="${FONT}" font-size="16.5">${l}</text>`).join('')}
    </g>${i < 3 ? `<path d="M${x + cw + 8} ${y + 100}H${x + cw + gap - 10}" stroke="${t.accent}" stroke-width="3" marker-end="url(#ar)"/>` : ''}`;
  }).join('\n  ')}
  <g transform="translate(${40 + cw + gap} 268)">
    <text x="0" y="17" fill="${t.faint}" font-family="${FONT}" font-size="15.5">Every item gets a verdict:</text>
    ${verdicts.map(([label, fg, bgc], k) => { const x = 190 + k * 170; return `<rect x="${x}" y="-4" width="${label.length * 8.6 + 26}" height="30" rx="15" fill="${bgc}"/><text x="${x + 13}" y="16" fill="${fg}" font-family="${FONT}" font-size="15" font-weight="600">${label}</text>`; }).join('')}
  </g>
</svg>`;
}

async function capture(win, name) {
  await sleep(700);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG());
  console.log('captured', name);
  return img;
}

let heroWin = null;
async function heroComposite(shotPng, theme) {
  const t = THEMES[theme];
  const W = 1640, H = 1020;
  const html = `<html><body style="margin:0;width:${W}px;height:${H}px;overflow:hidden;background:linear-gradient(180deg,${t.bg1},${t.bg2});font-family:${FONT}">
    <div style="position:absolute;left:50%;top:44%;width:1300px;height:900px;transform:translate(-50%,-50%);background:radial-gradient(closest-side,${t.glow},transparent);"></div>
    <div style="position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);width:1452px;border-radius:18px;overflow:hidden;box-shadow:0 40px 90px rgba(30,20,90,${theme === 'dark' ? '.55' : '.22'}),0 0 0 1px ${t.stroke}">
      <img src="hero-shot-${theme}.png" style="display:block;width:100%">
    </div></body></html>`;
  // One offscreen window for every render: creating a second one right after destroying the first fails to load.
  heroWin ||= new BrowserWindow({width: W, height: H, show: false, useContentSize: true, webPreferences: {offscreen: true}});
  const win = heroWin;
  win.webContents.setFrameRate(30);
  const dir = fs.mkdtempSync(path.join(OUT, '.hero-'));
  const tmp = path.join(dir, 'hero.html');
  fs.writeFileSync(path.join(dir, `hero-shot-${theme}.png`), shotPng);
  fs.writeFileSync(tmp, html);
  await win.loadFile(tmp);
  await sleep(800);
  fs.writeFileSync(path.join(OUT, `hero-${theme}.png`), (await win.webContents.capturePage()).toPNG());
  fs.rmSync(dir, {recursive: true, force: true});
  console.log('hero', theme);
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, {recursive: true});
  for (const theme of ['light', 'dark']) fs.writeFileSync(path.join(OUT, `how-it-works-${theme}.svg`), diagram(THEMES[theme]));
  if (process.argv.includes('--hero-only')) {
    for (const theme of ['light', 'dark']) await heroComposite(fs.readFileSync(path.join(OUT, `overview-${theme}.png`)), theme);
    return app.quit();
  }

  const win = new BrowserWindow({width: 1320, height: 840, show: false, useContentSize: true, webPreferences: {contextIsolation: true, sandbox: true, offscreen: true, backgroundThrottling: false}});
  win.webContents.setFrameRate(30);
  await win.loadFile(RENDERER);
  const js = code => win.webContents.executeJavaScript(code, true);
  await sleep(1200);
  await js(`document.querySelector('.demo-banner')?.remove()`);
  await js(`document.querySelector('[data-action=scan]').click()`);
  await sleep(2800);

  const shots = {};
  for (const theme of ['light', 'dark']) {
    await js(`asterApplyTheme('${theme}'); asterNavigate('overview'); document.querySelector('.content').scrollTop = 0`);
    shots[theme] = (await capture(win, `overview-${theme}`)).toPNG();
  }
  // Cleaner with one item expanded to show the explanation
  await js(`asterNavigate('cleaner')`); await sleep(600);
  await js(`document.querySelector('[data-action=toggleResult]')?.click()`); await sleep(300);
  for (const theme of ['light', 'dark']) { await js(`asterApplyTheme('${theme}'); document.querySelector('.content').scrollTop = 120`); await capture(win, `cleaner-${theme}`); }
  await js(`asterNavigate('programs')`); await sleep(900);
  for (const theme of ['light', 'dark']) { await js(`asterApplyTheme('${theme}')`); await capture(win, `programs-${theme}`); }
  await js(`asterNavigate('optimize')`); await sleep(900);
  for (const theme of ['light', 'dark']) { await js(`asterApplyTheme('${theme}'); document.querySelector('.content').scrollTop = 0`); await capture(win, `optimize-${theme}`); }
  await js(`asterNavigate('disk')`); await sleep(400);
  await js(`document.querySelector('[data-action=analyze]').click()`); await sleep(2600);
  for (const theme of ['light', 'dark']) { await js(`asterApplyTheme('${theme}')`); await capture(win, `disk-${theme}`); }
  await js(`asterNavigate('registry')`); await sleep(500);
  await js(`document.querySelector('.issue-group-head[data-id=muicache]')?.click()`); await sleep(300);
  for (const theme of ['light', 'dark']) { await js(`asterApplyTheme('${theme}'); document.querySelector('.content').scrollTop = 0`); await capture(win, `registry-${theme}`); }
  win.destroy();

  app.quit();
});
