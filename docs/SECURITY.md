# Security model

## Trust boundaries
The renderer displays potentially hostile filenames and system-entry strings. It has no Node integration, no generic IPC, no filesystem or shell primitives, context isolation and Chromium sandboxing. CSP restricts scripts to packaged sources. Navigation, new windows and permission requests are denied. Main-process IPC verifies the exact owning window and top-frame URL.

Folder scope comes from a native picker and is retained in the main process. Scan plans are created from trusted scan results and IDs, never renderer-supplied file objects. An expired or unknown selection must fail. Inventory collectors execute fixed read-only commands with timeout/output limits. Startup commands and arbitrary registry uninstall commands are never executed. Startup command text is retained in local recovery records when the user changes its registration.

## File operations
The core uses explicit roots, protected-path exclusions, identity/content revalidation, no symlink or hardlink traversal, same-device quarantine, and persisted journals. Restore does not overwrite existing destinations. It retains recovery copies rather than adding a purge endpoint. Portable Node APIs cannot eliminate every concurrent hostile path-replacement race; this limitation must be considered in native safety validation. Untrusted folders shared with active hostile writers are not a supported cleanup target.

Cleanup is disabled in the current alpha until native validation. A platform build is not authorization to operate on the developer's real files. Tests use only disposable fixtures.

## No hidden optimization
No registry sweep, driver update service, malware-detection claim, memory purging, SSD defragmentation, login credential reading or background telemetry. System recommendations are transparent rules, not fabricated health or performance scores. Unavailable readings are marked unavailable.

## Reporting
Private system-summary reports omit file paths, filenames and hostname. Explicit file inventories, folder snapshots and uninstall-review exports include paths and disclose this in their save dialogs. Recovery journals stay local in app data. Explicit update checks contact the WinGet source and may transmit package/source information through WinGet; there is no Aster telemetry or account service.

## Session analysis and reports

The trusted desktop service retains the current scan and its immediately preceding same-scope snapshot for comparison. Scope includes the selected root, exclusions, hidden-file choice and scan limits. Changing scope clears the comparison. Partial or cancelled snapshots are explicitly not comparable as complete observations; added/removed rows are observations, not proof of creation/deletion. Bounded scan-history summaries and explicitly saved folder snapshots are persisted locally. Snapshots and uninstall baselines contain selected-folder paths. Imports are bounded and validated; imported paths do not authorize filesystem operations.

Analysis and recommendation IPC methods use trusted service snapshots; the renderer cannot forge a scan identifier to authorize file operations. Only current-scan paths can authorize file reveal or a cleanup preview. Beginning a new scan invalidates previews, including a preview still being hashed, and overlapping previews are rejected. Cleanup and file-restoration policy remains disabled; explicitly confirmed Windows management has a separate workflow.

Version 2 JSON reports include only allowlisted recommendation identifiers, severity, numeric evidence and numeric comparison totals. They omit recommendation free text, individual comparison rows, directory records, filenames, file paths, hostnames and command arguments. Diagnostic volume/mount paths are not exported. Settings writes are serialized and become active only after successful publication.

## Explicit Windows management

Startup controls cover current-user Run values only. They do not execute startup commands, manage services/tasks, or infer Windows StartupApproved state. Aster can restore entries it recorded when disabling them. Startup folders, machine-wide entries and delay scheduling are outside this implementation.

The live registry browser reads bounded HKCU/HKLM Software keys. Edits affect one existing value in a current-user application key. Microsoft, Classes, Policies and Aster keys are protected; the separate startup endpoint has a fixed Run-key exception. Key creation/deletion, permissions, bulk import and automatic registry cleaning are absent. Data types and sizes are validated.

Every startup/registry mutation requires a short-lived, single-use desktop-service preview and a native confirmation that defaults to Cancel. Aster compares the current value again, saves its previous value before writing, and records the result. Undo checks that the current value matches the recorded result and refuses conflicts. Native writes also compare the expected value immediately before writing; this is not a Windows atomic compare-and-swap transaction, so a concurrent writer can still race it. Management operations within Aster are serialized. Failed or uncertain operations remain visible for review.

Native management uses an absolute PowerShell path, an app-owned encoded script, and JSON over stdin. User data is not interpolated as executable script text. It never changes execution policy or ACLs. Local management records retain prior registry data and startup command text for recovery; they are not an encrypted vault. New records are written without overwriting existing files, and unsafe paths/links are refused.

## Software updates and uninstall tracking

Update checks are explicit. Aster resolves Microsoft App Installer and verifies the WinGet executable's Microsoft signature. Updates target one exact package ID/version/source from the checked response and recheck before launch. Native confirmation is required. Aster does not auto-accept agreements, run bulk upgrades, force reboots or bypass installer security checks. Unsupported/truncated results are rejected or marked partial. The publisher installer may request Windows elevation. Installer completion is not proof of installed-version success; the UI requests verification. A timeout may leave an installer running; failures block another update in that session until the user reviews Windows and restarts Aster. Windows and driver updates use fixed Windows settings destinations.

Tracked uninstall saves a completed selected-folder baseline, opens Windows Apps settings, and compares a later complete scan with the same scope/settings. Aster never executes arbitrary registry uninstall strings. Remaining files are observations, not proven app-owned leftovers. Their deletion remains disabled.

These native management operations have been implemented and tested with synthetic adapters. Real registry writes, startup changes, installers and uninstallers were not run during this background validation. Full commercial-tool parity, clean-PC distribution, signing and native rendered-window validation remain incomplete.
