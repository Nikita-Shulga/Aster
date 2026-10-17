# Native packaging readiness

This is an execution checklist, not a build receipt. No Windows installer or
macOS DMG is claimed by the source/preview deliverables. Keep native mutation
release policy false while validating packages.

## Before invoking packaging

- [ ] Verify source revision, dependency lockfile and third-party notices
- [ ] Run `npm test`, `npm run check`, renderer QA, and `node scripts/native-smoke.cjs`
- [ ] Review per-check native JSON and all skips for the target OS/architecture
- [ ] Complete dependency/SBOM/license audit and independent security review
- [ ] Confirm build host OS, architecture, free disk capacity and approved network access
- [ ] Install/build dependencies only with appropriate authorization and capacity;
  packaging may download Electron/build tooling and is not a Node-only operation
- [ ] Verify icons and macOS entitlements exist; keep `asInvoker` on Windows
- [ ] Verify packaged release policy still disables quarantine/restore

## Windows artifact verification

- [ ] Build NSIS and ZIP x64 on an appropriate Windows build machine
- [ ] Record exact artifact names, sizes, SHA-256 digests and build logs
- [ ] Verify trusted code signing/publisher; no fabricated signing or malware-scan claims
- [ ] Install, launch, upgrade and uninstall as a standard user on a clean machine
- [ ] Confirm no administrator prompt and no loss of recovery data on uninstall
- [ ] Verify packaged startup, folder selection, scan/preview/export and disabled actions
- [ ] Test path/link/permissions scenarios listed in NATIVE-QA.md and RELEASE.md

## macOS artifact verification

- [ ] Build DMG and ZIP for arm64 and x64 using authorized macOS tooling
- [ ] Record artifact names, sizes, SHA-256 digests and build logs per architecture
- [ ] Verify Developer ID signing and hardened-runtime entitlements
- [ ] Complete notarization and stapling; verify Gatekeeper on a clean machine
- [ ] Test Apple Silicon and Intel behavior, dialogs, menus and accessibility
- [ ] Verify packaged policy disables mutations and uninstall preserves recovery data

Signing credentials must stay in approved secure tooling and must never appear
in source, logs, screenshots or QA reports. Distribution requires review of the
full release gates in RELEASE.md; generating artifacts is not release approval.
