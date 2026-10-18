'use strict';
// Reversible macOS tweaks. Same contract as the Windows tweaks: plain-language what / pro / con,
// a recommendation, and whether admin rights or a restart of Finder/Dock or sign-out is needed.
const path = require('node:path');
const {sh, osa, sudo, plist, mapLimit} = require('./sh.cjs');

const D = '/usr/bin/defaults';
async function read(domain, key) { try { return (await sh(D, ['read', domain, key], {timeout: 5000})).trim(); } catch { return null; } }
async function write(domain, key, type, value) { await sh(D, ['write', domain, key, `-${type}`, String(value)], {timeout: 5000}); }
async function del(domain, key) { await sh(D, ['delete', domain, key], {timeout: 5000}).catch(() => {}); }
const bool = (v, dflt) => v === null ? dflt : v === '1' || v === 'true';
const killall = name => sh('/usr/bin/killall', [name]).catch(() => {});
const G = 'NSGlobalDomain';
const bt = (domain, key, dflt) => async () => bool(await read(domain, key), dflt);
const bs = (domain, key, after) => async v => { await write(domain, key, 'bool', v ? 'true' : 'false'); if (after) await after(); };

const T = [
  // ---------- Performance ----------
  {id: 'windowAnim', group: 'performance', title: 'Turn off window opening animations', type: 'toggle', recommended: null, verdict: 'situational', restart: 'apps',
    what: 'Windows and sheets appear instantly instead of zooming in.', pro: 'The Mac feels snappier, especially on older models.', con: 'Less smooth. Affects apps you open after the change.',
    on: 'Off', off: 'On', get: async () => !bool(await read(G, 'NSAutomaticWindowAnimationsEnabled'), true), set: async v => v ? write(G, 'NSAutomaticWindowAnimationsEnabled', 'bool', 'false') : del(G, 'NSAutomaticWindowAnimationsEnabled')},
  {id: 'resizeSpeed', group: 'performance', title: 'Faster window resizing', type: 'toggle', recommended: null, verdict: 'optional', restart: 'apps',
    what: 'Window resize and sheet animations take almost no time.', pro: 'Less waiting for animations.', con: 'Transitions look abrupt.',
    on: 'Instant', off: 'Default', get: async () => (await read(G, 'NSWindowResizeTime')) !== null, set: async v => v ? write(G, 'NSWindowResizeTime', 'float', '0.001') : del(G, 'NSWindowResizeTime')},
  {id: 'dockDelay', group: 'performance', title: 'Show a hidden Dock instantly', type: 'toggle', recommended: null, verdict: 'optional',
    what: 'If the Dock is set to hide automatically, it appears immediately when you move the pointer to it.', pro: 'No half-second wait for the Dock.', con: 'The Dock may pop up more often by accident.',
    on: 'Instant', off: 'Default delay', get: async () => (await read('com.apple.dock', 'autohide-delay')) === '0',
    set: async v => { if (v) { await write('com.apple.dock', 'autohide-delay', 'float', '0'); await write('com.apple.dock', 'autohide-time-modifier', 'float', '0.3'); } else { await del('com.apple.dock', 'autohide-delay'); await del('com.apple.dock', 'autohide-time-modifier'); } await killall('Dock'); }},
  {id: 'launchAnim', group: 'performance', title: 'Stop bouncing app icons', type: 'toggle', recommended: null, verdict: 'preference',
    what: 'App icons no longer bounce in the Dock while the app opens.', pro: 'Calmer Dock.', con: 'Less visual feedback that an app is starting.',
    on: 'No bounce', off: 'Bounce', get: async () => !bool(await read('com.apple.dock', 'launchanim'), true), set: async v => { await write('com.apple.dock', 'launchanim', 'bool', v ? 'false' : 'true'); await killall('Dock'); }},
  {id: 'dsStore', group: 'performance', title: 'No .DS_Store files on network & USB drives', type: 'toggle', recommended: true, verdict: 'recommended', restart: 'explorer',
    what: 'Finder stops writing hidden .DS_Store files to network shares and USB drives.', pro: 'Faster browsing of network folders, and no clutter on drives you share with Windows PCs.', con: 'Finder doesn’t remember view options (icon size, sort order) for folders on those drives.',
    on: 'Off', off: 'Finder default', get: async () => bool(await read('com.apple.desktopservices', 'DSDontWriteNetworkStores'), false),
    set: async v => { for (const k of ['DSDontWriteNetworkStores', 'DSDontWriteUSBStores']) { if (v) await write('com.apple.desktopservices', k, 'bool', 'true'); else await del('com.apple.desktopservices', k); } }},
  {id: 'spotlight', group: 'performance', title: 'Turn off Spotlight indexing', type: 'toggle', recommended: false, verdict: 'situational', admin: true,
    what: 'Stops Spotlight from cataloguing files on all drives.', pro: 'Less background disk and CPU activity.', con: 'Spotlight, Finder search and Mail search stop finding files and messages. Not worth it on most Macs.',
    on: 'Indexing off', off: 'Indexing on', get: async () => /disabled/i.test(await sh('/usr/bin/mdutil', ['-s', '/']).catch(() => '')),
    set: async v => sudo(`/usr/bin/mdutil -a -i ${v ? 'off' : 'on'}`)},
  {id: 'lowPower', group: 'performance', title: 'Low Power Mode', type: 'toggle', recommended: null, verdict: 'situational', admin: true,
    what: 'Reduces energy use by lowering processor speed and pausing some background activity.', pro: 'Longer battery life, cooler and quieter.', con: 'Heavy tasks (exports, games) run slower.',
    on: 'On', off: 'Off', get: async () => { const o = await sh('/usr/bin/pmset', ['-g']).catch(() => ''); return /lowpowermode\s+1/.test(o) ? true : /lowpowermode/.test(o) ? false : null; },
    set: async v => sudo(`/usr/bin/pmset -a lowpowermode ${v ? 1 : 0}`)},

  {id: 'powerNap', group: 'performance', title: 'Turn off Power Nap', type: 'toggle', recommended: null, verdict: 'situational', admin: true,
    what: 'Stops the Mac waking up briefly while asleep to check mail, sync iCloud and make Time Machine backups.', pro: 'Less battery drain overnight and a cooler Mac in a bag.', con: 'Mail, calendars and backups update only after you wake the Mac.',
    on: 'Off', off: 'On', get: async () => { const o = await sh('/usr/bin/pmset', ['-g']).catch(() => ''); const m = /powernap\s+(\d)/.exec(o); return m ? m[1] === '0' : null; },
    set: async v => sudo(`/usr/bin/pmset -a powernap ${v ? 0 : 1}`)},
  {id: 'appNapOff', group: 'performance', title: 'Keep background apps at full speed', type: 'toggle', recommended: false, verdict: 'situational', restart: 'apps',
    what: 'Turns off App Nap, which slows down apps whose windows are hidden.', pro: 'Long exports, downloads and renders keep full speed when you switch away.', con: 'More battery use and heat. Leave on unless a background task is noticeably slow.',
    on: 'Full speed', off: 'App Nap', get: bt(G, 'NSAppSleepDisabled', false), set: async v => v ? write(G, 'NSAppSleepDisabled', 'bool', 'true') : del(G, 'NSAppSleepDisabled')},

  // ---------- Privacy ----------
  {id: 'adPersonal', group: 'privacy', title: 'Turn off personalized Apple ads', type: 'toggle', recommended: true, verdict: 'recommended',
    what: 'Apple stops using your activity to personalize ads in the App Store, Apple News and Stocks.', pro: 'Less profiling for advertising.', con: 'Ads are less relevant (you still see ads).',
    on: 'Off', off: 'On', get: async () => !bool(await read('com.apple.AdLib', 'allowApplePersonalizedAdvertising'), true), set: async v => write('com.apple.AdLib', 'allowApplePersonalizedAdvertising', 'bool', v ? 'false' : 'true')},
  {id: 'analytics', group: 'privacy', title: 'Don’t share Mac analytics with Apple', type: 'toggle', recommended: null, verdict: 'optional', admin: true,
    what: 'Stops sending diagnostic and usage data to Apple (Settings → Privacy & Security → Analytics).', pro: 'Less data about how you use your Mac leaves it.', con: 'Apple gets less information to fix bugs you run into.',
    on: 'Not shared', off: 'Shared', get: async () => { const v = await read('/Library/Application Support/CrashReporter/DiagnosticMessagesHistory', 'AutoSubmit'); return v === null ? null : !bool(v, true); },
    set: async v => sudo(`/usr/bin/defaults write '/Library/Application Support/CrashReporter/DiagnosticMessagesHistory' AutoSubmit -bool ${v ? 'false' : 'true'}`)},
  {id: 'crashDialog', group: 'privacy', title: 'Quiet crash reports', type: 'toggle', recommended: null, verdict: 'optional',
    what: 'When an app crashes, macOS shows a notification instead of a large “quit unexpectedly” dialog.', pro: 'Fewer interruptions.', con: 'Easy to miss that an app crashed.',
    on: 'Notification', off: 'Dialog', get: async () => (await read('com.apple.CrashReporter', 'UseUNC')) === '1', set: async v => v ? write('com.apple.CrashReporter', 'UseUNC', 'int', 1) : del('com.apple.CrashReporter', 'UseUNC')},

  // ---------- Mac settings: appearance ----------
  {id: 'appearance', group: 'appearance', title: 'Appearance', type: 'choice', recommended: null, verdict: 'preference',
    what: 'Light or dark mode for macOS and apps that follow the system.', options: [{value: 'light', label: 'Light'}, {value: 'dark', label: 'Dark'}],
    get: async () => (await read(G, 'AppleInterfaceStyle')) === 'Dark' ? 'dark' : 'light',
    set: async v => osa(`tell application "System Events" to tell appearance preferences to set dark mode to ${v === 'dark'}`)},
  {id: 'scrollbars', group: 'appearance', title: 'Show scroll bars', type: 'choice', recommended: null, verdict: 'preference', restart: 'apps',
    what: 'When scroll bars are visible in windows.', options: [{value: 'Automatic', label: 'Automatic'}, {value: 'WhenScrolling', label: 'When scrolling'}, {value: 'Always', label: 'Always'}],
    get: async () => (await read(G, 'AppleShowScrollBars')) || 'Automatic', set: async v => write(G, 'AppleShowScrollBars', 'string', v)},

  // ---------- Finder ----------
  {id: 'showExt', group: 'explorer', title: 'Show all file extensions', type: 'toggle', recommended: true, verdict: 'recommended', restart: 'explorer',
    what: 'Shows the end of file names, like “.pdf” or “.dmg”.', pro: 'You see what a file really is.', con: 'File names look a bit longer.',
    on: 'Shown', off: 'Hidden', get: bt(G, 'AppleShowAllExtensions', false), set: bs(G, 'AppleShowAllExtensions')},
  {id: 'showHidden', group: 'explorer', title: 'Show hidden files', type: 'toggle', recommended: null, verdict: 'preference', restart: 'explorer',
    what: 'Shows files and folders that macOS normally hides, such as Library and dot-files.', pro: 'Useful when troubleshooting or developing.', con: 'More clutter, and it is easier to delete something important. Tip: ⌘⇧. toggles this in Finder.',
    on: 'Shown', off: 'Hidden', get: bt('com.apple.finder', 'AppleShowAllFiles', false), set: bs('com.apple.finder', 'AppleShowAllFiles')},
  {id: 'pathBar', group: 'explorer', title: 'Show path bar', type: 'toggle', recommended: true, verdict: 'recommended', restart: 'explorer',
    what: 'Shows the folder path at the bottom of every Finder window.', pro: 'You always know where you are and can click any parent folder.', con: 'Takes a thin strip of window space.',
    on: 'Shown', off: 'Hidden', get: bt('com.apple.finder', 'ShowPathbar', false), set: bs('com.apple.finder', 'ShowPathbar')},
  {id: 'statusBar', group: 'explorer', title: 'Show status bar', type: 'toggle', recommended: null, verdict: 'preference', restart: 'explorer',
    what: 'Shows item count and free space at the bottom of Finder windows.', pro: 'See free disk space at a glance.', con: 'Takes a thin strip of window space.',
    on: 'Shown', off: 'Hidden', get: bt('com.apple.finder', 'ShowStatusBar', false), set: bs('com.apple.finder', 'ShowStatusBar')},
  {id: 'foldersFirst', group: 'explorer', title: 'Keep folders on top', type: 'toggle', recommended: null, verdict: 'preference', restart: 'explorer',
    what: 'Folders are listed before files when sorting by name, like on Windows.', pro: 'Easier to find folders in long lists.', con: 'None really.',
    on: 'On top', off: 'Mixed', get: bt('com.apple.finder', '_FXSortFoldersFirst', false), set: bs('com.apple.finder', '_FXSortFoldersFirst')},
  {id: 'showLibrary', group: 'explorer', title: 'Show your Library folder', type: 'toggle', recommended: null, verdict: 'preference',
    what: 'Shows ~/Library in your home folder, where apps keep settings, caches and data.', pro: 'Handy when following support guides or checking what an app left behind.', con: 'Easier to change something an app depends on.',
    on: 'Shown', off: 'Hidden', get: async () => { const o = await sh('/bin/ls', ['-ldO', require('node:os').homedir() + '/Library']).catch(() => ''); return o ? !/\bhidden\b/.test(o) : null; },
    set: async v => sh('/usr/bin/chflags', [v ? 'nohidden' : 'hidden', require('node:os').homedir() + '/Library'])},
  {id: 'saveLocal', group: 'explorer', title: 'Save new documents to this Mac', type: 'toggle', recommended: null, verdict: 'preference', restart: 'apps',
    what: 'Save dialogs start in a folder on this Mac instead of iCloud Drive.', pro: 'Files don’t fill up iCloud storage or wait for upload.', con: 'New documents aren’t automatically on your other devices.',
    on: 'This Mac', off: 'iCloud', get: async () => !bool(await read(G, 'NSDocumentSaveNewDocumentsToCloud'), true), set: async v => v ? write(G, 'NSDocumentSaveNewDocumentsToCloud', 'bool', 'false') : del(G, 'NSDocumentSaveNewDocumentsToCloud')},
  {id: 'expandSave', group: 'explorer', title: 'Expanded save dialogs', type: 'toggle', recommended: null, verdict: 'preference', restart: 'apps',
    what: 'Save dialogs open with the full folder browser instead of the small version.', pro: 'Pick a folder without an extra click.', con: 'Dialogs take more room.',
    on: 'Expanded', off: 'Compact', get: bt(G, 'NSNavPanelExpandedStateForSaveMode', false),
    set: async v => { for (const k of ['NSNavPanelExpandedStateForSaveMode', 'NSNavPanelExpandedStateForSaveMode2']) { if (v) await write(G, k, 'bool', 'true'); else await del(G, k); } }},
  {id: 'searchScope', group: 'explorer', title: 'Finder search looks in', type: 'choice', recommended: null, verdict: 'preference',
    what: 'Where Finder searches when you type in a window’s search field.', options: [{value: 'SCev', label: 'This Mac'}, {value: 'SCcf', label: 'Current folder'}],
    get: async () => (await read('com.apple.finder', 'FXDefaultSearchScope')) || 'SCev', set: async v => write('com.apple.finder', 'FXDefaultSearchScope', 'string', v)},
  {id: 'extWarning', group: 'explorer', title: 'Don’t warn when changing an extension', type: 'toggle', recommended: null, verdict: 'preference', restart: 'explorer',
    what: 'Renaming “photo.png” to “photo.jpg” no longer asks for confirmation.', pro: 'Faster renaming.', con: 'Easier to accidentally rename a file into a type it isn’t.',
    on: 'No warning', off: 'Warn', get: async () => !bool(await read('com.apple.finder', 'FXEnableExtensionChangeWarning'), true), set: async v => write('com.apple.finder', 'FXEnableExtensionChangeWarning', 'bool', v ? 'false' : 'true')},

  // ---------- Dock ----------
  {id: 'dockAutohide', group: 'taskbar', title: 'Automatically hide the Dock', type: 'toggle', recommended: null, verdict: 'preference',
    what: 'The Dock slides away until you move the pointer to the screen edge.', pro: 'More screen space for windows.', con: 'One extra movement to reach the Dock.',
    on: 'Hide', off: 'Always visible', get: bt('com.apple.dock', 'autohide', false), set: bs('com.apple.dock', 'autohide', () => killall('Dock'))},
  {id: 'dockRecents', group: 'taskbar', title: 'Hide recent apps in the Dock', type: 'toggle', recommended: null, verdict: 'preference',
    what: 'Removes the section that shows recently used apps you didn’t pin.', pro: 'A tidier, predictable Dock.', con: 'Recently used apps aren’t one click away.',
    on: 'Hidden', off: 'Shown', get: async () => !bool(await read('com.apple.dock', 'show-recents'), true), set: async v => { await write('com.apple.dock', 'show-recents', 'bool', v ? 'false' : 'true'); await killall('Dock'); }},
  {id: 'dockPosition', group: 'taskbar', title: 'Dock position', type: 'choice', recommended: null, verdict: 'preference',
    what: 'Which screen edge the Dock sits on.', options: [{value: 'left', label: 'Left'}, {value: 'bottom', label: 'Bottom'}, {value: 'right', label: 'Right'}],
    get: async () => (await read('com.apple.dock', 'orientation')) || 'bottom', set: async v => { await write('com.apple.dock', 'orientation', 'string', v); await killall('Dock'); }},
  {id: 'minimizeEffect', group: 'taskbar', title: 'Minimize effect', type: 'choice', recommended: null, verdict: 'preference',
    what: 'The animation used when a window goes into the Dock. Scale is quicker.', options: [{value: 'genie', label: 'Genie'}, {value: 'scale', label: 'Scale'}],
    get: async () => (await read('com.apple.dock', 'mineffect')) || 'genie', set: async v => { await write('com.apple.dock', 'mineffect', 'string', v); await killall('Dock'); }},

  // ---------- Keyboard & trackpad ----------
  {id: 'tapToClick', group: 'input', title: 'Tap to click', type: 'toggle', recommended: null, verdict: 'preference', restart: 'signout',
    what: 'A light tap on the trackpad counts as a click.', pro: 'Less pressure needed; quieter.', con: 'Accidental clicks while typing.',
    on: 'On', off: 'Off', get: bt('com.apple.AppleMultitouchTrackpad', 'Clicking', false),
    set: async v => { await write('com.apple.AppleMultitouchTrackpad', 'Clicking', 'bool', v); await write('com.apple.driver.AppleBluetoothMultitouch.trackpad', 'Clicking', 'bool', v); await sh('/usr/bin/defaults', ['-currentHost', 'write', G, 'com.apple.mouse.tapBehavior', '-int', v ? '1' : '0']).catch(() => {}); }},
  {id: 'keyRepeat', group: 'input', title: 'Fast key repeat', type: 'toggle', recommended: null, verdict: 'preference', restart: 'signout',
    what: 'Holding a key repeats it faster and sooner.', pro: 'Quicker cursor movement and deleting.', con: 'Easier to type repeated characters by accident.',
    on: 'Fast', off: 'Default', get: async () => Number(await read(G, 'KeyRepeat') ?? 6) <= 2,
    set: async v => { if (v) { await write(G, 'KeyRepeat', 'int', 2); await write(G, 'InitialKeyRepeat', 'int', 15); } else { await del(G, 'KeyRepeat'); await del(G, 'InitialKeyRepeat'); } }},
  {id: 'pressHold', group: 'input', title: 'Repeat keys instead of accent menu', type: 'toggle', recommended: null, verdict: 'preference', restart: 'apps',
    what: 'Holding a letter repeats it instead of showing the accent picker (é, è, ê…).', pro: 'Useful for coding and games.', con: 'You lose the quick accent menu.',
    on: 'Repeat', off: 'Accent menu', get: async () => !bool(await read(G, 'ApplePressAndHoldEnabled'), true), set: async v => write(G, 'ApplePressAndHoldEnabled', 'bool', v ? 'false' : 'true')},
  {id: 'smartQuotes', group: 'input', title: 'Turn off smart quotes and dashes', type: 'toggle', recommended: null, verdict: 'preference', restart: 'apps',
    what: 'Typing " and -- stays as typed instead of becoming curly quotes and dashes.', pro: 'Essential when writing code or commands.', con: 'Text looks less typographic.',
    on: 'Off', off: 'On', get: async () => !bool(await read(G, 'NSAutomaticQuoteSubstitutionEnabled'), true),
    set: async v => { await write(G, 'NSAutomaticQuoteSubstitutionEnabled', 'bool', v ? 'false' : 'true'); await write(G, 'NSAutomaticDashSubstitutionEnabled', 'bool', v ? 'false' : 'true'); }},
  {id: 'autocorrect', group: 'input', title: 'Turn off autocorrect', type: 'toggle', recommended: null, verdict: 'preference', restart: 'apps',
    what: 'macOS stops changing words automatically while you type.', pro: 'No surprise corrections, especially in other languages or names.', con: 'Typos stay until you fix them.',
    on: 'Off', off: 'On', get: async () => !bool(await read(G, 'NSAutomaticSpellingCorrectionEnabled'), true), set: async v => write(G, 'NSAutomaticSpellingCorrectionEnabled', 'bool', v ? 'false' : 'true')},

  // ---------- Screenshots ----------
  {id: 'shotFormat', group: 'screenshots', title: 'Screenshot format', type: 'choice', recommended: null, verdict: 'preference',
    what: 'File type for screenshots. JPG files are much smaller; PNG is lossless.', options: [{value: 'png', label: 'PNG'}, {value: 'jpg', label: 'JPG'}, {value: 'heic', label: 'HEIC'}],
    get: async () => (await read('com.apple.screencapture', 'type')) || 'png', set: async v => { await write('com.apple.screencapture', 'type', 'string', v); await killall('SystemUIServer'); }},
  {id: 'shotShadow', group: 'screenshots', title: 'No shadow on window screenshots', type: 'toggle', recommended: null, verdict: 'preference',
    what: 'Window screenshots (⌘⇧4, then Space) are saved without the large drop shadow.', pro: 'Tighter, smaller images.', con: 'Windows look flatter on light backgrounds.',
    on: 'No shadow', off: 'Shadow', get: bt('com.apple.screencapture', 'disable-shadow', false), set: bs('com.apple.screencapture', 'disable-shadow', () => killall('SystemUIServer'))}
];

