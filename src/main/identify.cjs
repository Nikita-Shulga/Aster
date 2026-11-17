'use strict';
// Explains what a file or folder is, which program it belongs to, and whether deleting it is safe.
// Order of evidence: well-known Windows files → well-known locations → installed programs owning the folder
// → executable metadata (company/product) → file type.
const path = require('node:path');
const {psJson, arr} = require('./ps.cjs');
const fs = require('node:fs');
const {td, locale, getLanguage} = require('./i18n.cjs');
const smart = require('./smart.cjs');

const env = k => (process.env[k] || '').toLowerCase().replace(/\\+$/, '');
const SYS = env('SystemDrive') || 'c:';
const WIN = env('SystemRoot') || 'c:\\windows';
const PF = [env('ProgramFiles'), env('ProgramFiles(x86)'), env('ProgramW6432')].filter(Boolean);
const PD = env('ProgramData') || 'c:\\programdata';
const HOME = env('USERPROFILE');
const LOCAL = env('LOCALAPPDATA');
const ROAMING = env('APPDATA');

const R = (verdict, kind, what, advice, owner = null) => ({verdict, kind, what, advice, owner});

const SYSTEM_FILES = {
  'pagefile.sys': R('keep', 'Windows virtual memory', 'Windows uses this file as extra memory when your RAM is full. It is in use all the time.', 'Do not delete it (Windows won’t let you anyway). To make it smaller, change it in System Properties → Advanced → Performance → Virtual memory.', 'Windows'),
  'hiberfil.sys': R('keep', 'Hibernation file', 'Windows saves the contents of your RAM here when the PC hibernates, and for Fast Startup. It is about as big as a large part of your RAM.', 'Don’t delete it directly. If you never use Hibernate, turn it off in Aster → Optimize → "Turn off hibernation" and Windows removes this file safely.', 'Windows'),
  'swapfile.sys': R('keep', 'Windows app swap file', 'Used by Windows to quickly suspend and resume Store apps.', 'Leave it; Windows manages it.', 'Windows'),
  'memory.dmp': R('safe', 'Crash memory dump', 'A memory snapshot saved when Windows crashed with a blue screen.', 'Safe to delete unless someone is investigating your crashes. The Cleaner can remove it.', 'Windows'),
  'dumpstack.log': R('safe', 'Crash log', 'A small log written by Windows crash handling.', 'Safe to delete; Windows recreates it.', 'Windows'),
  'windows.edb': R('keep', 'Windows Search index', 'The database that makes searching files in Start and Explorer fast.', 'Don’t delete. If it is huge, rebuild it in Settings → Search → Advanced indexing options → Rebuild.', 'Windows'),
  'ntuser.dat': R('keep', 'Your user settings (registry)', 'Your personal part of the Windows registry: all settings of your account and apps.', 'Never delete — Windows would not be able to load your account.', 'Windows')
};

