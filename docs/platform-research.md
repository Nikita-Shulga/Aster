# Aster: platform research and safe implementation plan

Research checked 2026-10-17 against current official documentation. This is a cloud-developed prototype, not a Windows/macOS-verified release. The platform code has dependency-free mocked tests and a Linux development-host smoke test. Native commands, permissions, installer behavior, signing, and destructive operations have **not** been verified on Windows or macOS.

## Product direction

Make a calm, original system-care app: an overview of measured capacity, a reviewable cleanup inventory, startup visibility, installed-app visibility, and clear routes to the operating system's own controls. Do not imitate another product's visual identity. Avoid scare scores, invented problems, promises of faster performance, registry cleaning, RAM purging, and automated drive repair.

Useful without administrator access:

- OS version, logical processor count/model, total/free RAM, uptime, and available capacity of the home volume
- Read-only current-user/cache file review, with visible scan scope and inaccessible-item counts
- Application inventory and partial startup inventory, with explicit uncertainty
- Reveal selected files and open trusted system settings
- User-approved move-to-Trash operations for tightly scoped files, with per-item outcomes
- Local diagnostic export with hostname, user paths, command arguments, serial numbers, and personal filenames omitted by default

Caches can improve performance; removal is a storage choice, not inherently an optimization. Apple defines caches as regenerable data, but that does not make every third-party file inside a cache directory safe to remove while its app runs. See [Apple file-system guidance](https://developer.apple.com/documentation/foundation/using-the-file-system-effectively) and [Library directories](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/MacOSXDirectories/MacOSXDirectories.html).

## Implemented collector API

CommonJS entry point: `src/platform/index.js`.

- `getSystemInfo()` returns platform, OS name/version, architecture, hostname, memory, logical CPU information, uptime, home-volume storage, recommendations, capabilities, warnings, and measurement notes
- `getDiagnostics()` returns bounded read-only volume and battery evidence, collection timestamp, and explicit unassessed security/update status (contract below)
- `listStartup()` and `listApplications()` return `{items, status, warnings}`
- Native inventories deliberately return `partial`, even on successful reads: neither OS guarantees that these sources represent every relevant item
- Unsupported development hosts return real host basics but `unsupported` native inventories
- Missing capacity returns `null`, not zero; unknown enabled state remains absent
- `createCollectors(dependencies)` exists for trusted testing only. Do not expose its dependency or platform overrides to renderers

Portable basics use [Node `os`](https://nodejs.org/api/os.html) and [filesystem `statfs`](https://nodejs.org/api/fs.html#fspromisesstatfspath-options). Capacity is `blocks * bsize`; available bytes are `bavail * bsize`. It describes the volume containing the home directory, not the entire computer. The used value includes capacity unavailable to the user. APFS sharing, snapshots, purgeable space, sparse files, and reservations can make this differ from system storage displays. Free RAM is not memory pressure. CPU count is logical processors.

The only automatic recommendation threshold is less than 10% available home-volume capacity, visibly identified as app guidance rather than hardware diagnosis. Disk health and memory pressure capabilities remain false.

## Windows collection contract

Execution is an absolute local `System32\\WindowsPowerShell\\v1.0\\powershell.exe`, resolved only from a conventional verified drive-root Windows directory. Unusual Windows installation directories are reported unavailable rather than falling back to PATH. Arguments are fixed:

```text
-NoLogo -NoProfile -NonInteractive -EncodedCommand <UTF-16LE Base64 of an application-owned fixed script>
```

There is no shell, profile, execution-policy bypass, arbitrary renderer script, or user-supplied interpolation. Commands have a 15-second timeout and 6 MiB maximum output. PowerShell explicitly selects UTF-8 stdout. Failures expose sanitized categories, never stderr, command text, or environment values.

### Application inventory

The fixed script opens `SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall` read-only through `.NET RegistryKey.OpenBaseKey` for HKCU/HKLM in both Registry64 and Registry32 views. It reads only DisplayName, DisplayVersion, Publisher, InstallLocation, and SystemComponent. It does not read or execute UninstallString. It additionally calls `Get-AppxPackage -PackageTypeFilter Main` for the current user. It does not use `-AllUsers`.

The script emits a stable envelope using `ConvertTo-Json -InputObject ([pscustomobject]@{items=@(...);warnings=@(...)}) -Depth 4 -Compress`, preserving zero-, one-, and many-item arrays under Windows PowerShell 5.1. The parser validates arrays, limits records/field lengths, removes control/bidi characters, deduplicates by source/key, and treats names as inert text.

Important: **never query Win32_Product**, even for a read-only inventory. Microsoft documents that it can initiate MSI consistency checks and repairs. Registered uninstall entries also do not cover every portable application. Sources: [Microsoft inventory guidance](https://learn.microsoft.com/powershell/scripting/samples/working-with-software-installations), [MSI side effects](https://learn.microsoft.com/en-us/troubleshoot/windows-server/admin-development/windows-installer-reconfigured-all-applications), [uninstall metadata](https://learn.microsoft.com/en-us/windows/win32/msi/uninstall-registry-key), [registry views](https://learn.microsoft.com/en-us/dotnet/api/microsoft.win32.registrykey.openbasekey), [current-user app packages](https://learn.microsoft.com/en-us/powershell/module/appx/get-appxpackage), [PowerShell 5.1 JSON](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/convertto-json?view=powershell-5.1).

### Startup inventory

The fixed script lists value names and types from the Run/RunOnce keys in HKCU/HKLM, both registry views, plus regular files in the OS-resolved Startup/CommonStartup directories. Raw startup command values are **not collected**, avoiding arguments that may contain credentials. Shortcut targets are not executed or resolved into commands. Registry presence is not proof that Windows has enabled an item. Tasks, services, modern packaged startup tasks, policy effects, and approval state are not claimed covered.

Do not use Win32_StartupCommand as a guaranteed standard-user source: Microsoft explicitly documents SeRestorePrivilege. Sources: [Run and RunOnce](https://learn.microsoft.com/en-us/windows/win32/setupapi/run-and-runonce-registry-keys), [Win32_StartupCommand privilege](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-startupcommand).

Use a fixed allowlist of documented Settings destinations for changes: `ms-settings:startupapps`, `ms-settings:appsfeatures`, and the supported storage settings URI. Validate against [Microsoft's URI reference](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-settings); never accept arbitrary external protocols from inventory records. Storage Sense already offers built-in cleanup with explicit policies; see [Microsoft Storage Sense](https://support.microsoft.com/en-us/windows/experience/storage-filemanagement/manage-drive-space-with-storage-sense).

## macOS collection contract

### Application inventory

The only profiler invocation is:

```text
/usr/sbin/system_profiler SPApplicationsDataType -json -detailLevel mini
```

It has a 15-second timeout/6 MiB output cap. The parser requires the `SPApplicationsDataType` array and accepts only `_name`, absolute `path`, and `version`. It never runs the whole profiler, collects browser history, or exposes hardware identifiers. Inventory can be slow, inaccessible, or incomplete; empty/unavailable output is not evidence that no apps exist.

### Startup inventory

Read ordinary `.plist` files from the user's `Library/LaunchAgents`, `/Library/LaunchAgents`, and `/Library/LaunchDaemons`; skip symlink directories/files and oversized files. At most 60 definitions are scheduled across four workers with an eight-second scheduling budget. Each conversion has a two-second timeout and 128 KiB output cap:

```text
/usr/bin/plutil -convert json -o - -- <absolute path discovered within those fixed roots>
```

`-o -` writes converted JSON to stdout, not the source. Parse only a string `Label`; do not expose ProgramArguments. The plist `Disabled` field does not establish current launchd/Background Task Management state, so no on/off switch is inferred. These command contracts must still be confirmed against the target macOS local manual pages and representative fixtures before native support is claimed; Apple's current web documentation does not promise a stable profiler JSON schema.

Modern login items are broader than these directories. `SMAppService` is for your own app's bundled helpers, not a general API to toggle other apps. Apple's `sfltool dumpbtm` is diagnostic output, not a documented stable JSON interface; do not build automatic state-changing logic on it. Never use `sfltool resetbtm`. Provide a route/instruction to System Settings → General → Login Items & Extensions. Sources: [SMAppService](https://developer.apple.com/documentation/servicemanagement/smappservice), [Apple background-task management](https://support.apple.com/en-gb/guide/deployment/depdca572563/1/web/1.0), [Login Items settings](https://support.apple.com/en-gb/guide/mac-help/-mtusr003/mac).

No `pmset` mutation, `sudo`, TCC bypass, Full Disk Access requirement, private background-task database modification, or automatic startup registration belongs in this version. The read-only battery adapter below is implemented with mocked tests; native execution remains unverified.

## Cleanup safety requirements

These are implementation requirements, not a claim that every item below is already implemented:

1. Scan only explicit supported user-scoped roots or a directory selected through a native picker. Do not classify Downloads, documents, cookies, sessions, credentials, browser profiles, application databases, backups, developer worktrees, Windows Installer/WinSxS, or macOS system folders as generic junk
2. Use lstat, skip symbolic links, junctions/reparse points, mount crossings, and cloud placeholders. Canonicalize trusted roots and every ancestor. Revalidate root containment, file identity/type, size, and modification time immediately before action; skip changed entries
3. A candidate ID must map to a main-process scan record; never let renderer input supply a deletion path. Expire old scans and disable duplicate/reentrant cleanup
4. Preview exact categories/items and explain consequences; close relevant apps first. Age is a filter, not a safety guarantee
5. Prefer native `shell.trashItem` for reviewed candidates. If it rejects, report the error and do not silently fall back to permanent deletion. Record successes/failures separately. Do not promise an in-app undo unless restoration is implemented and tested
6. Moving files to Trash does **not** ordinarily free their storage. Report bytes moved separately from measured available-space change. Never automatically empty Trash. Cloud-sync deletion can propagate to other devices, so exclude sync roots by default
7. Estimates are not guaranteed reclaimed bytes: hard links, compression, snapshots, and APFS clones affect physical allocation

Sources: [Electron Trash API](https://www.electronjs.org/docs/latest/api/shell), [Apple storage guidance](https://support.apple.com/en-ge/102624), [Apple deletion/recovery semantics](https://support.apple.com/en-ie/guide/mac-help/mchlp1093/mac), [OneDrive on-demand files](https://support.microsoft.com/en-us/onedrive/save-disk-space-with-onedrive-files-on-demand-for-windows).

## Disk health and registry limits

Free capacity is not drive health. Windows Get-PhysicalDisk needs an available Storage Management Provider; reliability counters can expose temperature/wear/errors but availability depends on hardware/providers/permissions. macOS Disk Utility can show SMART for many drives, not every device. Unknown/missing telemetry must remain unknown; a reported healthy state does not promise a drive cannot fail. Never synthesize a health score from free space or uptime. Sources: [Get-PhysicalDisk](https://learn.microsoft.com/en-us/powershell/module/storage/get-physicaldisk), [reliability counters](https://learn.microsoft.com/en-us/powershell/module/storage/get-storagereliabilitycounter), [Apple SMART guidance](https://support.apple.com/en-ie/guide/mac-help/mchlp2548/27/mac/27).

First Aid repairs filesystem structure, not fatal hardware failure; backup/recovery matters. Do not run disk repair in a background scan. See [Apple First Aid](https://support.apple.com/en-us/102611). Exclude registry cleaning entirely: Microsoft's published support policy warns incorrect registry modification can cause serious damage and require OS reinstall. The English old policy URL redirects; the retained [Microsoft policy page](https://support.microsoft.com/sl-si/topic/microsoft-support-policy-for-the-use-of-registry-cleaning-utilities-0485f4df-9520-3691-2461-7b0fd54e8b3a) still contains the English policy text.

## Electron security and release gates

- Package only local application assets; use `contextIsolation:true`, `sandbox:true`, `nodeIntegration:false`, restrictive CSP, blocked unexpected navigation/new windows, and one narrow preload method per capability
- Validate sender identity/origin and every IPC payload; do not expose generic exec, arbitrary files, shell, or raw IPC. Treat app names, filenames, registry strings, and plist content as untrusted text
- Main process owns fixed command allowlists and mutation scope. No remote HTML, remote script, arbitrary URL opener, automatic telemetry, or startup/background service by default
- Keep Electron updated; assess fuses and update integrity. See [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security/) and [context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)

macOS release: build/test on a Mac, sign all nested executables correctly with Developer ID, enable Hardened Runtime, use appropriate minimal Electron entitlements, timestamp, notarize with the supported service, and staple the distributed artifact. Test the downloaded distribution on a separate clean Mac, including offline launch. Do not tell users to disable Gatekeeper. Sources: [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), [distribution signing](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac/), [distribution testing/stapling](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution), [Electron signing](https://www.electronjs.org/docs/latest/tutorial/code-signing).

Windows release: sign executables/installers and timestamp with an approved signing service/certificate, verify signatures, and test a clean standard-user install/uninstall. **Signing does not guarantee immediate SmartScreen reputation**, including EV certificates and Artifact Signing. Prefer current [Microsoft SmartScreen guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation) over optimistic wording in secondary tooling docs. Account eligibility and signing credentials remain a release-owner task, never embedded in source.

Cloud Linux tests and a browser preview are not native verification. Use separate native CI runners for Windows and macOS; test supported architectures, localized/non-ASCII profiles, empty/single/many inventories, access denied, policy-restricted PowerShell, timeouts, malformed output, symlink/junction swaps, locked files, cancellation/double clicks, partial Trash failures, and restore behavior. A DMG must be built on macOS. Sources: [Forge build lifecycle](https://www.electronforge.io/core-concepts/build-lifecycle), [Forge DMG requirements](https://www.electronforge.io/config/makers/dmg).

## Verification performed

- `node --test test/platform/*.test.js`: 11 tests passed at initial delivery; all native subprocesses mocked
- Linux smoke test: system capacity read successfully; startup/app inventories honestly returned unsupported
- No software installation, user-computer access, settings changes, uninstall, registry modification, or cleanup performed for this research/collector work


## Diagnostic evidence expansion (2026-10-17)

`getDiagnostics()` adds no runtime dependencies and has no renderer-supplied parameters. It returns:

- `status`: `partial` on Windows/macOS or `unsupported` on other hosts
- `collectedAt`: collection-start ISO timestamp; this is a snapshot, not live monitoring
- `volumes`: `{status, items, warnings}`; each item has `id`, `label`, byte values `total`/`free`/`used`, `fileSystem`, and `scope`. Missing values are `null`
- `battery`: `{status, present, chargePercent, powerSource, state, items, warnings}`. Missing values stay `null`/`unknown`; no supported battery reported leaves `present:null`, not a false claim that no battery exists. Multiple batteries retain separate items and no synthetic aggregate charge
- `security` and `updates`: `{status:'unknown', assessed:false, detail}`. No security posture, available-update count, restart requirement, or current-patch claim is inferred from OS version
- `warnings`: fixed, privacy-safe limitations

Windows uses the existing absolute Windows PowerShell path and a third fixed encoded script. Only local `Get-CimInstance Win32_LogicalDisk -Filter 'DriveType = 3'` properties DeviceID/Size/FreeSpace/FileSystem and `Win32_Battery` properties EstimatedChargeRemaining/BatteryStatus are requested. Each query requests a five-second CIM operation timeout; the entire subprocess has a 15-second wall timeout and 128 KiB output limit. Results cap at 32 volumes/eight batteries. Provider failure is isolated by source. Volume names, hardware serials, battery names, hostnames, device identifiers, and user paths are not returned. Drive letters and known filesystem types are allowlisted; malformed or impossible capacities remain unknown. No query uses Win32_Product or invokes a CIM method. Microsoft's battery status 2 means access to AC without discharge, not necessarily charging; only documented state mappings are used. Sources: [Win32_LogicalDisk](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-logicaldisk), [Win32_Battery](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-battery).

macOS runs only `/usr/bin/pmset -g batt`, with a five-second timeout/64 KiB output limit. Apple's [open-source pmset manual](https://raw.githubusercontent.com/apple-oss-distributions/PowerManagement/main/pmset/pmset.1) documents this as a power-source snapshot. Only recognized internal-battery percentage/state fields and the power-source header are retained; UPS names and all identifiers/raw output are dropped. This is a conservative text adapter, not an Apple-guaranteed JSON contract. Unsupported/localized/malformed output remains unknown. Capacity on macOS and development hosts still describes only the home volume via statfs, with no path disclosed. No APFS shared-capacity sum is produced.

All platform subprocesses now pass an executable-and-arguments allowlist at the execution boundary. Timeouts and output limits are capped even if trusted callers accidentally request larger values. This does not replace native testing, code signing, operating-system permissions, or main-process-only ownership of collectors.

Verification: `node --test test/platform/*.test.js` covers command contracts, unsupported hosts, partial/unavailable sources, malformed envelopes, null versus zero capacity/charge, multiple batteries, privacy omission, and macOS power-source fixtures. These are mocked collector tests plus a Linux capacity smoke test, **not native Windows/macOS validation**. Native release checks must cover standard-user CIM permissions, restricted PowerShell policies, machines without batteries, multiple-battery hardware, localized macOS output, Apple Silicon/Intel, and changed provider formats.
