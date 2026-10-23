# Changelog

## Unreleased
- **Choose single files in Cleaner**: every item has *Choose files*, which lists all its files (the largest 5,000) with search, sorting (largest, newest, oldest, name) and a location filter. Tick any files — or all that match — and send them to the Recycle Bin / Trash, or delete them right away like a normal clean. Before, only the 40 largest files could be removed, one at a time.
- **Automatic cleaning** (*Settings*): every day or every week Aster cleans the Cleaner items you selected that are marked *Safe*, without opening a window. Running apps are skipped, the result appears in History, and an optional notification says how much was freed. A missed run starts as soon as the computer is on. Uses a scheduled task on Windows and a launch agent on macOS; turning it off removes them.
- **Empty folders** (*Storage*): finds folders with nothing in them (or only Thumbs.db / .DS_Store) on a drive, in your home folder or any folder, shown at their top-most empty level with a drive and age filter. They go to the Recycle Bin / Trash and are checked again first. System folders, Program Files / Applications, AppData / Library, hidden folders and the standard folders of your profile are never offered.
- **Drive health** (*Overview*): the S.M.A.R.T. status of every physical drive — *Healthy*, *Warning* or *Failing* — with its type, size and drive letters, plus wear, temperature and powered-on hours when Windows shares them (as administrator). A failing drive gets a clear "back up now" warning.
- **Repair Windows** (*Tools*): System File Checker (sfc /scannow), DISM image repair and a drive error scan (with "Fix errors", at the next restart for the Windows drive), each explained with how long it takes, live progress and a plain result with the next step. On macOS: **Check your disk** runs First Aid's check of the startup disk.

## 2.5.0 — 2026-10-23
- **Fix search** (*Tools*): when Windows Search can't find an app you have installed, Aster finds out why and fixes it. It checks that the search service runs, that the index answers and that your Start menu is in it, and it lists the programs Windows Search can't see because they have **no Start menu shortcut**, which is how Windows Search finds apps. These are usually apps on a second drive or left from an earlier Windows, like Epic Games Launcher. Each one shows its icon, publisher, path and drive, with a drive filter and search. Tick the ones you use and Aster adds them to your Start menu (your account only; remove them again from the same card). Also: **Restart search** for a blank or frozen search box (no admin needed), **Turn on** the search service and **Rebuild the index**, both after a Windows permission prompt.
- **Fix Spotlight** on macOS: the same card checks Spotlight indexing and its index, lists apps in Applications that Spotlight never imported and adds them, and restarts Spotlight or rebuilds its index. It replaces the old *Rebuild Spotlight index* button.

## 2.4.0 — 2026-10-20
- **Aster speaks Russian**: *Settings → Language → Interface language* switches between **English** and **Русский** right away, without a restart. Everything is translated — pages, dialogs and messages, the explanation of every cleaner item, registry category, tweak and file type, History entries (older ones too) and the macOS menu bar. Numbers, sizes and dates follow the chosen language (“1,5 ГБ”). English stays the default for new and existing users; Aster never picks the language from the system.

## 2.3.0 — 2026-10-19
- **Results stay after you close Aster**: the last Disk analyzer, Duplicates and Cleaner results are saved and shown again when you reopen Aster, marked *Results from your previous scan* with the date, next to the button for a fresh scan. You can still click into folders of a saved disk analysis; duplicate files that no longer exist are left out. Results are stored compressed in Aster's data folder, on Windows and macOS.

## 2.2.0 — 2026-10-19
- **Update Aster from Settings**: *Settings → Updates → Check for updates* asks GitHub for the latest release and shows what's new. *Update now* downloads it, checks it against the release's published SHA-256 checksum, installs it silently and reopens Aster on the new version. The portable app saves the new version next to the old one and opens it; on a Mac the new DMG opens in Finder. Aster only goes online when you click.
- The version badge next to the Aster logo now shows the installed version (2.1.0 still said "2.0").

## 2.1.0 — 2026-10-19