const EXT = [
  [/\.(iso|img)$/, R('safe', 'Disk image', 'A copy of a CD/DVD or USB installer, typically used to install Windows, Linux or software.', 'Usually safe to delete once you have installed what was inside. Keep it if you might need to reinstall.')],
  [/\.(vhdx?|vmdk|vdi|qcow2|avhdx)$/, R('keep', 'Virtual machine disk', 'A virtual hard drive: an entire operating system with all its files (Hyper-V, VirtualBox, VMware, WSL or Docker).', 'Deleting it destroys that virtual machine and everything inside. Remove the virtual machine from its own app instead.')],
  [/\.(exe|msi|msix|appx|msixbundle)$/, R('review', 'Program or installer', 'An application or installer file.', 'If it is an installer you already ran (for example in Downloads), you can delete it. If it lives in a program folder, uninstall the program instead.')],
  [/\.(zip|rar|7z|tar|gz|bz2|xz|zst|tgz|cab)$/, R('review', 'Compressed archive', 'A compressed package of files, often a download or a backup.', 'Safe to delete if you already extracted it and do not need it as a backup.')],
  [/\.(mp4|mkv|avi|mov|wmv|webm|m4v|ts|m2ts|mpg|mpeg|flv)$/, R('review', 'Video', 'A video file — a recording, film or game clip.', 'Personal content: delete only if you are sure. Consider moving it to another drive or cloud storage instead.')],
  [/\.(jpg|jpeg|png|heic|raw|cr2|nef|arw|dng|psd|tif|tiff)$/, R('review', 'Image', 'A photo or image.', 'Personal content: delete only if you are sure.')],
  [/\.(mp3|flac|wav|m4a|aac|ogg|wma)$/, R('review', 'Audio', 'A music or audio file.', 'Personal content: delete only if you are sure.')],
  [/\.(pst|ost)$/, R('keep', 'Outlook mailbox', 'Your Outlook email, calendar and contacts stored locally.', '.pst files may be your only copy of old mail — keep them. .ost files are a cache Outlook can rebuild, but deleting forces a full re-download.')],
  [/\.(dmp|mdmp|hdmp)$/, R('safe', 'Crash dump', 'A memory snapshot saved when a program crashed.', 'Safe to delete unless you are reporting the crash to a developer.')],
  [/\.(log|etl|trace)$/, R('safe', 'Log file', 'A text log a program writes to record what it did.', 'Usually safe to delete. A program may recreate it.')],
  [/\.(tmp|temp|old|partial|crdownload|part)$/, R('safe', 'Temporary or incomplete file', 'A leftover temporary file or an unfinished download.', 'Safe to delete if no download is in progress.')],
  [/\.(bak|backup)$/, R('review', 'Backup copy', 'A backup made by a program or by you.', 'Check what it is a backup of; delete if you have a newer backup.')],
  [/\.(pak|archive|bundle|vpk|forge|uasset|wad|bnk|big|cpk|rpf|bsa|ba2|ucas|utoc|wpk)$/, R('keep', 'Game data', 'Packed game assets: textures, maps, sounds or video.', 'Part of an installed game. Deleting breaks the game — uninstall the game from its launcher to free the space.')],
  [/\.(db|sqlite|sqlite3|ldb|mdb|accdb|edb)$/, R('keep', 'Database', 'A database a program uses to store its data.', 'Deleting usually resets or breaks the program that owns it.')],
  [/\.(pdf|docx?|xlsx?|pptx?|txt|odt|ods|epub)$/, R('review', 'Document', 'A document.', 'Personal content: delete only if you are sure.')]
];

function folderOwnerName(rel) {
  return rel.split('\\').filter(Boolean)[0] || null;
}

// Owners that are descriptions rather than names; program, folder and brand names are left as they are.
const OWNERS = new Set(['Installers', 'Game launcher', 'Temporary files', 'Your downloads', 'You', 'Windows Installer']);

// The explanation in the interface language: the tables stay in English and td() translates them on the way out.
function translate(info) {
  return {...info, kind: td(info.kind), what: td(info.what), advice: td(info.advice), owner: OWNERS.has(info.owner) ? td(info.owner) : info.owner};
}

function classify(p, isDir, programs, size = null) { return translate(explain(p, isDir, programs, size)); }

