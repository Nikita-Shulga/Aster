import {html, ic, api, app, setApp, date, isMac, t} from '../lib.js';
import {definePage} from '../page.js';
import {lang} from '../i18n.js';
import {RELEASES, compareVersions} from '../whats-new.js';

// What's new: every version in a few short lines, newest first. The sidebar marks it "New" until it is opened after
// an update (settings.seenVersion remembers the last version you looked at).
const text = v => v?.[lang()] ?? v?.en ?? '';
const installed = () => app.info?.version || RELEASES[0].version;
export const hasUnseen = () => !!app.info?.version && compareVersions(app.info.version, app.settings?.seenVersion || '0') > 0;

export default definePage({
  id: 'whatsnew', get title() { return t('page.whatsnew'); }, icon: 'star',
  badge: () => hasUnseen() ? {text: t('whatsnew.badge'), tone: 'accent'} : null,
  view() {
    const current = installed();
    // Versions newer than the installed one (a source checkout ahead of a release) are listed too, marked as coming.
    return html`
      <div class="page-head">
        <div class="titles"><h1>${t('page.whatsnew')}</h1><p>${t('whatsnew.intro', {version: current})}</p></div>
        <div class="actions"><button class="btn btn-secondary" data-action="changelog">${ic('external', 16)} ${t('whatsnew.full')}</button></div>
      </div>
      <div class="wn-list">${RELEASES.map(r => {
        const cmp = compareVersions(r.version, current);
        return html`<section class="card wn ${cmp === 0 ? 'current' : ''}">
          <div class="wn-head">
            <span class="wn-version num">${r.version}</span>
            <div class="grow"><h3>${text(r.title)}</h3><div class="sub">${date(r.date)}</div></div>
            ${cmp === 0 ? html`<span class="badge green">${ic('check', 12)} ${t('whatsnew.installed')}</span>` : cmp > 0 ? html`<span class="badge accent">${t('whatsnew.coming')}</span>` : ''}
          </div>
          <ul class="wn-items">${r.items.map(i => html`<li class="${i.os && (i.os === 'mac') !== isMac ? 'other-os' : ''}"><span>${text(i)}</span>${i.os ? html`<span class="badge">${i.os === 'mac' ? 'macOS' : 'Windows'}</span>` : ''}</li>`)}</ul>
        </section>`;
      })}</div>`;
  },
  // Opening the page counts as seen; the "New" mark goes away.
  onMount() {
    const v = app.info?.version;
    if (v && app.settings?.seenVersion !== v) api('settings.update', {seenVersion: v}).then(s => setApp({settings: s})).catch(() => {});
  },
  on: {
    changelog() { api('shell.openUrl', {url: 'https://github.com/Nikita-Shulga/Aster/blob/main/CHANGELOG.md'}); }
  }
});