const GROUPS = {performance: 'Performance', privacy: 'Privacy', appearance: 'Appearance', explorer: 'Finder', taskbar: 'Dock', input: 'Keyboard & trackpad', screenshots: 'Screenshots'};

const PROTECTED = /^(kernel_task|launchd|WindowServer|loginwindow|Dock|Finder|SystemUIServer|ControlCenter|coreaudiod|mds|mds_stores|mdworker|bluetoothd|cfprefsd|distnoted|Aster|Electron)$/;

class MacTweaks {
  constructor({store}) { this.store = store; }

  async list({groups}) {
    const defs = T.filter(t => groups.includes(t.group));
    const values = await mapLimit(defs, 6, t => t.get().catch(() => null));
    return {groups: GROUPS, items: defs.map((t, i) => ({id: t.id, group: t.group, title: t.title, type: t.type, what: t.what, pro: t.pro || null, con: t.con || null, on: t.on || null, off: t.off || null, options: t.options || null, recommended: t.recommended, verdict: t.verdict, admin: !!t.admin, restart: t.restart || null, value: values[i] ?? null, extra: null}))
      .filter(t => !(['lowPower', 'powerNap'].includes(t.id) && t.value === null))};
  }

  async set({id, value}) {
    const t = T.find(x => x.id === id);
    if (!t) throw new Error('Unknown setting');
    if (t.type === 'toggle' && typeof value !== 'boolean') throw new Error('Invalid value');
    if (t.type === 'choice' && !t.options.some(o => o.value === value)) throw new Error('Invalid value');
    const before = await t.get().catch(() => null);
    await t.set(value);
    const after = await t.get().catch(() => value);
    const label = v => t.type === 'toggle' ? (v ? t.on : t.off) : t.options.find(o => o.value === v)?.label ?? String(v);
    this.store.log({kind: 'tweak', title: `${t.title}: ${label(before)} → ${label(after)}`});
    return {ok: true, value: after};
  }