function explain(p, isDir, programs, size = null) {
  const l = p.toLowerCase().replace(/\\+$/, '');
  const name = path.basename(l);
  const owner = matchProgram(l, programs);

  if (!isDir && SYSTEM_FILES[name]) return {...SYSTEM_FILES[name]};

  // The Windows Search index lives under ProgramData\Microsoft\Search — a folder name that must not be mistaken for Microsoft Office.
  if (l.startsWith(PD + '\\microsoft\\search\\data')) return searchIndex(isDir, size);

  // Well-known places.
  if (l === WIN) return R('keep', 'Windows', 'The Windows operating system itself.', 'Never delete anything here manually. Use the Cleaner and Disk Cleanup for safe Windows cleanups.', 'Windows');
  if (l.startsWith(WIN + '\\winsxs')) return R('keep', 'Windows component store', 'Copies of Windows components needed for updates, repairs and optional features. Its reported size is inflated because many files are shared.', 'Never delete manually. Run Disk Cleanup → "Windows Update Cleanup" to shrink it safely.', 'Windows');
  if (l.startsWith(WIN + '\\installer')) return R('keep', 'Windows Installer cache', 'Copies of installers Windows needs to update, repair or uninstall your programs.', 'Do not delete — programs could become impossible to update or uninstall.', 'Windows');
  if (l.startsWith(WIN + '\\softwaredistribution')) return R('safe', 'Windows Update files', 'Downloaded Windows updates.', 'Use the Cleaner’s "Windows Update downloads" to remove what is no longer needed.', 'Windows');
  if (l.startsWith(WIN + '\\temp')) return R('safe', 'Windows temporary files', 'Temporary files created by Windows and installers.', 'The Cleaner removes these safely.', 'Windows');
  if (l.startsWith(WIN + '\\')) return R('keep', 'Windows system file', 'Part of the Windows operating system.', 'Do not delete — Windows or a driver may stop working.', 'Windows');
  if (/^[a-z]:\\windows\.old(\\|$)/.test(l)) return R('review', 'Previous Windows installation', 'Your old Windows from before the last big upgrade, kept so you can roll back.', 'If everything works, remove it via Settings → System → Storage → Temporary files → "Previous Windows installation(s)".', 'Windows');
  if (/^[a-z]:\\\$recycle\.bin(\\|$)/.test(l)) return R('review', 'Recycle Bin', 'Files you deleted that can still be restored.', 'Empty the Recycle Bin when you are sure you don’t need them.', 'Windows');
  if (/^[a-z]:\\system volume information(\\|$)/.test(l)) return R('keep', 'System Restore points', 'Restore points and shadow copies that let you roll back Windows.', 'Manage them in System Properties → System Protection → Configure (you can lower the space used).', 'Windows');
  if (/^[a-z]:\\\$windows\.~(bt|ws)(\\|$)/.test(l)) return R('safe', 'Windows upgrade leftovers', 'Temporary files from a Windows upgrade.', 'Remove via Settings → Storage → Temporary files.', 'Windows');
  if (l === PD + '\\package cache' || l.startsWith(PD + '\\package cache\\')) return R('keep', 'Installer package cache', 'Installers kept by Visual Studio, .NET and other programs to repair or uninstall them later.', 'Do not delete — those programs may fail to update or uninstall.', 'Installers');
  if (/\\steamapps\\common\\[^\\]+/.test(l)) { const game = p.match(/\\steamapps\\common\\([^\\]+)/i)[1]; return R('review', 'Steam game', td('Files of the game "{game}".', {game: titleCase(game)}), 'Don’t delete files by hand — uninstall the game in Steam to free this space.', `Steam · ${titleCase(game)}`); }
  if (/\\steamapps\\(shadercache|downloading|temp)(\\|$)/.test(l)) return R('safe', 'Steam cache / unfinished downloads', 'Shader cache or incomplete downloads of Steam.', 'Safe to delete; Steam recreates what it needs.', 'Steam');
  if (/\\steamapps\\workshop(\\|$)/.test(l)) return R('review', 'Steam Workshop mods', 'Mods you subscribed to in Steam Workshop.', 'Unsubscribe in Steam to remove them properly.', 'Steam');
  if (/\\(epic games|ubisoft game launcher\\games|gog galaxy\\games|xboxgames|ea games)\\/.test(l)) return R('review', 'Game', 'Files of an installed game.', 'Uninstall the game from its launcher instead of deleting files.', 'Game launcher');
  if (/\\(docker|wsl)\\/.test(l) || /\\packages\\canonicalgroup/.test(l)) return R('keep', 'Linux / Docker virtual disk', 'The virtual disk of WSL (Linux on Windows) or Docker with all its files.', 'Do not delete. Free space from inside Linux/Docker (e.g. "docker system prune"), then compact the disk.', 'WSL / Docker');
  if (LOCAL && (l === LOCAL + '\\temp' || l.startsWith(LOCAL + '\\temp\\'))) return R('safe', 'Temporary file', 'A temporary file left by a program.', 'The Cleaner removes temp files older than a day safely.', 'Temporary files');
  if (/\\(onedrive|dropbox|google drive|mega)(\\| - )/.test(l)) return R('review', 'Cloud-synced file', 'This file is synchronized with cloud storage.', 'Deleting it here deletes it in the cloud and on your other devices too. Use "Free up space" in the cloud app instead to keep it online only.', titleCase(l.match(/\\(onedrive|dropbox|google drive|mega)/)[1]));
  if (HOME && l.startsWith(HOME + '\\downloads')) return withOwner(extInfo(l, isDir) || R('review', 'Download', 'Something you downloaded from the internet.', 'Safe to delete if you no longer need it — downloads are rarely needed after use.'), owner || 'Your downloads');
  if (HOME && /\\(videos|pictures|documents|desktop|music)(\\|$)/.test(l.slice(HOME.length)) && l.startsWith(HOME)) return withOwner(extInfo(l, isDir) || R('review', 'Personal files', 'Your own files.', 'Only delete what you are sure you don’t need. Consider moving large files to another drive.'), 'You');

  if (owner && !isDir && /\.(exe|dll)$/.test(l)) return R('keep', 'Program file', td('Part of {owner}.', {owner}), td('Uninstall {owner} in Programs instead of deleting its files.', {owner}), owner);
  const ext = !isDir && extInfo(l, false);
  if (owner) {
    const inProgramFiles = PF.some(pf => l.startsWith(pf + '\\'));
    if (ext && (ext.verdict === 'safe')) return withOwner(ext, owner);
    if (inProgramFiles) return R('keep', ext?.kind || (isDir ? 'Program folder' : 'Program file'), td('Belongs to the installed program {owner}.', {owner}), td('Don’t delete files here — uninstall {owner} from Programs to remove it completely.', {owner}), owner);
    return R('review', ext?.kind || (isDir ? 'App data' : 'App data file'), td('Settings, cache or data of {owner}.', {owner}), td('Deleting can reset or break {owner}. Use the Cleaner for its cache, or uninstall {owner} if you don’t use it.', {owner}), owner);
  }
  // Unknown owner, but known place.
  for (const [root, label] of [[ROAMING, 'roaming app data'], [LOCAL, 'local app data'], [PD, 'shared app data']]) {
    if (root && l.startsWith(root + '\\')) {
      const folder = folderOwnerName(p.slice(root.length));
      if (ext && ext.verdict === 'safe') return withOwner(ext, titleCase(folder));
      return R('review', 'App data', td('Data stored by an app in its "{folder}" folder ({location}). No installed program with that name was found — it may be left over from an uninstalled app.', {folder: titleCase(folder), location: td(label)}), 'If you don’t recognise or use that app anymore, it is usually safe to delete. If unsure, leave it.', titleCase(folder));
    }
  }
  if (PF.some(pf => l.startsWith(pf + '\\'))) {
    const folder = folderOwnerName(p.slice(PF.find(pf => l.startsWith(pf + '\\')).length));
    return R('review', 'Program folder', td('Program files in "{folder}", which isn\'t in the installed programs list — possibly a leftover of an uninstalled app or a portable program.', {folder: titleCase(folder)}), 'If you no longer use that program, you can delete the folder. Check Programs first.', titleCase(folder));
  }
  if (ext) return ext;
  if (isDir) return R('review', 'Folder', 'A folder Aster can’t attribute to a specific program.', 'Open it to see what’s inside before deciding.');
  const parent = path.basename(path.dirname(p));
  return R('review', 'Unknown file', td('Aster can’t tell which program created this file — its name and type ({ext}) are not a known format. It is stored in the folder "{folder}".', {ext: path.extname(p) || td('no extension'), folder: parent}), 'The folder name is the best clue. If you created that folder or recognise the app, decide based on that; otherwise it’s safer to leave the file alone.', parent ? titleCase(parent) : null);
}

