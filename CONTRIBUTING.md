# Contributing to Aster

Thanks for wanting to help! Bug reports, ideas, docs fixes and code are all welcome.

## Ways to help

- **Report a bug.** Use the [bug report form](https://github.com/Nikita-Shulga/Aster/issues/new?template=bug_report.yml). Say which page, what you clicked and what you expected.
- **Test on your setup.** Macs (especially Intel), Windows on unusual configurations, browsers or apps Aster doesn't know yet — tell us what worked and what didn't.
- **Teach Aster about a location.** Missing a cache folder, a leftover pattern, or a file type the Disk analyzer can't explain? A pull request that adds a rule *with its explanation* is a great first contribution.
- **Write code.** For anything bigger than a small fix, open an issue first so we can agree on the approach.

## Getting set up

You need Node.js 22 or newer.

```sh
git clone https://github.com/Nikita-Shulga/Aster.git
cd Aster
npm install
npm start          # the real app
npm run preview    # UI only, with sample data, in a browser (add ?platform=darwin for the Mac UI)
npm test           # tests for the platform you're on
```

## Where things live

| Path | What it is |
| --- | --- |
| `src/main/main.cjs` | Window, IPC routing and security policy; picks the Windows or macOS platform layer |
| `src/main/*.cjs` | Windows implementation: cleaner rules, registry (PowerShell, `.reg` backups), programs, startup, WinGet, tweaks, display |
| `src/main/mac/*.cjs` | macOS implementation of the same API: `~/Library` rules, leftovers, `.app` bundles, `launchctl`, Homebrew, `defaults`, Time Machine |
| `src/main/disk*.cjs`, `identify.cjs` | Disk analyzer worker, duplicate finder, file identification |
| `src/renderer/` | Sandboxed UI: `styles.css` (design system), `js/pages/*`, `js/filters.js`, `js/mock.js` (sample data) |
| `scripts/` | Preview server, icon and README artwork generators, the self-test CI runs on real machines |
| `test/` | `node:test` suites — Windows suites skip on macOS and vice versa |

## Ground rules

**Explain before you change.** Every cleaner rule, registry category, tweak and file classification must say, in plain language, what it is, what the user loses and whether it's safe (`contains` / `ifDeleted` / `advice` / `verdict`). If you can't explain it, don't add it.

**Keep it undoable.** User files go to the Recycle Bin / Trash, registry changes are exported to a `.reg` backup first, settings show a before → after preview. Only regenerable caches may be deleted permanently. Never follow links or junctions while cleaning, never clean shallow paths, never touch Apple's files or protected Windows registry roots.

**Pre-select only what is safe.** Anything that signs people out, loses tabs, empties the Recycle Bin or could hold documents must be off by default and clearly marked.

**Security.** The renderer is sandboxed with context isolation and no Node access. Keep operating-system actions in the main process. Never pass renderer strings into a shell: PowerShell scripts are fixed source and receive data as JSON on stdin; macOS tools get argument arrays; admin actions use the standard macOS password prompt with fixed commands.

**Privacy.** No telemetry. Screenshots in the repository must use the built-in sample data (`npm run preview`, `scripts/readme-assets.cjs`). Don't attach personal paths or file lists to issues.

**Testing.** Add a test for every behaviour you change. Tests that touch the system must use disposable fixtures (a temporary folder, the `HKCU\Software\AsterSelfTest` key, a temporary Run entry) and restore anything they change. CI runs the suites and a full self-test of the real app on Windows and macOS.

**Honest claims.** Say what you actually ran: unit tests, preview, a real launch on Windows, a real launch on macOS.

## Pull requests

- Keep each PR focused on one change, and describe how you checked it. The PR template has a short checklist.
- Update `CHANGELOG.md` for anything users will notice.
- Be patient: this project is maintained in spare time.

By contributing you agree that your work is released under the [MIT License](LICENSE), and that you'll follow the [Code of Conduct](CODE_OF_CONDUCT.md).