  // pmset values are in minutes; the UI works in seconds like Windows.
  async power() {
    const o = await sh('/usr/bin/pmset', ['-g']).catch(() => '');
    const n = k => { const m = new RegExp(`^\\s*${k}\\s+(\\d+)`, 'm').exec(o); return m ? Number(m[1]) * 60 : null; };
    const battery = /InternalBattery|Battery Power/i.test(await sh('/usr/bin/pmset', ['-g', 'batt']).catch(() => ''));
    return {plans: [], screenAc: n('displaysleep'), sleepAc: n('sleep'), battery, mac: true};
  }
  async setPower({screen, sleep}) {
    for (const [key, val] of [['displaysleep', screen], ['sleep', sleep]]) {
      if (val == null) continue;
      const min = Math.max(0, Math.min(600, Math.round(Number(val))));
      await sudo(`/usr/bin/pmset -a ${key} ${min}`);
      this.store.log({kind: 'tweak', title: `${key === 'displaysleep' ? 'Turn off display' : 'Sleep'} after: ${min ? min + ' min' : 'never'}`});
    }
    return this.power();
  }
  async addHighPerformance() { throw new Error('Not available on macOS.'); }

  async processes() {
    const out = await sh('/bin/ps', ['-axo', 'rss=,pcpu=,comm='], {timeout: 10000});
    const groups = new Map();
    for (const line of out.split('\n')) {
      const m = line.match(/^\s*(\d+)\s+([\d.]+)\s+(.+)$/);
      if (!m) continue;
      const comm = m[3].trim();
      const bundle = (comm.match(/^(.*?\.app)\//) || [])[1];
      const name = bundle ? path.basename(bundle, '.app') : path.basename(comm);
      // Apple apps such as Safari and Mail live under /System but are ordinary apps the user can quit.
      const system = bundle ? /\/(CoreServices|Library\/(Private)?Frameworks)\//.test(bundle) : comm.startsWith('/System/') || comm.startsWith('/usr/') || !comm.startsWith('/');
      const g = groups.get(name) || {name, count: 0, memory: 0, cpu: 0, path: bundle || comm, system};
      g.count++; g.memory += Number(m[1]) * 1024; g.cpu += Number(m[2]);
      groups.set(name, g);
    }
    const items = [...groups.values()].sort((a, b) => b.memory - a.memory).slice(0, 18)
      .map(g => ({name: g.name, description: g.name, company: g.system ? 'macOS' : null, count: g.count, memory: g.memory, cpu: g.cpu, path: g.path, protected: g.system || PROTECTED.test(g.name)}));
    return {items};
  }
  async endProcess({name}) {
    if (typeof name !== 'string' || !/^[\w .+()-]{1,100}$/.test(name) || PROTECTED.test(name)) throw new Error('This process is part of macOS and cannot be closed by Aster.');
    await osa(`tell application "${name.replace(/"/g, '')}" to quit`, {timeout: 20000});
    this.store.log({kind: 'tool', title: `Quit ${name}`});
    return {ok: true};
  }

  async restartExplorer() { await killall('Finder'); return {ok: true}; }
}

module.exports = {MacTweaks, TWEAKS: T};