// The index Windows Search builds (Windows.db, or Windows.edb on older builds, and its helper files). It holds no documents and
// Windows can build it again, but it is open all the time, so it is reset (rebuilt), not deleted by hand.
const BIG_INDEX = 3 * 1024 ** 3;
function searchIndex(isDir, size) {
  const big = size != null && size > BIG_INDEX;
  const what = big
    ? td('The catalogue Windows Search keeps of your files — names, properties and the words inside documents — so searching in Start and File Explorer is instant. It contains none of your documents and Windows can build it again. It is not part of Microsoft Office or any other program. A normal index is a few hundred megabytes to about 2 GB; this one is {size}, usually because many folders full of small files (projects, downloads, mail) are indexed.', {size: sizeText(size)})
    : 'The catalogue Windows Search keeps of your files — names, properties and the words inside documents — so searching in Start and File Explorer is instant. It contains none of your documents and Windows can build it again. It is not part of Microsoft Office or any other program.';
  return {...R('safe', isDir ? 'Windows Search index folder' : 'Windows Search index', what, 'Safe to reset — but not by deleting the file: Windows keeps it open, and a half-deleted index can break search. Use “Rebuild the search index”: Aster asks Windows for permission, Windows deletes the index and builds a new one in the background. Search may miss results for a while, and your indexing locations may return to the defaults. Afterwards, exclude huge project folders in Settings → Privacy & security → Searching Windows to keep it small.', 'Windows'), action: 'rebuildSearch'};
}

