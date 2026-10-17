# Aster 0.7.0-alpha.1

Private development prerelease for Windows x64. Unsigned alpha; native end-to-end validation is incomplete.

## Download and run

Download Aster-0.7.0-alpha.1-Windows-x64.zip, extract the whole archive into a new folder, and run Aster.exe beside its bundled resources. The executable cannot run as a standalone copied file. SHA256SUMS.txt verifies the distributed ZIP.

## Changes

- Persistent task sidebar and six overview panels with explicit next actions and selected-folder scope. Original Aster branding; layout hierarchy inspired by the user's Reg Organizer reference.
- Tracked uninstall: persist a selected-folder baseline, use Windows Apps settings for removal, rescan the same folder and export a comparison. Remaining files are observations, not proven disposable leftovers.
- Startup controls: preview and change current-user Run registrations, save prior values, and undo if the current value still matches. Other startup sources remain in Windows.
- Registry tools: browse HKCU/HKLM Software keys and preview a typed edit or removal of one existing current-user application value. Windows keys and permissions are protected. Recovery history records previous values.
- Software updates: explicitly check WinGet, review one exact package/version/source and confirm before invoking its publisher installer. No automatic agreement acceptance, bulk update, force or bypass flags. System and driver updates use Windows settings.

## Verification

187 source tests, 224 interface DOM/event checks and 59 packaged-service checks passed. There were two skips: a POSIX-only source check and the previously denied native driver inventory. All 46 packaged source files and 74 ZIP entries matched; seven embedded icon sizes verified.

The new management workflows were tested with synthetic adapters and disposable data. Actual startup and registry changes, native undo, live update downloads/installers, uninstallers, native dialogs/IPC, OS icon extraction and the rendered window were not exercised. The restricted executor's app-startup boundary was not bypassed. Clean-PC installation, signing and macOS remain unverified.

Cleanup and file restoration remain disabled. Sandboxing remains enabled. No personal files or permissions were changed by testing. Full CCleaner/Reg Organizer parity is incomplete: no system-wide installation monitoring, proven leftover deletion, machine startup/delay controls, automatic registry cleaning, dedicated driver updater/rollback, process stopping or scheduled cleanup.

## Source

The repository contains application source, tests, assets, dependency lockfile and documentation. Machine-specific reports, local profiles, fixtures, caches, dependency installs and previous binaries are excluded. The verification JSON contains aggregate results only.
