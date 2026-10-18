'use strict';
// What is this file on a Mac, who owns it, and is it safe to delete?
const path = require('node:path');
const os = require('node:os');
const {EXT} = require('../identify.cjs');

const HOME = os.homedir().toLowerCase();
const LIB = HOME + '/library';
const R = (verdict, kind, what, advice, owner = null) => ({verdict, kind, what, advice, owner});
const title = s => s ? s.replace(/^com\.|\.app$/gi, '') : s;

function appOwner(l, programs) {
  let best = null;
  for (const p of programs) {
    const loc = (p.location || '').toLowerCase();
    if (loc && (l === loc || l.startsWith(loc + '/')) && (!best || loc.length > best.len)) best = {name: p.name, len: loc.length};
  }
  if (best) return best.name;
  const m = l.match(/\/library\/(?:application support|caches|containers|group containers|preferences|logs|saved application state|httpstorages|webkit)\/([^/]+)/);
  if (!m) return null;
  const key = m[1].replace(/\.(plist|savedstate)$/, '');
  const hit = programs.find(p => (p.bundleId && (p.bundleId.toLowerCase() === key || key.endsWith('.' + p.bundleId.toLowerCase()) || key.startsWith(p.bundleId.toLowerCase()))) || p.name.toLowerCase() === key);
  return hit ? hit.name : null;
}

