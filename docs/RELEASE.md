# Release gates

## Cloud checks
- [ ] Final source syntax and all automated tests pass
- [ ] Scan against controlled fixtures; cancellation and limits verified
- [ ] Renderer tested at desktop/mobile widths, keyboard navigation and repeated dialogs
- [ ] IPC rejects arbitrary paths, foreign frames and stale scan identifiers
- [ ] Dependency audit reviewed; lockfile and third-party notices retained

## Windows native validation (not performed in cloud)
- [ ] Windows 11 x64: standard user; install, launch, upgrade, uninstall without losing recovery data
- [ ] NTFS junctions, symlinks, hardlinks, long paths, case-folding and reserved names
- [ ] Locked files, OneDrive placeholders, network paths, removable disks and permission denials
- [ ] Read-only inventories checked against Settings; no MSI repair triggered
- [ ] Scan performance and app responsiveness on a real large directory
- [ ] Quarantine and restore interruption exercises on disposable data
- [ ] Signed installer, publisher identity, signature verification and malware scan

## macOS native validation (not performed in cloud)
- [ ] macOS 13+ on Apple Silicon and Intel where available
- [ ] APFS volume boundaries, case-sensitive/insensitive volumes, Finder aliases and symlinks
- [ ] iCloud placeholders, protected folders and denied privacy permissions
- [ ] Login-item inventory completeness labels, quarantine/restore on disposable files
- [ ] Native keyboard/menu/dialog/accessibility and screen-reader checks
- [ ] Developer ID signing, hardened runtime, notarization and stapling
- [ ] Gatekeeper checks on a clean machine and signed update/distribution process

## Production gate
`src/desktop/release-policy.json` has `nativeMutationsValidated:false`. Only a reviewed release with the native safety tests above may enable quarantine/restore. The alpha remains useful for diagnostics, scans, file review and export. A disabled action must explain its reason; it must never simulate success.

Before public distribution: finish the threat-model review, independent security review, dependency/SBOM/license audit, crash recovery QA, backup/recovery documentation, support process and signing. Native packaging does not establish functional correctness. There are no claims of perfect safety or guaranteed performance gains.
