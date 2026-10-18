'use strict';
const {sh, sudo} = require('./sh.cjs');

const APPS = {activity: 'Activity Monitor', diskutil: 'Disk Utility', console: 'Console', sysinfo: 'System Information', terminal: 'Terminal', keychain: 'Keychain Access', timemachine: 'Time Machine', script: 'Script Editor'};
const SETTINGS = {
  storage: 'x-apple.systempreferences:com.apple.settings.Storage', update: 'x-apple.systempreferences:com.apple.Software-Update-Settings.extension',
  loginitems: 'x-apple.systempreferences:com.apple.LoginItems-Settings.extension', privacy: 'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension',
  displays: 'x-apple.systempreferences:com.apple.Displays-Settings.extension', battery: 'x-apple.systempreferences:com.apple.Battery-Settings.extension',
  network: 'x-apple.systempreferences:com.apple.Network-Settings.extension', fda: 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'
};

const CATALOG = {
  actions: [
    {id: 'snapshot', icon: 'restore', tone: 'blue', title: 'Create a Time Machine snapshot', text: 'Saves a local snapshot of your Mac you can restore from if a change goes wrong.'},
    {id: 'thin', icon: 'drive', tone: 'green', title: 'Free space used by local snapshots', text: 'Removes Time Machine local snapshots, which can hold many gigabytes of “purgeable” space.'},
    {id: 'dns', icon: 'network', tone: 'green', title: 'Flush DNS cache', text: 'Fixes sites that fail to load after network or DNS changes. Asks for your password.', admin: true},
    {id: 'reindex', icon: 'search', tone: '', title: 'Rebuild Spotlight index', text: 'Fixes Spotlight not finding files. Re-indexing runs in the background for a while.', admin: true},
    {id: 'lsreset', icon: 'apps', tone: '', title: 'Fix duplicate “Open With” entries', text: 'Rebuilds the Launch Services database that lists which apps open which files.'},
    {id: 'bin', icon: 'trash', tone: 'amber', title: 'Empty the Trash', text: 'Permanently deletes everything in the Trash.'}
  ],
  launchers: [['activity', 'Activity Monitor', 'gauge'], ['diskutil', 'Disk Utility', 'drive'], ['console', 'Console', 'list'], ['sysinfo', 'System Information', 'info'], ['terminal', 'Terminal', 'terminal'], ['keychain', 'Keychain Access', 'key'], ['timemachine', 'Time Machine', 'restore']],
  settings: [['storage', 'Storage', 'pie'], ['update', 'Software Update', 'refresh'], ['loginitems', 'Login Items', 'power'], ['privacy', 'Privacy & Security', 'lock'], ['displays', 'Displays', 'monitor'], ['battery', 'Battery', 'battery'], ['network', 'Network', 'network']],
  binRule: 'macos.trash'
};

class MacTools {
  constructor({store, shell}) { this.store = store; this.shell = shell; }
  catalog() { return CATALOG; }
  async launch({id}) {
    if (SETTINGS[id]) { await this.shell.openExternal(SETTINGS[id]); return {ok: true}; }
    if (!APPS[id]) throw new Error('Unknown tool');
    await sh('/usr/bin/open', ['-a', APPS[id]]);
    return {ok: true};
  }
  async run({id}) {
    switch (id) {
      case 'snapshot': await sh('/usr/bin/tmutil', ['localsnapshot'], {timeout: 120000}); this.store.log({kind: 'tool', title: 'Created a Time Machine local snapshot'}); return {ok: true, message: 'Snapshot created'};
      case 'thin': {
        const before = (await sh('/usr/bin/tmutil', ['listlocalsnapshots', '/']).catch(() => '')).split('\n').filter(l => /snapshot/i.test(l)).length;
        await sh('/usr/bin/tmutil', ['thinlocalsnapshots', '/', '999999999999', '4'], {timeout: 300000});
        this.store.log({kind: 'tool', title: 'Removed Time Machine local snapshots'});
        return {ok: true, message: before ? `Removed up to ${before} local snapshot${before === 1 ? '' : 's'}` : 'No local snapshots were found'};
      }
      case 'dns': await sudo('/usr/bin/dscacheutil -flushcache; /usr/bin/killall -HUP mDNSResponder'); this.store.log({kind: 'tool', title: 'Flushed DNS cache'}); return {ok: true, message: 'DNS cache flushed'};
      case 'reindex': await sudo('/usr/bin/mdutil -E /'); this.store.log({kind: 'tool', title: 'Started rebuilding the Spotlight index'}); return {ok: true, message: 'Spotlight is re-indexing in the background'};
      case 'lsreset':
        await sh('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-kill', '-r', '-domain', 'local', '-domain', 'system', '-domain', 'user'], {timeout: 300000});
        this.store.log({kind: 'tool', title: 'Rebuilt the Launch Services database'}); return {ok: true, message: '“Open With” list rebuilt'};
      default: throw new Error('Unknown action');
    }
  }
  async flushDns() { return this.run({id: 'dns'}); }
  async restorePoint() { return this.run({id: 'snapshot'}); }
}

module.exports = {MacTools};