function classify(p, isDir, programs) {
  const l = p.toLowerCase().replace(/\/+$/, '');
  const name = path.basename(l);
  const owner = appOwner(l, programs);
  const ext = !isDir && (EXT.find(([re]) => re.test(l)) || [])[1];

  if (l === '/system' || l.startsWith('/system/') || l.startsWith('/usr/') || l === '/usr' || /^\/(bin|sbin|private\/var\/db)(\/|$)/.test(l)) return R('keep', 'macOS system', 'Part of macOS itself, protected by System Integrity Protection.', 'Never delete. macOS manages it and wouldn’t let you anyway.', 'macOS');
  if (/^\/private\/var\/vm\/sleepimage/.test(l)) return R('keep', 'Sleep image', 'macOS saves memory here for safe sleep and hibernation.', 'Leave it; macOS manages its size.', 'macOS');
  if (/^\/private\/var\/vm\/swapfile/.test(l)) return R('keep', 'Virtual memory', 'Swap space macOS uses when RAM is full.', 'Leave it. Quitting memory-heavy apps shrinks it.', 'macOS');
  if (/^\/private\/var\/folders(\/|$)/.test(l)) return R('safe', 'Temporary & cache files', 'Per-user temporary and cache files.', 'Use the Cleaner’s Temporary files and Quick Look items instead of deleting by hand.', 'macOS');
  if (/^\/library\/(developer\/commandlinetools|apple|frameworks|extensions|audio)(\/|$)/.test(l)) return R('keep', 'Shared system component', 'Components shared by apps or developer tools.', 'Don’t delete by hand.', 'macOS');
  if (/^\/applications\/[^/]+\.app/.test(l) || /\/applications\/[^/]+\.app/.test(l)) return R('keep', 'Application', `The ${owner || title(name)} app.`, 'Uninstall it from Programs so Aster also removes its leftovers.', owner || title(path.basename(p)));
  if (l.startsWith(LIB + '/developer/xcode/deriveddata')) return R('safe', 'Xcode build files', 'Intermediate build products Xcode recreates.', 'Safe to delete; the Cleaner removes them.', 'Xcode');
  if (l.startsWith(LIB + '/developer/xcode/archives')) return R('review', 'Xcode archives', 'Archived app builds, needed to symbolicate crash reports of released versions.', 'Keep archives of versions you still support.', 'Xcode');
  if (l.startsWith(LIB + '/developer/xcode/ios devicesupport')) return R('review', 'iOS device support', 'Debug symbols for connected iPhones.', 'Delete versions you no longer test on.', 'Xcode');
  if (l.startsWith(LIB + '/developer/coresimulator')) return R('review', 'iOS simulators', 'Simulator devices and their data.', 'Remove unused simulators in Xcode → Devices and Simulators.', 'Xcode');
  if (l.startsWith(LIB + '/application support/mobilesync/backup')) return R('keep', 'iPhone/iPad backup', 'A full local backup of a device.', 'Manage in Finder → your device → Manage Backups. Delete only if you have another backup.', 'Finder');
  if (l.startsWith(LIB + '/mobile documents')) return R('review', 'iCloud Drive', 'Files synced with iCloud Drive.', 'Deleting here deletes them on all your devices. Use “Remove Download” in Finder to free space but keep them in iCloud.', 'iCloud');
  if (l.startsWith(LIB + '/mail')) return R('keep', 'Mail data', 'Your downloaded email and attachments.', 'Manage mailboxes in Mail instead.', 'Mail');
  if (l.startsWith(LIB + '/messages')) return R('keep', 'Messages history', 'Your iMessage and SMS history and attachments.', 'Delete conversations in Messages, or enable “Keep messages: 1 year”.', 'Messages');
  if (/\.photoslibrary(\/|$)/.test(l)) return R('keep', 'Photos library', 'Your Photos library with all photos and edits.', 'Never delete by hand. Use Photos to remove pictures.', 'Photos');
  if (/docker\.raw$/.test(l) || l.includes('/containers/com.docker.docker/')) return R('keep', 'Docker virtual disk', 'All Docker images and containers.', 'Free space with “docker system prune”, not by deleting this file.', 'Docker');
  if (l.includes('/library/caches/')) return R('safe', 'Cache', `Cached data${owner ? ` of ${owner}` : ''}.`, 'Safe to delete — the Cleaner does this automatically.', owner || title(l.split('/library/caches/')[1].split('/')[0]));
  if (l.includes('/library/logs/')) return R('safe', 'Logs', 'Log files.', 'Safe to delete.', owner);
  if (l.startsWith(HOME + '/.trash')) return R('review', 'Trash', 'Files you deleted.', 'Empty the Trash when you’re sure.', 'Finder');
  if (/\.(dmg|pkg|mpkg)$/.test(l)) return R('safe', 'Installer', 'A disk image or installer package used to install an app.', 'Safe to delete once the app is installed.', owner || (l.startsWith(HOME + '/downloads') ? 'Your downloads' : null));
  if (l.startsWith(HOME + '/downloads')) return {...(ext || R('review', 'Download', 'Something you downloaded.', 'Safe to delete if you no longer need it.')), owner: 'Your downloads'};
  if (new RegExp(`^${HOME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(movies|pictures|music|documents|desktop)(/|$)`).test(l)) return {...(ext || R('review', 'Personal files', 'Your own files.', 'Only delete what you’re sure you don’t need.')), owner: 'You'};
  if (owner) return R('review', ext?.kind || (isDir ? 'App data' : 'App file'), `Data or settings of ${owner}.`, `Deleting can reset or break ${owner}. Uninstall it from Programs if you don’t use it.`, owner);
  if (l.startsWith(LIB + '/application support/') || l.startsWith(LIB + '/containers/')) {
    const folder = p.split(/\/Library\/(?:Application Support|Containers)\//i)[1]?.split('/')[0];
    return R('review', 'App data', `Data stored in the “${folder}” folder. No installed app with that name was found — it may be left over from a removed app.`, 'See Leftovers for a safe cleanup. If unsure, leave it.', folder);
  }
  if (ext) return ext;
  if (isDir) return R('review', 'Folder', 'A folder Aster can’t attribute to a specific app.', 'Open it to see what’s inside before deciding.');
  return R('review', 'Unknown file', `Aster can’t tell which app created this file. It is in the folder “${path.basename(path.dirname(p))}”.`, 'If you don’t recognise it, it’s safer to leave it.', path.basename(path.dirname(p)));
}

async function identify({items, programs}) {
  const out = {};
  for (const it of items) out[it.path] = classify(it.path, !!it.dir, programs);
  return out;
}

module.exports = {identify, classify};
