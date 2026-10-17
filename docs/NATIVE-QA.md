# Fixture-only native QA

## Current evidence and boundary

Native Windows and macOS execution is still pending. Linux execution is only
portable-core evidence. No result of this harness enables shipping mutations:
`src/desktop/release-policy.json` must remain `nativeMutationsValidated: false`.
Windows execution needs an available, authorized Windows machine; do not replace
it with mocked `process.platform`, Wine, cross-compilation, or a Linux result.

## Run without installing dependencies

From the extracted source repository, with Node.js 22.17+ already installed:

    node scripts/native-smoke.cjs

PowerShell can save its JSON output with:

    node scripts/native-smoke.cjs | Out-File -Encoding utf8 qa/native-windows-result.json
    $LASTEXITCODE

On macOS:

    node scripts/native-smoke.cjs > qa/native-macos-result.json
    echo $?

The script takes no arguments, uses Node built-ins and the local core, and does
not start Electron, download a runtime, install dependencies, access the network,
request elevation, change OS settings, or scan personal folders. Use a writable
source checkout outside system-protected locations. Its unique temporary fixture
is created beneath the existing `qa` directory. This avoids macOS's default temp
location beneath `/private/var`, which the core deliberately protects; the script
never weakens that protection. Paths are resolved before fixture creation.

A dedicated mutation-enabled service only moves the runner's own tiny fixture
files. The shipping default service and release policy remain disabled. The
fixture exercises duplicate keepers, stale previews, returned-plan tampering,
quarantine/restore with retained recovery copies, restore collisions, journal
signature tampering, and link exclusion. Symlink/hardlink creation that the OS
denies is reported as skipped. Windows junction checks skip on other systems.
A skip is not a pass and must be reviewed on each target system.

JSON includes actual platform/architecture and Node version, each check's
pass/fail/skip, counts, and a random fixture basename. It intentionally omits full
paths, usernames, file contents, exception messages and stack traces. Failure
codes are preserved. Exit status is 1 for any failure; a successful run with
skips returns 0 and explicitly says `pass-with-skips`. Review the JSON rather
than interpreting exit status alone as release approval.

Successful fixtures are deleted only after verifying their original directory
identity and random ownership marker. Failed fixtures remain under
`qa/native-smoke-<random>`. Keep them for local investigation; journals contain
local absolute paths, so do not publish raw fixtures. The script does not clean
previous runs. Review any retained directory before manually removing it. This
is disposable test-fixture cleanup, not a product delete/purge API. Concurrent
hostile filesystem manipulation of the harness itself is outside this smoke test.

## Required execution matrix

Record OS version, actual hardware architecture, filesystem type and case mode,
Node version, source revision/checksum, date, JSON result, and skipped reasons in
review evidence. Do not include personal folder names or unrelated files.

- [ ] Windows 11 x64 standard user on NTFS
- [ ] macOS 13+ Apple Silicon on APFS
- [ ] macOS Intel on APFS where supported by distribution targets
- [ ] macOS case-sensitive and case-insensitive APFS volumes
- [ ] Re-run skipped link checks in an appropriately configured, authorized test environment

## Beyond this harness: release-blocking native work

The harness is a small core integration exercise, not packaged-app validation or
a claim that portable Node closes every filesystem race. Separate controlled
native testing and an adapter/permission review are still required for:

- Windows ACL ownership, reparse-point variants, locked-file sharing violations,
  alternate streams, reserved names, long paths, volume and path aliases
- macOS privacy denials, aliases, extended attributes, metadata preservation and
  volume boundaries; no automatic approval of privacy prompts
- Cloud placeholders, remote filesystems and provider-specific side effects;
  unsupported providers must remain excluded before production mutation release
- Power loss/process termination, full disks, interrupted journal writes,
  partially copied restores, concurrent destination creation and parent swaps
- Electron IPC isolation, cancellation, native dialogs/menus, accessibility,
  app responsiveness, signing and clean-machine install/upgrade/uninstall

Any skipped or failing critical native check is unresolved evidence. Packaging,
signing, a zero exit code, or this checklist alone cannot approve mutations.
