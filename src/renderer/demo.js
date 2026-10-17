const GB = 1024 ** 3;
const MB = 1024 ** 2;
const base = '/Example home';
const make = (path, size, category, rest = {}) => ({path: base + '/' + path, name: path.split('/').pop(), size, category, modifiedAt:'2026-09-24T15:24:00Z', risk:'review', ...rest});
export const demoFiles = [
  make('Movies/Coastline — final cut.mov', 8.24*GB, 'Video'),
  make('Movies/Archive/Studio session 04.mp4', 5.8*GB, 'Video'),
  make('Movies/Archive/Winter in motion.mov', 4.2*GB, 'Video'),
  make('Downloads/Design assets 2025.zip', 3.4*GB, 'Archives', {cleanupReason:'An older download. Check whether you still need it.'}),
  make('Documents/Projects/Brand exploration.fig', 1.28*GB, 'Documents'),
  make('Pictures/Library/Field notes 01.tiff', 768*MB, 'Images', {duplicateGroup:'photo-1'}),
  make('Pictures/Exports/Field notes 01 copy.tiff', 768*MB, 'Images', {duplicateGroup:'photo-1'}),
  make('Pictures/Library/Field notes 02.tiff', 640*MB, 'Images'),
  make('Downloads/Installer-4.2.dmg', 548*MB, 'Archives', {cleanupReason:'An installer download. Keep it if you need to reinstall offline.'}),
  make('Music/Sound library/Coastal textures.wav', 420*MB, 'Audio'),
  make('Documents/Reference/Research collection.pdf', 184*MB, 'Documents', {duplicateGroup:'doc-1'}),
  make('Downloads/Research collection copy.pdf', 184*MB, 'Documents', {duplicateGroup:'doc-1', cleanupReason:'A matching copy is present. Confirm which location to keep.'}),
  make('Library/Caches/Creative Studio/preview.cache', 1.86*GB, 'Caches', {cleanupReason:'Regenerable application preview cache. Close the application first.',risk:'low'}),
  make('Library/Caches/Web browser/resource.cache', 840*MB, 'Caches', {cleanupReason:'Regenerable browser resource cache. Sites may load more slowly once.',risk:'low'}),
  make('Library/Logs/Creative Studio/session.log', 72*MB, 'Logs', {cleanupReason:'An old application log. Keep it if you are troubleshooting.',risk:'low'}),
  make('Documents/Projects/Notes.md', 62*1024, 'Documents'),
  make('Downloads/Fonts-collection.zip', 248*MB, 'Archives', {cleanupReason:'An older download. Check whether the archive is your only copy.'}),
  make('Pictures/Exports/Contact sheet.png', 18*MB, 'Images'),
];
export const demoSystem = {hostname:'Your computer',platform:'Demo environment',osName:'macOS / Windows',arch:'Example hardware',cpu:{model:'Example 8-core processor',cores:8},memory:{total:16*GB,free:6.3*GB},disk:{total:512*GB,free:186.4*GB},uptime:152340};
export const demoApps = [
  {name:'Creative Studio',version:'4.2.1',publisher:'Example Software',path:'/Applications/Creative Studio.app',size:2.8*GB},
  {name:'Web browser',version:'128.0',publisher:'Example Software',path:'/Applications/Web browser.app',size:684*MB},
  {name:'Notes',version:'3.8',publisher:'Example Software',path:'/Applications/Notes.app',size:142*MB},
  {name:'Audio workspace',version:'2.1',publisher:'Example Software',path:'/Applications/Audio workspace.app',size:1.2*GB},
];
export const demoStartup = [
  {name:'Cloud files',kind:'Login item',path:'/Applications/Cloud files.app',enabled:true,description:'Keeps your folders in sync'},
  {name:'Calendar companion',kind:'Login item',path:'/Applications/Calendar companion.app',enabled:true,description:'Displays upcoming events'},
  {name:'Creative Studio helper',kind:'Background item',path:'/Library/LaunchAgents/example.creative.plist',enabled:true,description:'Background application helper'},
];
export const demoScan = {id:'demo-scan',root:base,files:demoFiles,startedAt:'2026-10-16T10:00:00Z',completedAt:'2026-10-16T10:00:04Z',warnings:[],demo:true};
