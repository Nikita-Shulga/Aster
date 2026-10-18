'use strict';
// Development self-test: drives the real window through read-only flows and saves captures.
// Usage: ASTER_SELFTEST=<output folder> electron .
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function selftest(win, outDir) {
  fs.mkdirSync(outDir, {recursive: true});
  const wc = win.webContents;
  const errors = [];
  wc.on('console-message', (_e, level, message) => { if (level >= 2) errors.push(message); });
  const js = code => wc.executeJavaScript(code, true);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (expr, timeout = 60000) => { const t = Date.now(); while (Date.now() - t < timeout) { if (await js(expr).catch(() => false)) return true; await sleep(250); } return false; };
  const shot = async name => { wc.invalidate(); await sleep(700); const img = await wc.capturePage(); fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG()); };
  const log = (...a) => console.log('[selftest]', ...a);

  win.setSize(1320, 860);
  wc.setBackgroundThrottling(false);
  await waitFor('!!document.querySelector(".nav-item")');
  await waitFor('!!document.querySelector(".spec")', 20000);
  await shot('01-overview');

  const pages = [
    ['cleaner', '.rule-app', 'document.querySelector(".empty [data-action=analyze]")?.click(), true', '.cleaner-summary'],
    ['cleaner', '.result-item', 'document.querySelector("[data-action=toggleResult]")?.click(), true', '.detail-panel'],
    ['registry', '.issue-group, .empty', 'document.querySelector(".empty [data-action=scan]")?.click(), true', '.issue-group'],
    ['optimize', '.tweak'],
    ['wsettings', '.tweak'],
    ['programs', 'tbody tr'],
    ['disk', '.drive-pick'],
    ['duplicates', '.drive-pick'],
    ['updates', '.empty, .list-row'],
    ['startup', 'tbody tr'],
    ['history', '.list-row, .empty'],
    ['tools', '.tool'],
    ['settings', '.setting']
  ];
  let n = 2;
  for (const [id, ready, action, after] of pages) {
    await js(`asterNavigate('${id}')`);
    const ok = await waitFor(`!!document.querySelector('${ready}')`, 60000);
    log(id, ok ? 'rendered' : 'TIMEOUT');
    if (action) { await js(action); if (after) log(id, 'action', (await waitFor(`!!document.querySelector('${after}')`, 120000)) ? 'done' : 'TIMEOUT'); }
    await sleep(id === 'programs' || id === 'startup' ? 2500 : 300);
    await shot(`${String(n++).padStart(2, '0')}-${id}`);
  }
  if (process.platform === 'win32') {
    await js(`asterNavigate('registry')`); await sleep(300);
    await js(`document.querySelector('[data-tab=editor]').click()`);
    log('regedit', (await waitFor(`!!document.querySelector('.reg-values tbody tr')`, 30000)) ? 'rendered' : 'TIMEOUT');
    await shot(`${String(n++).padStart(2, '0')}-regedit`);
  }
  // Disk analyzer on the user's home folder (read-only).
  await js(`asterNavigate('disk')`); await sleep(500);
  if (process.env.ASTER_SELFTEST_DISK) {
    await js(`document.querySelector('[data-action=analyze]')?.click()`);
    log('disk', (await waitFor(`!!document.querySelector('.treemap .tm-cell')`, 240000)) ? 'analyzed' : 'TIMEOUT');
    await sleep(2500);
    await shot(`${String(n++).padStart(2, '0')}-disk-result`);
  }
  // Full Smart Scan exercises every backend at once (read-only).
  await js(`asterNavigate('overview')`); await sleep(500);
  await js(`document.querySelector('[data-action=scan]')?.click()`);
  log('smartscan', (await waitFor(`!document.querySelector('.scan-step.running') && !!document.querySelector('.scan-step')`, 300000)) ? 'done' : 'TIMEOUT');
  const steps = await js(`[...document.querySelectorAll('.scan-step')].map(s => s.className.replace('scan-step', '').trim() + ':' + s.textContent.trim())`);
  log('smartscan steps', JSON.stringify(steps));
  await shot(`${String(n++).padStart(2, '0')}-smartscan`);
  await js(`asterApplyTheme('light'); asterNavigate('overview')`);
  await sleep(1200);
  await shot(`${String(n++).padStart(2, '0')}-overview-light`);
  const summary = await js(`({cleaner: document.querySelector('.cleaner-summary .big')?.textContent, nav: [...document.querySelectorAll('.nav-item .badge')].map(b => b.textContent)})`);
  log('summary', JSON.stringify(summary));
  log('console errors', errors.length ? errors.join(' | ') : 'none');
};