function extInfo(l, isDir) { if (isDir) return null; const hit = EXT.find(([re]) => re.test(l)); return hit ? {...hit[1]} : null; }
function withOwner(info, owner) { return {...info, owner: info.owner || owner}; }
function titleCase(s) { s = String(s || ''); return s === s.toLowerCase() ? s.replace(/\b\w/g, c => c.toUpperCase()) : s; }

const VENDOR_DIRS = new Set(['microsoft', 'windows', 'google', 'adobe', 'intel', 'nvidia', 'amd', 'apple', 'mozilla', 'oracle', 'packages', 'common files', 'microsoft shared', 'software', 'programs']);

function matchProgram(l, programs) {
  let best = null;
  for (const p of programs) {
    const loc = (p.location || '').toLowerCase().replace(/\\+$/, '');
    if (loc && loc.length > 3 && (l === loc || l.startsWith(loc + '\\')) && (!best || loc.length > best.len)) best = {name: p.name, len: loc.length};
  }
  if (best) return best.name;
  // AppData\<Publisher or Program>\...
  for (const root of [ROAMING, LOCAL, PD, path.join(path.dirname(LOCAL || ''), 'locallow').toLowerCase()]) {
    if (!root || !l.startsWith(root + '\\')) continue;
    const parts = l.slice(root.length + 1).split('\\');
    const cands = [parts[0], parts[1]].filter(Boolean);
    for (const c of cands) {
      // A bare vendor folder (Microsoft, Google…) says nothing about which of that vendor's programs owns the data.
      const hit = programs.find(p => { const n = p.name.toLowerCase(); const pub = (p.publisher || '').toLowerCase(); return c.length > 2 && (n === c || (!VENDOR_DIRS.has(c) && n.startsWith(c + ' ')) || n.replace(/\s+/g, '') === c.replace(/\s+/g, '') || (pub && pub.split(/[ ,.]/)[0] === c && parts[1] && n.includes(parts[1]))); });
      if (hit) return hit.name;
    }
  }
  return null;
}

const VERSION_INFO = String.raw`
$out = foreach ($p in @($in.paths)) {
  try { $v = (Get-Item -LiteralPath $p -ErrorAction Stop).VersionInfo; [pscustomobject]@{ path = $p; company = $v.CompanyName; product = $v.ProductName; description = $v.FileDescription } } catch {}
}
Out-Json @($out)
`;

