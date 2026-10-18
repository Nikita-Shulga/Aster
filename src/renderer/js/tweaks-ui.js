import {html, ic, api, app, bytes, modal, toast, isMac} from './lib.js';

export const VERDICT = {
  recommended: {label: 'Recommended', tone: 'green'},
  optional: {label: 'Optional', tone: ''},
  situational: {label: isMac ? 'Depends on your Mac' : 'Depends on your PC', tone: 'amber'},
  preference: {label: 'Personal preference', tone: 'blue'}
};
const RESTART = {explorer: isMac ? 'Restarts Finder' : 'Restarts File Explorer', signout: isMac ? 'After logging out' : 'After sign-out', reboot: 'After restart', apps: 'In apps you open next'};
export const pending = {explorer: false, reboot: false};

export const valueLabel = (t, v) => t.type === 'toggle' ? (v ? t.on : t.off) : (t.options.find(o => o.value === v)?.label ?? '—');
export const isApplied = t => t.recommended !== null && t.value === t.recommended;

export function tweakRow(t) {
  const locked = t.admin && !app.system?.admin && !isMac;
  const v = VERDICT[t.verdict] || VERDICT.optional;
  const suggest = t.recommended !== null && t.value !== null && t.value !== t.recommended;
  return html`<div class="tweak ${suggest ? 'suggest' : ''}">
    <div class="tw-main">
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <span class="tw-title">${t.title}</span>
        <span class="badge ${v.tone}">${v.label}</span>
        ${t.admin ? html`<span class="badge" title="${isMac ? 'macOS asks for your password' : 'Requires administrator rights'}">${ic('lock', 12)} ${isMac ? 'Password' : 'Admin'}</span>` : ''}
        ${t.restart ? html`<span class="badge" title="When the change takes effect">${ic('refresh', 12)} ${RESTART[t.restart]}</span>` : ''}
      </div>
      <p class="tw-what">${t.what}</p>
      ${t.pro || t.con ? html`<div class="procon">
        ${t.pro ? html`<div><span class="pc-k tone-text-green">${ic('check', 13)} You gain</span>${t.pro}</div>` : ''}
        ${t.con ? html`<div><span class="pc-k tone-text-amber">${ic('alert', 13)} Trade-off</span>${t.con}</div>` : ''}
      </div>` : ''}
      ${t.extra?.bytes ? html`<div class="tw-extra">${ic('drive', 13)} hiberfil.sys currently uses <strong>${bytes(t.extra.bytes)}</strong> on your system drive.</div>` : ''}
    </div>
    <div class="tw-ctrl">
      ${t.value === null ? html`<span class="faint" style="font-size:12px">Unavailable</span>`
        : t.type === 'toggle' ? html`<input type="checkbox" class="switch" data-change="tweak" data-id="${t.id}" ${t.value ? 'checked' : ''} ${locked ? 'data-locked="1"' : ''} aria-label="${t.title}">`
        : html`<div class="segmented">${t.options.map(o => html`<button class="${o.value === t.value ? 'on' : ''}" data-action="tweakChoice" data-id="${t.id}" data-value="${JSON.stringify(o.value)}">${o.label}</button>`)}</div>`}
      ${t.value !== null ? html`<span class="tw-now">Now: <strong>${valueLabel(t, t.value)}</strong></span>` : ''}
      ${suggest ? html`<span class="tw-suggest">Aster suggests: ${valueLabel(t, t.recommended)}</span>` : ''}
    </div>
  </div>`;
}

// Applies a tweak after showing exactly what changes. Returns the new value, or null if cancelled.
export async function applyTweak(t, value, {quiet = false} = {}) {
  if (t.admin && !app.system?.admin && !isMac) {
    const {ok} = await modal({title: 'Administrator rights needed', icon: 'shield', confirm: 'Restart as admin', body: `“${t.title}” changes a system-wide setting, so Windows requires administrator rights.`});
    if (ok) window.asterRelaunch();
    return null;
  }
  const preference = t.verdict === 'preference' && !t.con && !t.admin;
  if (!quiet && !preference) {
    const turningOn = t.type === 'toggle' ? value : value === t.recommended;
    const {ok} = await modal({title: t.title, icon: 'sliders', confirm: 'Apply change', body: html`
      <div class="change-preview"><div><span class="faint">Now</span><strong>${valueLabel(t, t.value)}</strong></div>${ic('chevronRight', 18, 'faint')}<div><span class="faint">After</span><strong>${valueLabel(t, value)}</strong></div></div>
      <p style="margin-top:12px">${t.what}</p>
      ${t.type === 'toggle' && (turningOn ? t.con : t.pro) ? html`<div class="callout ${turningOn ? 'amber' : ''}" style="margin-top:10px">${ic(turningOn ? 'alert' : 'info', 16)}<div>${turningOn ? html`<strong>Trade-off:</strong> ${t.con}` : html`<strong>You give up:</strong> ${t.pro}`}</div></div>` : ''}
      ${t.restart ? html`<p class="faint" style="margin-top:10px">${t.restart === 'explorer' ? (isMac ? 'Takes effect after Finder restarts — Aster can do that for you (Finder windows reopen).' : 'Takes effect after File Explorer restarts — Aster can do that for you (open windows of Explorer will close).') : t.restart === 'signout' ? (isMac ? 'Takes effect after you log out and back in.' : 'Takes effect after you sign out and back in.') : t.restart === 'apps' ? 'Applies to apps you open after the change; quit and reopen running apps to see it.' : 'Takes effect after you restart the computer.'}</p>` : ''}
      ${t.admin && isMac ? html`<p class="faint" style="margin-top:6px">macOS will ask for your password.</p>` : ''}
      <p class="faint" style="margin-top:6px">You can switch it back here anytime.</p>`});
    if (!ok) return null;
  }
  const before = t.value;
  const r = await api('tweaks.set', {id: t.id, value});
  t.value = r.value;
  if (t.restart === 'explorer') pending.explorer = true;
  if (t.restart === 'reboot') pending.reboot = true;
  toast(`${t.title}: ${valueLabel(t, before)} → ${valueLabel(t, r.value)}`, {type: 'success'});
  return r.value;
}

export function pendingBanner() {
  if (!pending.explorer && !pending.reboot) return '';
  return html`<div class="callout blue" style="margin-bottom:16px">${ic('refresh', 18)}<div class="grow">${pending.explorer ? (isMac ? 'Some changes appear after Finder restarts. Finder windows close and reopen.' : 'Some changes appear after File Explorer restarts. Explorer windows you have open will close; the taskbar reappears in a second.') : 'Some changes take effect after you restart your computer.'}</div>
    ${pending.explorer ? html`<button class="btn btn-sm btn-secondary" data-action="restartExplorer">Restart ${isMac ? 'Finder' : 'Explorer'} now</button>` : ''}</div>`;
}

export async function restartExplorer(page) {
  await api('explorer.restart');
  pending.explorer = false;
  toast(`${isMac ? 'Finder' : 'File Explorer'} restarted`, {type: 'success'});
  page.update();
}
