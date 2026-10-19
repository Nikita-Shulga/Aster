import {html, ic, api, app, bytes, modal, toast, isMac, t, th} from './lib.js';

// Labels are getters so they follow the interface language.
const verdict = (id, tone) => ({tone, get label() { return t(id === 'situational' && isMac ? 'tweaks.verdict.situationalMac' : `tweaks.verdict.${id}`); }});
export const VERDICT = {
  recommended: verdict('recommended', 'green'),
  optional: verdict('optional', ''),
  situational: verdict('situational', 'amber'),
  preference: verdict('preference', 'blue')
};
const RESTART = {explorer: isMac ? 'tweaks.restart.finder' : 'tweaks.restart.explorer', signout: isMac ? 'tweaks.restart.logout' : 'tweaks.restart.signout', reboot: 'tweaks.restart.reboot', apps: 'tweaks.restart.apps'};
export const pending = {explorer: false, reboot: false};

export const valueLabel = (tw, v) => tw.type === 'toggle' ? (v ? tw.on : tw.off) : (tw.options.find(o => o.value === v)?.label ?? '—');
export const isApplied = tw => tw.recommended !== null && tw.value === tw.recommended;

export function tweakRow(tw) {
  const locked = tw.admin && !app.system?.admin && !isMac;
  const v = VERDICT[tw.verdict] || VERDICT.optional;
  const suggest = tw.recommended !== null && tw.value !== null && tw.value !== tw.recommended;
  return html`<div class="tweak ${suggest ? 'suggest' : ''}">
    <div class="tw-main">
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <span class="tw-title">${tw.title}</span>
        <span class="badge ${v.tone}">${v.label}</span>
        ${tw.admin ? html`<span class="badge" title="${t(isMac ? 'tweaks.passwordHint' : 'tweaks.adminHint')}">${ic('lock', 12)} ${t(isMac ? 'tweaks.password' : 'tweaks.admin')}</span>` : ''}
        ${tw.restart ? html`<span class="badge" title="${t('tweaks.whenHint')}">${ic('refresh', 12)} ${RESTART[tw.restart] ? t(RESTART[tw.restart]) : ''}</span>` : ''}
      </div>
      <p class="tw-what">${tw.what}</p>
      ${tw.pro || tw.con ? html`<div class="procon">
        ${tw.pro ? html`<div><span class="pc-k tone-text-green">${ic('check', 13)} ${t('tweaks.gain')}</span>${tw.pro}</div>` : ''}
        ${tw.con ? html`<div><span class="pc-k tone-text-amber">${ic('alert', 13)} ${t('tweaks.tradeoff')}</span>${tw.con}</div>` : ''}
      </div>` : ''}
      ${tw.extra?.bytes ? html`<div class="tw-extra">${ic('drive', 13)} ${th('tweaks.hiberfil', {size: bytes(tw.extra.bytes)})}</div>` : ''}
    </div>
    <div class="tw-ctrl">
      ${tw.value === null ? html`<span class="faint" style="font-size:12px">${t('tweaks.unavailable')}</span>`
        : tw.type === 'toggle' ? html`<input type="checkbox" class="switch" data-change="tweak" data-id="${tw.id}" ${tw.value ? 'checked' : ''} ${locked ? 'data-locked="1"' : ''} aria-label="${tw.title}">`
        : html`<div class="segmented">${tw.options.map(o => html`<button class="${o.value === tw.value ? 'on' : ''}" data-action="tweakChoice" data-id="${tw.id}" data-value="${JSON.stringify(o.value)}">${o.label}</button>`)}</div>`}
      ${tw.value !== null ? html`<span class="tw-now">${th('tweaks.now', {value: valueLabel(tw, tw.value)})}</span>` : ''}
      ${suggest ? html`<span class="tw-suggest">${t('tweaks.suggests', {value: valueLabel(tw, tw.recommended)})}</span>` : ''}
    </div>
  </div>`;
}

// When a change takes effect, as a sentence for the confirmation dialog.
function restartNote(r) {
  if (r === 'explorer') return t(isMac ? 'tweaks.note.finder' : 'tweaks.note.explorer');
  if (r === 'signout') return t(isMac ? 'tweaks.note.logout' : 'tweaks.note.signout');
  if (r === 'apps') return t('tweaks.note.apps');
  return t('tweaks.note.reboot');
}

// Applies a tweak after showing exactly what changes. Returns the new value, or null if cancelled.
export async function applyTweak(tw, value, {quiet = false} = {}) {
  if (tw.admin && !app.system?.admin && !isMac) {
    const {ok} = await modal({title: t('tweaks.adminTitle'), icon: 'shield', confirm: t('tweaks.adminConfirm'), body: t('tweaks.adminBody', {title: tw.title})});
    if (ok) window.asterRelaunch();
    return null;
  }
  const preference = tw.verdict === 'preference' && !tw.con && !tw.admin;
  if (!quiet && !preference) {
    const turningOn = tw.type === 'toggle' ? value : value === tw.recommended;
    const {ok} = await modal({title: tw.title, icon: 'sliders', confirm: t('tweaks.applyChange'), body: html`
      <div class="change-preview"><div><span class="faint">${t('tweaks.before')}</span><strong>${valueLabel(tw, tw.value)}</strong></div>${ic('chevronRight', 18, 'faint')}<div><span class="faint">${t('tweaks.after')}</span><strong>${valueLabel(tw, value)}</strong></div></div>
      <p style="margin-top:12px">${tw.what}</p>
      ${tw.type === 'toggle' && (turningOn ? tw.con : tw.pro) ? html`<div class="callout ${turningOn ? 'amber' : ''}" style="margin-top:10px">${ic(turningOn ? 'alert' : 'info', 16)}<div>${turningOn ? html`<strong>${t('tweaks.tradeoffLabel')}</strong> ${tw.con}` : html`<strong>${t('tweaks.giveUpLabel')}</strong> ${tw.pro}`}</div></div>` : ''}
      ${tw.restart ? html`<p class="faint" style="margin-top:10px">${restartNote(tw.restart)}</p>` : ''}
      ${tw.admin && isMac ? html`<p class="faint" style="margin-top:6px">${t('tweaks.macPassword')}</p>` : ''}
      <p class="faint" style="margin-top:6px">${t('tweaks.switchBack')}</p>`});
    if (!ok) return null;
  }
  const before = tw.value;
  const r = await api('tweaks.set', {id: tw.id, value});
  tw.value = r.value;
  if (tw.restart === 'explorer') pending.explorer = true;
  if (tw.restart === 'reboot') pending.reboot = true;
  toast(`${tw.title}: ${valueLabel(tw, before)} → ${valueLabel(tw, r.value)}`, {type: 'success'});
  return r.value;
}

export function pendingBanner() {
  if (!pending.explorer && !pending.reboot) return '';
  return html`<div class="callout blue" style="margin-bottom:16px">${ic('refresh', 18)}<div class="grow">${pending.explorer ? t(isMac ? 'tweaks.pending.finder' : 'tweaks.pending.explorer') : t('tweaks.pending.reboot')}</div>
    ${pending.explorer ? html`<button class="btn btn-sm btn-secondary" data-action="restartExplorer">${t(isMac ? 'tweaks.restartFinderNow' : 'tweaks.restartExplorerNow')}</button>` : ''}</div>`;
}

export async function restartExplorer(page) {
  await api('explorer.restart');
  pending.explorer = false;
  toast(t(isMac ? 'tweaks.finderRestarted' : 'tweaks.explorerRestarted'), {type: 'success'});
  page.update();
}