// ---------------------------------------------------------------------------------------------------------
// Smart places: folders where some files are still needed and others are not (see smart.cjs). The general rules above
// can only say "the whole folder is the installer cache, keep it"; here each file is checked against what is installed.
// The classifiers are cached for a minute, so opening folders one after another reads the registry once.
// ---------------------------------------------------------------------------------------------------------
const INSTALLER = path.join(process.env.SystemRoot || 'C:\\Windows', 'Installer');
const SMART_TTL = 60e3;
const smartCache = new Map();
const smartOnce = (key, make) => {
  const hit = smartCache.get(key);
  if (hit && Date.now() - hit.at < SMART_TTL) return hit.value;
  const value = make();
  smartCache.set(key, {at: Date.now(), value});
  return value;
};
const resetSmartCache = () => smartCache.clear();
const within = (l, dir) => { const d = dir.toLowerCase().replace(/\\+$/, ''); return l === d || l.startsWith(d + '\\'); };

function sizeText(n) {
  const units = getLanguage() === 'ru' ? ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'] : ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toLocaleString(locale(), {maximumFractionDigits: i ? 1 : 0})} ${units[i]}`;
}

const INSTALLER_OWNER = 'Windows Installer';

function explainInstaller(p, isDir, l, cls) {
  const here = INSTALLER.toLowerCase();
  const name = path.basename(l);
  const unchecked = cls.state === 'unreadable';
  if (l === here) {
    let orphans = 0, orphanBytes = 0, needed = 0, neededBytes = 0;
    if (!unchecked) {
      try {
        for (const e of fs.readdirSync(INSTALLER, {withFileTypes: true})) {
          if (!e.isFile() || !/\.(msi|msp)$/i.test(e.name)) continue;
          const file = path.join(INSTALLER, e.name);
          const st = fs.lstatSync(file);
          if (cls.removable(file, st)) { orphans++; orphanBytes += st.size; } else { needed++; neededBytes += st.size; }
        }
      } catch {}
    }
    if (unchecked || !(orphans + needed)) return R('keep', 'Windows Installer cache', 'Copies of installers Windows needs to update, repair or uninstall your programs. Aster could not check which of them are still needed.', 'Do not delete the folder or its files. Run Aster as administrator and analyze again to check them.', INSTALLER_OWNER);
    return R(orphans ? 'review' : 'keep', 'Windows Installer cache',
      td('Copies of installers Windows needs to update, repair or uninstall your programs. Aster checked each package: {needed} files ({neededSize}) are still needed by installed programs, and {orphans} files ({orphanSize}) are no longer used by any program or update.', {needed, neededSize: sizeText(neededBytes), orphans, orphanSize: sizeText(orphanBytes)}),
      orphans ? 'Never delete the folder itself. Open it and select the files marked Safe — only those can go. The Cleaner’s “Unused Windows Installer files” does the same in one step.' : 'Do not delete — every package here is still needed by an installed program or update.', INSTALLER_OWNER);
  }
  if (path.dirname(l) === here && /\.(msi|msp)$/i.test(name)) {
    if (unchecked) return R('keep', 'Windows Installer package', 'An installer or update package kept by Windows. Aster could not check whether an installed program still needs it.', 'Leave it. Run Aster as administrator and analyze again to check it.', INSTALLER_OWNER);
    let st = null;
    try { st = fs.lstatSync(p); } catch {}
    const status = cls.status(p, st);
    const ref = cls.ref(p);
    if (status === 'needed') {
      const patch = ref?.kind === 'patch';
      const what = ref?.name
        ? td(patch ? 'Needed by the update {name}. Windows keeps this copy so the update can be repaired or removed.' : 'Needed by {name}. Windows keeps this copy so the program can be repaired, updated or uninstalled.', {name: ref.name})
        : (patch ? 'Needed by an installed update. Windows keeps this copy so the update can be repaired or removed.' : 'Needed by an installed program. Windows keeps this copy so the program can be repaired, updated or uninstalled.');
      return R('keep', patch ? 'Update package in use' : 'Installer package in use', what, 'Do not delete — the program or update could no longer be repaired, updated or removed.', ref?.name || INSTALLER_OWNER);
    }
    if (status === 'recent') return R('review', 'New Windows Installer package', 'Added to the Installer folder in the last 24 hours, so it may belong to an installation or update that is still running.', 'Leave it for now. If it is still unused tomorrow, Aster marks it as safe to delete.', INSTALLER_OWNER);
    if (status === 'orphan') return R('safe', 'Unused Windows Installer package', 'No installed program or update refers to this file any more. It was left behind by a program that was removed or by an update that was replaced, and Windows will never read it again.', 'Safe to delete. Moving it to the Recycle Bin keeps it restorable. Only unused packages can be moved from this folder.', INSTALLER_OWNER);
  }
  if (isDir && name === '$patchcache$') return R('keep', 'Update uninstall cache', 'The original files of programs, kept so Windows can remove or repair their updates.', 'Do not delete — updates could no longer be uninstalled.', INSTALLER_OWNER);
  if (isDir && path.dirname(l) === here && /^\{[0-9a-f-]{36}\}$/.test(name)) return R('keep', 'Program icons', 'Icons that installed programs use for their shortcuts and in the list of installed programs.', 'Do not delete — shortcuts and Programs would show blank icons.', INSTALLER_OWNER);
  return null;
}

