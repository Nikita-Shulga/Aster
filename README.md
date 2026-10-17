# Aster System Care

An original, local-first system-care application for Windows and macOS. Aster emphasizes understandable evidence, user control and conservative file handling instead of alarming health scores or speculative “speed boosts.”

## Current release status

**Development alpha, not a production-certified release.** Background checks cover the source, test fixtures and DOM/event behavior; real rendered-window inspection remains a separate gate. Cleanup and file restoration remain disabled. Windows startup and registry management and individual software updates have separate explicit previews, native confirmation, and local records. Their native end-to-end operation has not been validated in this release; the tests use synthetic registry and installer adapters. Do not flip the cleanup policy merely to silence a warning.

The shared source builds **separate Windows and macOS applications**; these are not remote web scanners. A browser preview only shows clearly labelled demonstration data and cannot access your disk.

## Included

- Local system overview, memory/storage snapshots and a dedicated evidence-based recommendations workspace
- Read-only battery and volume diagnostics with explicit unavailable or partial states
- Persistent task sidebar, six overview panels, full tool search and original angular A branding
- Tracked uninstall baselines, Windows uninstaller handoff, selected-folder rescan comparison and reports
- Current-user Run startup controls and conflict-aware recovery history
- Live Software-key browser and typed editing of existing values in current-user application keys
- Explicit WinGet update checks and individually reviewed, exact-package updates
- Same-scope comparisons, private scan-history summaries, and portable selected-folder snapshots
- App disk-usage attribution and grouped performance review without system changes
- Browser-data classification, editable registry-file drafts, local version-catalog comparison and maintenance review dates
- Folder drill-down, category/extension/age filters and manual large/older-file review
- User-selected-folder storage analysis, large files and content-verified duplicate groups
- Explicit bounded scans with cancellation, exclusions, skipped-item warnings and truncation reporting
- Reviewed cleanup plans; safe core quarantine/restore implementation with adversarial fixture tests
- Read-only startup and application inventories, with platform-specific source and completeness warnings
- System settings shortcuts, private JSON summary export, themes and keyboard navigation
- A sandboxed Electron renderer and narrow, sender-validated IPC bridge

Aster never silently scans the entire computer. Cache removal is not assumed to improve performance. Registry “repair”, RAM boosting, automatic disk repair and third-party uninstall commands are deliberately absent. Moving a file into quarantine or Trash does **not** free its disk blocks.

## Develop

Requires Node.js 22.17+ (24 recommended). Install the pinned development dependencies with `npm ci`, then `npm start`. The app does not request administrator/root privileges.

- `npm test` — dependency-free Node tests, using isolated temporary fixtures
- `npm run test:native` — disposable native filesystem smoke tests; never scans personal folders
- `npm run check` — JavaScript syntax checks
- `npm run test:renderer` — optional DOM/event suite (requires jsdom, or `ASTER_JSDOM_PATH` to an existing installation)
- `npm run preview:bundle` — rebuild the standalone offline demonstration
- `npm run preview` — labelled browser demonstration at `http://127.0.0.1:4173`
- `npm run package:win` — build Windows NSIS/ZIP on Windows
- `npm run package:mac` — build macOS DMG/ZIP for ARM64 and x64 on macOS

`package-lock.json` pins dependency resolution. No analytics, account, advertising or remote renderer content is included. An explicitly requested software-update check contacts the WinGet source; installing an update runs the publisher installer through Microsoft WinGet. Electron must receive timely security updates before distribution.

## Native build and release

See [release checklist](docs/RELEASE.md). The included CI workflow is a build template, **not evidence that CI has run**. Its artifacts are unsigned alpha builds and it does not publish GitHub releases. Apple Developer ID/notarization and Windows code signing need the owner’s signing identity; no credentials are included. A valid Windows signature is not a guarantee against reputation warnings.

## Safety and privacy

See [security model](docs/SECURITY.md). Cleanup remains disabled. Private system-summary reports omit filenames, paths and hostname. Explicit file inventories, folder snapshots and uninstall reviews include paths and say so in their save dialogs. No system settings are changed by inventory scans.

Aster is a working name. Brand clearance, distribution terms and third-party notices need final review before a public launch.

See [current verification status](docs/STATUS.md) and [dependency advisory status](docs/DEPENDENCIES.md).