### Cleaner: clean exactly what you want
- **Delete a single file**: every file in “Show largest files” has its own Trash button (it goes to the Trash/Recycle Bin, so it can be put back). Up to the 40 largest files per item are listed.
- **Clean a single location**: each location of an item has its own clean button, e.g. clean only Steam’s cache and keep the rest.
- **App caches on Mac are split per app** (R, Steam, Epic, Zoom…), so one app’s cache can be cleaned on its own.
- Long file paths no longer push the results off the edge of the window.

### macOS fixes (tested on a MacBook Air M4, macOS 15.5)
- **Memory usage** on Overview now matches Activity Monitor (app memory + wired + compressed). It used to show ~99% because macOS reports almost no "free" memory while it caches files.
- **Leftovers no longer flags macOS's own folders** such as contactsd, tipsd, Animoji, DifferentialPrivacy and the Assistant/Baseband/Sync logs, or CUPS printing settings. Before, some of these were pre-selected as "Safe to fix".
- **Leftovers recognises more installed apps**: data whose name differs from the app's bundle id (UltiMaker Cura → `cura`, Epic Games Launcher → `Epic`, Zoom → `ZoomPhone`, AmneziaVPN, Dropbox updater) is no longer offered for removal.
- **Retina displays** are detected correctly in Display info.
- **Safari, Mail and other Apple apps** can be quit from Optimize → running apps; before, they were locked as system processes.
- **Empty the Trash** goes through Finder, so it works without Full Disk Access.

### macOS additions
- **Battery health** (maximum capacity and cycle count) on Overview for MacBooks.
- **Tools → Free up memory**: runs `purge` to release inactive memory.
- **New Mac settings**: Turn off Power Nap, keep background apps at full speed (App Nap), keep folders on top, show your Library folder, save new documents to this Mac instead of iCloud, expanded save dialogs.
- **Cleaner**: caches of Claude, Cursor, Notion and Obsidian.

## 2.0.0 — 2026-10-19

### macOS
Aster now runs natively on macOS (Apple Silicon and Intel, macOS 12+), with every feature rebuilt for how a Mac works:
- **Cleaner**: app caches, logs, crash reports, temporary files, Quick Look thumbnails, Trash, iPhone/iPad update files, old installers in Downloads, Mail attachments, Safari, Chrome, Edge, Brave, Arc, Vivaldi, Opera, Yandex, Firefox, Xcode build files and device support, Homebrew, npm, pip, Yarn, CocoaPods, Gradle, Adobe media cache, Discord, Spotify, Slack, Teams, VS Code, Steam.
- **Leftovers** (replaces the registry on Mac): settings, caches, saved state, logs, app data and sandbox containers of apps that are no longer installed, plus launch agents pointing to deleted programs — all moved to the Trash.
- **Programs**: every app with version, size, volume, App Store / Apple / downloaded type and when it was last opened. Uninstall quits the app, moves it to the Trash and removes its data from ~/Library.
- **Startup**: login items, launch agents and background daemons, switched on/off with launchctl like System Settings does.
- **Updates**: macOS updates, Homebrew formulae and casks, and Mac App Store apps (with `mas`).
- **Optimize & Mac settings**: window animations, Dock, Spotlight, Low Power Mode, .DS_Store on network/USB drives, personalized ads, analytics, Finder, Dock, keyboard & trackpad, screenshots and appearance; screen and sleep timers; display info.
- **Tools**: Time Machine snapshots, free purgeable snapshot space, Spotlight rebuild, Launch Services reset, DNS flush.
- **Disk analyzer & duplicates** understand macOS volumes and folders and explain files like sleepimage, Docker.raw, iPhone backups, iCloud Drive and Photos libraries.
- **Full Disk Access** guidance replaces “Restart as administrator”; admin-only actions use the macOS password prompt.

### Also
- GitHub Actions builds and tests on real Windows and macOS machines and attaches both platforms' installers to releases.

## 1.2.0 — 2026-10-18

