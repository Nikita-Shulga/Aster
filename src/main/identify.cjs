'use strict';
// Explains what a file or folder is, which program it belongs to, and whether deleting it is safe.
// Order of evidence: well-known Windows files → well-known locations → installed programs owning the folder
// → executable metadata (company/product) → file type.
const path = require('node:path');
const {psJson, arr} = require('./ps.cjs');

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

function classify(p, isDir, programs) {
  const l = p.toLowerCase().replace(/\\+$/, '');
  const name = path.basename(l);
  const owner = matchProgram(l, programs);

  if (!isDir && SYSTEM_FILES[name]) return {...SYSTEM_FILES[name]};

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
  if (/\\steamapps\\common\\[^\\]+/.test(l)) { const game = p.match(/\\steamapps\\common\\([^\\]+)/i)[1]; return R('review', 'Steam game', `Files of the game "${titleCase(game)}".`, 'Don’t delete files by hand — uninstall the game in Steam to free this space.', `Steam · ${titleCase(game)}`); }
  if (/\\steamapps\\(shadercache|downloading|temp)(\\|$)/.test(l)) return R('safe', 'Steam cache / unfinished downloads', 'Shader cache or incomplete downloads of Steam.', 'Safe to delete; Steam recreates what it needs.', 'Steam');
  if (/\\steamapps\\workshop(\\|$)/.test(l)) return R('review', 'Steam Workshop mods', 'Mods you subscribed to in Steam Workshop.', 'Unsubscribe in Steam to remove them properly.', 'Steam');
  if (/\\(epic games|ubisoft game launcher\\games|gog galaxy\\games|xboxgames|ea games)\\/.test(l)) return R('review', 'Game', 'Files of an installed game.', 'Uninstall the game from its launcher instead of deleting files.', 'Game launcher');
  if (/\\(docker|wsl)\\/.test(l) || /\\packages\\canonicalgroup/.test(l)) return R('keep', 'Linux / Docker virtual disk', 'The virtual disk of WSL (Linux on Windows) or Docker with all its files.', 'Do not delete. Free space from inside Linux/Docker (e.g. "docker system prune"), then compact the disk.', 'WSL / Docker');
  if (LOCAL && (l === LOCAL + '\\temp' || l.startsWith(LOCAL + '\\temp\\'))) return R('safe', 'Temporary file', 'A temporary file left by a program.', 'The Cleaner removes temp files older than a day safely.', 'Temporary files');
  if (/\\(onedrive|dropbox|google drive|mega)(\\| - )/.test(l)) return R('review', 'Cloud-synced file', 'This file is synchronized with cloud storage.', 'Deleting it here deletes it in the cloud and on your other devices too. Use "Free up space" in the cloud app instead to keep it online only.', titleCase(l.match(/\\(onedrive|dropbox|google drive|mega)/)[1]));
  if (HOME && l.startsWith(HOME + '\\downloads')) return withOwner(extInfo(l, isDir) || R('review', 'Download', 'Something you downloaded from the internet.', 'Safe to delete if you no longer need it — downloads are rarely needed after use.'), owner || 'Your downloads');
  if (HOME && /\\(videos|pictures|documents|desktop|music)(\\|$)/.test(l.slice(HOME.length)) && l.startsWith(HOME)) return withOwner(extInfo(l, isDir) || R('review', 'Personal files', 'Your own files.', 'Only delete what you are sure you don’t need. Consider moving large files to another drive.'), 'You');

  if (owner && !isDir && /\.(exe|dll)$/.test(l)) return R('keep', 'Program file', `Part of ${owner}.`, `Uninstall ${owner} in Programs instead of deleting its files.`, owner);
  const ext = !isDir && extInfo(l, false);
  if (owner) {
    const inProgramFiles = PF.some(pf => l.startsWith(pf + '\\'));
    if (ext && (ext.verdict === 'safe')) return withOwner(ext, owner);
    if (inProgramFiles) return R('keep', ext?.kind || (isDir ? 'Program folder' : 'Program file'), `Belongs to the installed program ${owner}.`, `Don’t delete files here — uninstall ${owner} from Programs to remove it completely.`, owner);
    return R('review', ext?.kind || (isDir ? 'App data' : 'App data file'), `Settings, cache or data of ${owner}.`, `Deleting can reset or break ${owner}. Use the Cleaner for its cache, or uninstall ${owner} if you don’t use it.`, owner);
  }
  // Unknown owner, but known place.
  for (const [root, label] of [[ROAMING, 'roaming app data'], [LOCAL, 'local app data'], [PD, 'shared app data']]) {
    if (root && l.startsWith(root + '\\')) {
      const folder = folderOwnerName(p.slice(root.length));
      if (ext && ext.verdict === 'safe') return withOwner(ext, titleCase(folder));
      return R('review', 'App data', `Data stored by an app in its "${titleCase(folder)}" folder (${label}). No installed program with that name was found — it may be left over from an uninstalled app.`, 'If you don’t recognise or use that app anymore, it is usually safe to delete. If unsure, leave it.', titleCase(folder));
    }
  }
  if (PF.some(pf => l.startsWith(pf + '\\'))) {
    const folder = folderOwnerName(p.slice(PF.find(pf => l.startsWith(pf + '\\')).length));
    return R('review', 'Program folder', `Program files in "${titleCase(folder)}", which isn't in the installed programs list — possibly a leftover of an uninstalled app or a portable program.`, 'If you no longer use that program, you can delete the folder. Check Programs first.', titleCase(folder));
  }
  if (ext) return ext;
  if (isDir) return R('review', 'Folder', 'A folder Aster can’t attribute to a specific program.', 'Open it to see what’s inside before deciding.');
  const parent = path.basename(path.dirname(p));
  return R('review', 'Unknown file', `Aster can’t tell which program created this file — its name and type (${path.extname(p) || 'no extension'}) are not a known format. It is stored in the folder "${parent}".`, 'The folder name is the best clue. If you created that folder or recognise the app, decide based on that; otherwise it’s safer to leave the file alone.', parent ? titleCase(parent) : null);
}

