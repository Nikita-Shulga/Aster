'use strict';
// English messages made in the main process. ru.cjs has exactly the same keys (test/i18n.test.cjs checks).
// {name} is a placeholder; {one, other} objects are plural forms chosen by {count}.
// Explanations stored next to their logic (rules, tweaks, file types) are translated by locales/ru-data instead.
module.exports = {
  // ---------- General ----------
  'error.failed': 'The operation failed.',
  'main.couldNotStart': 'Aster could not start',

  // ---------- Activity log (History). Older entries are matched against these texts, so keep them stable. ----------
  'activity.cleaned': 'Cleaned {count} files',
  'activity.trashedFilesBin': {one: 'Moved {count} file to the Recycle Bin', other: 'Moved {count} files to the Recycle Bin'},
  'activity.trashedFilesTrash': {one: 'Moved {count} file to the Trash', other: 'Moved {count} files to the Trash'},
  'activity.trashedItems': {one: 'Moved {count} item to the Recycle Bin', other: 'Moved {count} items to the Recycle Bin'},
  'activity.registryFixed': {one: 'Fixed {count} registry issue', other: 'Fixed {count} registry issues'},
  'activity.regSetValue': 'Set value "{name}"',
  'activity.regDeleteValue': 'Deleted value "{name}"',
  'activity.regCreateKey': 'Created key "{name}"',
  'activity.regDeleteKey': 'Deleted key',
  'activity.regRenameValue': 'Renamed value "{name}" to "{newName}"',
  'activity.regImported': 'Imported registry file',
  'activity.macLeftovers': {one: 'Moved {count} leftover item to the Trash', other: 'Moved {count} leftover items to the Trash'},
  'activity.macAppTrashed': 'Moved {name} to the Trash',
  'activity.macLeftoversOf': {one: 'Moved {count} leftover of {name} to the Trash', other: 'Moved {count} leftovers of {name} to the Trash'},
  'activity.macLeftoversOfApp': {one: 'Moved {count} leftover of an app to the Trash', other: 'Moved {count} leftovers of an app to the Trash'},
  'activity.uninstalled': 'Uninstalled {name}',
  'activity.entryRemoved': 'Removed program entry: {name}',
  'activity.leftoversOf': {one: 'Removed {count} leftover of {name}', other: 'Removed {count} leftovers of {name}'},
  'activity.leftoversOfProgram': {one: 'Removed {count} leftover of a program', other: 'Removed {count} leftovers of a program'},
  'activity.startupEnabled': 'Enabled {name} at startup',
  'activity.startupDisabled': 'Disabled {name} at startup',
  'activity.startupRemoved': 'Removed {name} from startup',
  'activity.startupAdded': 'Added {name} to startup',
  'activity.loginItemAdded': 'Added {name} to login items',
  'activity.updated': 'Updated {name} to {version}',
  'activity.updatingAster': 'Updating Aster to {version}',
  'activity.display': 'Display set to {w}×{h} at {f} Hz',
  'activity.powerPlan': 'Changed power plan',
  'activity.highPerformance': 'Added and activated the High performance power plan',
  'activity.screenAfter': 'Turn off screen after: {count} min',
  'activity.screenNever': 'Turn off screen after: never',
  'activity.displayAfter': 'Turn off display after: {count} min',
  'activity.displayNever': 'Turn off display after: never',
  'activity.sleepAfter': 'Sleep after: {count} min',
  'activity.sleepNever': 'Sleep after: never',
  'activity.processClosed': 'Closed {name}',
  'activity.appQuit': 'Quit {name}',
  'activity.dnsFlushed': 'Flushed DNS cache',
  'activity.restorePoint': 'Created a system restore point',
  'activity.snapshot': 'Created a Time Machine local snapshot',
  'activity.snapshotsRemoved': 'Removed Time Machine local snapshots',
  'activity.spotlight': 'Started rebuilding the Spotlight index',
  'activity.purge': 'Freed inactive memory',
  'activity.trashEmptied': 'Emptied the Trash',
  'activity.launchServices': 'Rebuilt the Launch Services database',
  'activity.searchShortcuts': {one: 'Added {count} app to the Start menu so Windows Search finds it', other: 'Added {count} apps to the Start menu so Windows Search finds them'},
  'activity.searchShortcutsRemoved': {one: 'Removed {count} Start menu shortcut Aster had added', other: 'Removed {count} Start menu shortcuts Aster had added'},
  'activity.searchRestarted': 'Restarted search',
  'activity.searchRebuilt': 'Started rebuilding the Windows Search index',
  'activity.searchServiceOn': 'Turned the Windows Search service back on',
  'activity.spotlightOn': 'Turned Spotlight indexing on',
  'activity.spotlightImported': {one: 'Added {count} app to Spotlight', other: 'Added {count} apps to Spotlight'},
  'activity.tweak': '{title}: {before} → {after}',

  // ---------- Dialogs ----------
  'dialog.exclusion': 'Choose a folder Aster should never clean',
  'dialog.exportKey': 'Export registry key',
  'dialog.importReg': 'Import a registry file',
  'dialog.regFile': 'Registration file',
  'dialog.loginApp': 'Choose an app to open at login',
  'dialog.applications': 'Applications',
  'dialog.startupProgram': 'Choose a program to run at sign-in',
  'dialog.programs': 'Programs',
  'dialog.analyzeFolder': 'Choose a folder to analyze',
  'main.elevationCancelled': 'Elevation was cancelled.',
  'main.unknownScan': 'Unknown scan',

  // ---------- macOS application menu ----------
  'menu.about': 'About {name}',
  'menu.services': 'Services',
  'menu.hide': 'Hide {name}',
  'menu.hideOthers': 'Hide Others',
  'menu.showAll': 'Show All',
  'menu.quit': 'Quit {name}',
  'menu.edit': 'Edit',
  'menu.undo': 'Undo',
  'menu.redo': 'Redo',
  'menu.cut': 'Cut',
  'menu.copy': 'Copy',
  'menu.paste': 'Paste',
  'menu.pasteAndMatchStyle': 'Paste and Match Style',
  'menu.delete': 'Delete',
  'menu.selectAll': 'Select All',
  'menu.view': 'View',
  'menu.resetZoom': 'Actual Size',
  'menu.zoomIn': 'Zoom In',
  'menu.zoomOut': 'Zoom Out',
  'menu.fullScreen': 'Toggle Full Screen',
  'menu.window': 'Window',
  'menu.minimize': 'Minimize',
  'menu.zoom': 'Zoom',
  'menu.front': 'Bring All to Front',

  // ---------- Cleaner ----------
  'cleaner.profileN': 'profile {n}',
  'cleaner.appRunning': '{app} is running',
  'cleaner.analyzeAgain': 'Analyze again and retry.',
  'cleaner.notPartOfItem': 'Not part of this item.',
  'cleaner.notAFile': 'Not a file.',
  'cleaner.recycleBinOn': 'Recycle Bin on drive {drive}',

  // ---------- Settings and backups ----------
  'store.unknownBackup': 'Unknown backup',
  'store.restoreDenied': 'Access denied. Restart Aster as administrator to restore system keys.',
  'store.restoreFailed': 'The backup could not be imported.',

  // ---------- store ----------
  'ps.requiresWindows': 'This feature requires Windows.',
  'ps.timedOut': 'The operation timed out.',
  'ps.exitCode': 'PowerShell exited with code {code}',
  'disk.analyzeAgain': 'Analyze this location again.',
  'disk.chooseFolderOrDrive': 'Choose a folder or drive.',
  'disk.locationMissing': 'This location does not exist.',

  // ---------- updater ----------
  'updater.githubStatus': 'GitHub answered {status}. Try again later.',
  'updater.sumsFailed': 'Could not download the checksums ({status}).',
  'updater.sumsMissing': 'The checksums don\'t list {name}.',
  'updater.downloadFailed': 'Download failed ({status}).',
  'updater.installing': 'Installing Aster {version}. Aster will reopen in a moment.',
  'updater.portableOpened': 'Opening Aster {version}. The new version was saved as {name} next to the old one, which you can delete.',
  'updater.macOpened': 'Aster {version} is open in Finder. Quit Aster, drag the new Aster into Applications and choose Replace.',
  'updater.installerOpened': 'The Aster {version} installer is open. Follow its steps; it will close this copy of Aster.',

  // ---------- programs-main ----------
  'programs.leftoverValues': '{count} values',
  'programs.leftoverSubkeys': '{count} subkeys',

  // ---------- tools-main ----------
  'tools.msinfo': 'System Information',

  // ---------- mac ----------
  'mac.snapshotsRemoved': {one: 'Removed up to {count} local snapshot', other: 'Removed up to {count} local snapshots'}
};