function explainSquirrel(l, cls) {
  const info = cls.info(l);
  if (!info) return null;
  const app = titleCase(info.app);
  if (info.kind === 'old') return R('safe', 'Old app version', td('Version {version} of {app}, replaced by version {latest}. The app starts the newer version, so this older copy is not used any more.', {version: info.version, app, latest: info.latest}), td('Safe to delete while {app} is closed. The Cleaner’s “Old app versions” removes them in one step.', {app}), app);
  if (info.kind === 'current') return R('keep', 'Current app version', td('Version {version} of {app} — the one the app runs.', {version: info.version, app}), td('Do not delete — uninstall {app} from Programs instead.', {app}), app);
  if (info.kind === 'root') return R(info.old ? 'review' : 'keep', 'Self-updating app', info.old ? td('{app} updates itself by installing each new version next to the old one. Older versions are still here ({count}) and can go; the newest version, the updater and the downloaded packages stay.', {app, count: info.old}) : td('{app} updates itself. Only its current version is here.', {app}), info.old ? 'Open the folder and select the old app-… version folders marked Safe. Never delete the newest version or Update.exe.' : td('Do not delete — uninstall {app} from Programs instead.', {app}), app);
  return R('keep', 'App updater', td('The updater and downloaded update packages of {app}.', {app}), td('Do not delete — {app} needs them to update itself.', {app}), app);
}

// Explanation for one item in a smart place, or null when the general rules apply.
async function smartExplain(it) {
  const p = it.path;
  const l = p.toLowerCase().replace(/\\+$/, '');
  if (within(l, INSTALLER)) return explainInstaller(p, !!it.dir, l, await smartOnce('installer', () => smart.installerCache({dir: INSTALLER})));
  if (LOCAL && l.startsWith(LOCAL + '\\')) return explainSquirrel(l, await smartOnce('squirrel', () => smart.squirrelOldVersions({base: LOCAL})));
  return null;
}

async function identify({items, programs}) {
  const exes = items.filter(i => !i.dir && /\.(exe|dll|sys)$/i.test(i.path)).map(i => i.path).slice(0, 60);
  const meta = new Map();
  if (exes.length) for (const m of arr(await psJson(VERSION_INFO, {paths: exes}, {timeout: 20000}).catch(() => []))) meta.set(m.path.toLowerCase(), m);
  const out = {};
  for (const it of items) {
    const special = await smartExplain(it);
    if (special) { out[it.path] = {...translate(special), smart: true}; continue; }
    const info = classify(it.path, !!it.dir, programs, Number.isFinite(it.size) ? it.size : null);
    const m = meta.get(it.path.toLowerCase());
    if (m && (m.product || m.company)) {
      info.owner = info.owner || [m.product, m.company].filter(Boolean)[0];
      if (m.description) info.what = m.company ? td('{description} by {company}. {what}', {description: m.description, company: m.company, what: info.what}) : `${m.description}. ${info.what}`;
    }
    out[it.path] = info;
  }
  return out;
}

module.exports = {identify, classify, EXT, resetSmartCache};