### Filters everywhere
- **Programs**: new Drive column and a clickable per-drive breakdown; filter by type, drive, publisher, size and install date. Every filter option shows how many items it matches.
- **Startup**: Drive column; filter by status (enabled, disabled, file missing, unknown publisher), drive, who it applies to, and publisher.
- **Cleaner**: filter results by drive, recommendation and category, and sort them. "Clean shown" cleans only what is visible — with a drive filter, only that drive is cleaned (including that drive's Recycle Bin).
- **Registry**: search issues; filter by recommendation, HKCU/HKLM, the drive of the missing file, and whether admin rights are needed; select or unselect everything shown.
- **Disk analyzer**: search the current folder; filter by folders/files, file type, size, modified date and the "Delete?" verdict. The treemap and largest-files list follow the filters; click a file type to filter by it.
- **Duplicates**: search across all drives at once; filter by drive, file type and whether copies are on the same or different drives; sort by space wasted, file size or number of copies; auto-select "keep the copy on drive X".
- **Updates**: search and filter by size of the change (major upgrade, feature update, bug-fix).
- **Optimize**: search; show only recommended-but-not-applied, already applied or changed items; filter by recommendation, admin rights and when it takes effect.
- **History**: search and filter by time period.

## 1.1.0 — 2026-10-18

### Smarter explanations
- **Cleaner**: every item says what is stored there, what you lose if you delete it and a clear verdict (Safe / Read first / Keep). Results show where the data lives, grouped by drive and folder, instead of raw file names. The confirmation lists exactly which choices you will notice.
- **Disk analyzer**: every large file and folder is identified — what it is, which program it belongs to, and whether deleting it is safe (e.g. pagefile.sys, hiberfil.sys, game data, virtual disks, app data of uninstalled programs).
- **Registry cleaner**: each category explains what it is and what fixing changes; only safe categories are pre-selected, and an honest note explains what registry cleaning does and doesn't do.

### New
- **Optimize**: 16 reversible performance, gaming and privacy tweaks (startup delay, menu speed, animations, hibernation, Storage Sense, Game Mode, background recording, GPU scheduling, mouse acceleration, ads and tips, web search in Start, telemetry), power plans with explanations, "Apply all recommended", and a list of apps using the most memory.
- **Windows settings**: monitor refresh rate and resolution (with a 15-second auto-revert), screen/sleep timeouts, light/dark mode, file extensions, hidden files, classic right-click menu, taskbar alignment, search box, End task, clipboard history.
- Smart Scan now also checks optimizations.
- Every setting change shows before → after, the trade-off and whether a restart is needed.

## 1.0.0 — 2026-10-18

A ground-up rebuild of Aster. Replaces the 0.x alpha series.

### New
- **Smart Scan** on the Overview: junk, registry, startup and updates in one pass, with "Fix everything".
- **Cleaner** that actually cleans: 40+ rules for Windows, seven browsers and popular apps, running-app detection, auto-close option and folder exclusions.
- **Registry cleaner** with 13 issue categories and automatic `.reg` backups.
- **Full registry editor**: all hives and value types, create/rename/delete, search, import/export.
- **Uninstaller** that runs the real uninstaller, then removes leftover folders (to the Recycle Bin) and registry keys (backed up). Store apps, batch uninstall, broken-entry cleanup.
- **Startup manager** covering Run keys, startup folders, scheduled tasks and services, using Windows' own enable/disable flags.
- **One-click app updates** through WinGet.
- **Disk analyzer** with treemap, drill-down, file types and largest files.
- **Duplicate finder** using content hashing.
- **Tools**: restore points, DNS flush, Recycle Bin, Windows utility launcher.
- **History** with one-click restore of every registry backup.
- **Restart as administrator** for system-wide areas.

### Design
- New design system: one stylesheet, light/dark/system themes, Inter typography, consistent spacing, cards, tables, modals and toasts.
- Native-feeling window with Windows title-bar controls, new app icon.

### Removed
- The 0.x "review-only" pages (organization plans, version catalogs, maintenance reminders and similar) that didn't change anything.
