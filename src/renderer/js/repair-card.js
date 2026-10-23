import {html, ic, api, app, modal, toast, onEvent, isMac, t, th} from './lib.js';

// "Repair Windows" / "Check your disk" card on the Tools page: System File Checker, DISM and a drive error scan on
// Windows; First Aid's check of the startup disk on macOS. Each tool explains what it does and how long it takes,
// shows live progress and ends with a plain verdict and the next step.
const rs = {running: null, pct: null, line: '', results: {}, drive: null, page: null};
const TOOLS = isMac ? ['verify'] : ['sfc', 'dism', 'scan'];

onEvent(e => {
  if (e.channel !== 'repair' || !rs.running) return;
  if (e.pct != null) rs.pct = e.pct;
  if (e.line) rs.line = e.line;
  if (rs.page?.mounted) rs.page.update();
});

function resultBox(id) {
  const r = rs.results[id];
  if (!r) return '';
  const tone = r.state === 'ok' || r.state === 'repaired' ? 'green' : r.state === 'problems' ? 'amber' : r.state === 'scheduled' ? 'blue' : '';
  const key = `repair.${id}.${r.state}`;
  return html`<div class="callout ${tone}" style="margin-top:10px">${ic(tone === 'green' ? 'check' : tone === 'amber' ? 'alert' : 'info', 16)}<div class="grow">${th(key, {count: r.repaired || r.failed || 0, drive: rs.drive || ''})}</div>
    ${id === 'scan' && r.state === 'problems' ? html`<button class="btn btn-secondary btn-sm" data-action="repairRun" data-id="fix">${t('repair.fix.button')}</button>` : ''}
    ${id === 'sfc' && r.state === 'problems' && !isMac ? html`<button class="btn btn-secondary btn-sm" data-action="repairRun" data-id="dism">${t('repair.dism.button')}</button>` : ''}</div>`;
}

export function repairCard() {
  const drives = (app.system?.drives || []).filter(d => d.type !== 'Removable');
  if (!rs.drive) rs.drive = drives.find(d => /^c:/i.test(d.name))?.name || drives[0]?.name || 'C:';
  return html`<div class="card rp" style="margin-bottom:16px">
    <div class="card-head">
      <div class="tile blue" style="width:36px;height:36px">${ic('wrench', 18)}</div>
      <div class="grow"><h3>${t(isMac ? 'repair.titleMac' : 'repair.title')}</h3><div class="sub">${t(isMac ? 'repair.subtitleMac' : 'repair.subtitle')}</div></div>
    </div>
    ${TOOLS.map(id => {
      const running = rs.running === id || (id === 'scan' && rs.running === 'fix');
      return html`<div class="rp-item">
        <div class="row" style="gap:12px;align-items:flex-start">
          <div class="grow"><div class="sd-t">${t(`repair.${id}.title`)} ${isMac ? '' : html`<span class="badge">${t('tools.badge.admin')}</span>`}<span class="faint" style="font-weight:400;font-size:12px">· ${t(`repair.${id}.time`)}</span></div>
            <div class="meta">${t(`repair.${id}.text`)}</div></div>
          ${id === 'scan' && drives.length > 1 ? html`<label class="fchip"><span class="fchip-k">${t('repair.drive')}</span><span class="fchip-v">${rs.drive}</span>${ic('chevronDown', 13)}
            <select data-change="repairDrive" ${rs.running ? 'disabled' : ''}>${drives.map(d => html`<option value="${d.name}" ${d.name === rs.drive ? 'selected' : ''}>${d.name}${d.label ? ` · ${d.label}` : ''}</option>`)}</select></label>` : ''}
          <button class="btn btn-secondary btn-sm" data-action="repairRun" data-id="${id}" ${rs.running ? 'disabled' : ''}>${running ? html`<span class="spinner"></span>` : ''} ${t(running ? 'repair.running' : 'repair.run')}</button>
        </div>
        ${running ? html`<div style="margin-top:10px"><div class="progress ${rs.pct == null ? 'indeterminate' : ''}"><div style="width:${rs.pct ?? 0}%"></div></div>
          <div class="faint truncate" style="font-size:12px;margin-top:6px">${rs.pct != null ? `${Math.round(rs.pct)}% · ` : ''}${rs.line || t('repair.keepOpen')}</div></div>` : resultBox(id)}
      </div>`;
    })}
  </div>`;
}

export const repairHandlers = {
  repairDrive(el) { rs.drive = el.value; delete rs.results.scan; this.update(); },
  async repairRun(el) {
    const id = el.dataset.id;
    rs.page = this;
    const vars = {drive: rs.drive};
    const {ok} = await modal({title: t(`repair.${id}.confirmTitle`, vars), icon: 'wrench', confirm: t(id === 'fix' ? 'repair.fix.confirm' : 'repair.run'), body: html`
      <p>${t(`repair.${id}.confirmBody`, vars)}</p>
      <p class="faint" style="margin-top:8px">${t(isMac ? 'repair.passwordNote' : app.system?.admin ? 'repair.noCancel' : 'repair.uacNote')}</p>`});
    if (!ok) return;
    rs.running = id; rs.pct = null; rs.line = ''; this.update();
    try {
      const r = await api('repair.run', {id, drive: rs.drive});
      rs.results[id === 'fix' ? 'scan' : id] = r;
      toast(t(`repair.${id}.done`), {type: r.state === 'problems' ? 'info' : 'success'});
    } finally { rs.running = null; this.update(); }
  }
};