function extInfo(l, isDir) { if (isDir) return null; const hit = EXT.find(([re]) => re.test(l)); return hit ? {...hit[1]} : null; }
function withOwner(info, owner) { return {...info, owner: info.owner || owner}; }
function titleCase(s) { s = String(s || ''); return s === s.toLowerCase() ? s.replace(/\b\w/g, c => c.toUpperCase()) : s; }

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
      const hit = programs.find(p => { const n = p.name.toLowerCase(); const pub = (p.publisher || '').toLowerCase(); return c.length > 2 && (n === c || n.startsWith(c + ' ') || n.replace(/\s+/g, '') === c.replace(/\s+/g, '') || (pub && pub.split(/[ ,.]/)[0] === c && parts[1] && n.includes(parts[1]))); });
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

async function identify({items, programs}) {
  const exes = items.filter(i => !i.dir && /\.(exe|dll|sys)$/i.test(i.path)).map(i => i.path).slice(0, 60);
  const meta = new Map();
  if (exes.length) for (const m of arr(await psJson(VERSION_INFO, {paths: exes}, {timeout: 20000}).catch(() => []))) meta.set(m.path.toLowerCase(), m);
  const out = {};
  for (const it of items) {
    const info = classify(it.path, !!it.dir, programs);
    const m = meta.get(it.path.toLowerCase());
    if (m && (m.product || m.company)) {
      info.owner = info.owner || [m.product, m.company].filter(Boolean)[0];
      if (m.description) info.what = `${m.description}${m.company ? ` by ${m.company}` : ''}. ${info.what}`;
    }
    out[it.path] = info;
  }
  return out;
}

module.exports = {identify, classify, EXT};
