# Aster on macOS

Aster runs natively on macOS 12 Monterey or later, on Apple silicon (M1–M4) and Intel Macs. It shares its interface with the Windows version, but every feature is built for how a Mac works.

## Installing

1. Download `Aster-<version>-mac-arm64.dmg` (Apple silicon) or `…-mac-x64.dmg` (Intel) from the [latest release](https://github.com/Nikita-Shulga/Aster/releases/latest). Not sure? Apple menu → **About This Mac**: “Chip: Apple M…” means Apple silicon.
2. Open the DMG and drag **Aster** to **Applications**.
3. Open Aster. Because the app is ad hoc signed but not notarized yet, macOS says it can't verify the developer. Click **Done**, then open **System Settings → Privacy & Security**, scroll down and click **Open Anyway** next to Aster.

If macOS says the app “is damaged and can't be opened”, run this once in Terminal, then open it again:

```sh
xattr -cr /Applications/Aster.app
```

## Full Disk Access

macOS protects some folders even from you — Safari, Mail, the Trash, and other apps' containers. Aster can clean everything else without special permission. To include those too:

1. Click **Limited access** in Aster's sidebar (or open **System Settings → Privacy & Security → Full Disk Access**).
2. Switch on **Aster**, or click **+** and choose it from Applications.
3. Quit and reopen Aster. The sidebar then shows **Full Disk Access**.

Aster only uses this access to clean the locations it shows you; it never reads your documents or messages.

## Other permission prompts

| Prompt | When | Why |
| --- | --- | --- |
| “Aster wants to control System Events” | Opening **Startup**, switching light/dark mode | Listing and removing login items and changing appearance go through System Events. If you decline, Aster still shows launch agents and daemons. |
| Your Mac password | Spotlight on/off, Low Power Mode, DNS flush, Spotlight rebuild, sleep timers, switching a background service | These are system-wide settings; macOS asks for your password each time. |
| Finder asks for your password | Removing an app or leftover owned by an administrator | Installer packages often put files there; Finder moves them to the Trash after you confirm. |

## What each page does on a Mac

| Page | macOS behaviour |
| --- | --- |
| **Cleaner** | App caches in `~/Library/Caches`, logs, crash reports, temporary files, Quick Look thumbnails, Trash, iPhone/iPad update files, old installers in Downloads, Mail attachments; Safari, Chrome, Edge, Brave, Arc, Vivaldi, Opera, Yandex, Firefox; Xcode, Homebrew, npm, pip, Yarn, CocoaPods, Gradle, Adobe media cache, Discord, Spotify, Slack, Teams, VS Code, Steam. |
| **Leftovers** | Settings, caches, saved window state, logs, app data and sandbox containers of apps that are no longer installed, plus launch agents pointing to deleted programs. Everything goes to the Trash. Apple's own files are never listed. |
| **Programs** | Apps in `/Applications` and `~/Applications` with version, size, volume, type (App Store / Apple / downloaded) and when you last opened them. Uninstall quits the app, moves it to the Trash and shows its leftovers in `~/Library`. Apple's built-in apps can't be removed. |
| **Startup** | Login items, launch agents (yours and for all users) and background daemons. Switching off uses `launchctl disable`, the same override System Settings → Login Items uses. |
| **Updates** | macOS updates (installed from System Settings), Homebrew formulae and casks, and Mac App Store apps if the free [`mas`](https://github.com/mas-cli/mas) tool is installed. Install [Homebrew](https://brew.sh) to update your apps from Aster. |
| **Optimize** | Window animations, Dock delay, app bouncing, `.DS_Store` on network/USB drives, Spotlight indexing, Low Power Mode, personalized ads, analytics sharing, crash dialogs; apps using the most memory (Quit). |
| **Mac settings** | Appearance, scroll bars, Finder (extensions, hidden files, path bar, status bar, search scope), Dock (auto-hide, recents, position, minimize effect), keyboard & trackpad, screenshots, screen and sleep timers. Displays are shown read-only: macOS doesn't let other apps change resolution or refresh rate. |
| **Tools** | Time Machine local snapshot, free space used by local snapshots, DNS flush, Spotlight rebuild, fix duplicate “Open With” entries, empty Trash; shortcuts to Activity Monitor, Disk Utility, Console and System Settings panes. |

## Known limits

- Not notarized yet, so the first launch needs **Open Anyway** (see above).
- Login items added by apps through Apple's newer Background Items API are managed in System Settings → Login Items; Aster shows the launch agents behind most of them.
- Refresh rate and resolution can only be changed in System Settings → Displays.
