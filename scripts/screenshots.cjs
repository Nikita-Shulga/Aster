'use strict';
// Captures README screenshots from the renderer in preview mode (sample data only).
// Run with: electron scripts/screenshots.cjs
const {app, BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const out = path.join(__dirname, '..', 'docs', 'screenshots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(out, {recursive: true});
  const win = new BrowserWindow({width: 1320, height: 840, show: false, useContentSize: true, webPreferences: {contextIsolation: true, sandbox: true, offscreen: true, backgroundThrottling: false}});
  win.webContents.setFrameRate(30);
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  const js = code => win.webContents.executeJavaScript(code, true);
  const shot = async (name, theme = 'light') => {
    await js(`asterApplyTheme('${theme}'); document.querySelector('.demo-banner')?.remove(); document.querySelector('.content').scrollTop = 0;`);
    await sleep(700);
    fs.writeFileSync(path.join(out, `${name}.png`), (await win.webContents.capturePage()).toPNG());
    console.log('captured', name);
  };
  await sleep(1200);
  await js(`document.querySelector('[data-action=scan]').click()`);
  await sleep(2600);
  await shot('overview', 'dark');
  await shot('overview-light', 'light');
  await js(`asterNavigate('cleaner')`); await sleep(500);
  await shot('cleaner', 'dark');
  await js(`asterNavigate('registry')`); await sleep(500);
  await js(`document.querySelector('.issue-group-head[data-id=muicache]')?.click()`); await sleep(300);
  await shot('registry', 'light');
  await js(`asterNavigate('optimize')`); await sleep(900);
  await shot('optimize', 'light');
  await js(`asterNavigate('wsettings')`); await sleep(900);
  await shot('wsettings', 'dark');
  await js(`asterNavigate('programs')`); await sleep(900);
  await shot('programs', 'light');
  await js(`asterNavigate('startup')`); await sleep(700);
  await shot('startup', 'dark');
  await js(`asterNavigate('disk')`); await sleep(400);
  await js(`document.querySelector('[data-action=analyze]').click()`); await sleep(2200);
  await shot('disk', 'light');
  app.quit();
});
