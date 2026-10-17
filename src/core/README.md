# Aster System Care filesystem core

Dependency-free CommonJS, Node.js 22+. Import `require('./src/core')` or create an
isolated service with `createService()`. Scans and previews work by default.
Quarantine and restore are disabled unless trusted host code constructs a service
with `{ mutationEnabled: true }`. This flag is **not a renderer setting**, a
permission grant, or a substitute for the native release safety gate and explicit
per-operation user confirmation. The current app must keep native mutations off.

## API

All methods return promises. Errors have `name: 'CareError'`, a stable `code`, and
a readable `message`. OS I/O errors may retain their OS `code`. `AbortSignal`
parameters are local objects, not IPC payloads. Main-process code owns signals,
trusted plan IDs, approved roots and the quarantine root.

- `scan({ roots, exclusions = [], includeHidden = false, limits = {}, signal,
  onProgress })`: `roots` is 1–16 explicit absolute non-overlapping folder paths.
  `exclusions` contains absolute descendants, not globs. No implicit home or disk
  scan occurs. Dotfiles are skipped by default; sensitive/system directory names
  remain excluded when hidden entries are enabled. The explicit selected root may
  be an ordinary hidden directory.
- `createCleanupPlan({ scanId, selectedIds, signal, onProgress })`: select 1–1000
  file IDs from this service's scan. All selected contents and one unselected
  keeper for each affected verified duplicate group are re-read and SHA-256
  checked. Selecting every verified copy in a group fails. Default total preview
  read budget is 4 GiB (host-configurable up to 16 GiB with `maxPlanBytes`). A file
  that is large or duplicated is not automatically junk. Preview changes nothing.
- `quarantine({ planId, quarantineRoot, signal, onProgress })`: host-only mutation.
  The root must have an existing real parent, and must be a private, owned folder
  on the same filesystem as all selected files. A missing final folder is created
  with mode 0700. All files and keepers are checked before the first move, then
  again immediately before each move. Files move into a unique private transaction
  folder. Quarantine does not free disk space. There is no delete/purge API.
- `inspectJournal({ journalPath })`: verifies and reads the signed journal. It does
  not touch source files. Reported entry statuses are the last durable recorded
  statuses; interruption may require restore reconciliation.
- `restore({ journalPath, signal, onProgress })`: authenticates the journal,
  validates the complete set of original parents and existing content, and uses
  exclusive copies (`COPYFILE_EXCL`) to restore missing files. Never overwrites an
  existing unrelated destination. Recovery originals are retained in quarantine.
  Additional free capacity of the copy sizes plus 1 MiB is required. File content
  and basic permission mode are preserved; this is **not** a complete metadata,
  ACL, alternate-stream, extended-attribute or original timestamp backup.

The last 3 scans and 20 plans are retained in memory. Renderer changes to returned
scan/plan objects cannot change internal paths or file identities. Preview IDs do
not survive restart; authenticated recovery journals do.

## Shapes

Scan:

```js
{
  id, roots, exclusions, includeHidden, excludedNames, limits,
  files: [{ id, path, root, name, size, mtimeMs, modifiedAt, category,
            sha256, duplicateGroupId }],
  directories: [{ path, root, name, bytes, fileCount }],
  duplicates: [{ id, sha256, size, fileIds, recoverableBytes }],
  largeFiles: [/* file records, largest first */],
  totals: { files, bytes, hashedBytes, visitedEntries },
  warnings: [{ path, code, message }], warningsOmitted,
  truncated, cancelled, startedAt, completedAt
}
```

`category` is an extension-based label (`image`, `video`, `audio`, `document`,
`archive`, `code`, `other`), not a content inspection. `sha256` and
`duplicateGroupId` may be null. Only same-size candidates are hashed during the
scan; previews hash all selected files. `recoverableBytes` is duplicate logical
size, not a promise that quarantine reclaims it. Directory bytes cover scanned
regular files only, excluding skipped entries and filesystem overhead. These are
logical sizes, not allocated blocks or whole-disk usage.

Plan:

```js
{ id, scanId, createdAt, files: [{ id, path, size, sha256 }],
  keepFiles: [{ id, path, size, sha256 }], totalBytes,
  freesDiskSpace: false, warnings: [string] }
```

Journal/mutation result:

```js
{ id, journalPath, status, createdAt, updatedAt, totalBytes,
  movedFiles, restoredFiles,
  entries: [{ id, source, size, sha256, status }],
  error: null /* or { code, message } */,
  freesDiskSpace: false, recoveryCopiesRetained: true }
```

Transaction status is `prepared`, `quarantining`, `completed`, `interrupted`,
`restoring` or `restored`. Entry status is `pending`, `moved` or `restored`.
Preflight failures throw. Once a recovery context exists, a recoverable error or
cancellation returns `status: 'interrupted'` with an error and journal path.
If persisting that interruption itself fails, `JOURNAL_WRITE_FAILED` throws with
the existing journal path. Always retain every journal and recovery original.

Progress callbacks receive `phase` plus walking/hashing file/byte counters,
preview `hashedBytes`/`totalBytes`, or mutation `completed`/`total`. Callback
exceptions are ignored. Cancellation is cooperative between filesystem operations
and read chunks; a stalled OS I/O call cannot be forcibly interrupted here.

## Bounds and safeguards

Defaults: 50,000 entries, 20,000 files, depth 32, 120 seconds, 1 GiB duplicate hash
budget, 512 MiB per hashed scan file, 50 MiB large-file threshold, 100 largest files.
Host overrides are validated with hard upper bounds. Duration is checked between
walk operations and hashing chunks. Up to 200 warnings are returned; overflow is
counted. A limited scan clearly marks `truncated`; zero-byte hashes cost no bytes
but remain entry/file/time bounded.

Every path is absolute and normalized. Dot/parent traversal components, protected
system directories, symlink/junction roots or ancestors, hardlinked files,
non-regular files, and nested mount boundaries are refused/skipped. Windows UNC,
device, wildcard and alternate-stream paths are unsupported. Hashing uses
`O_NOFOLLOW` where provided, verifies descriptor and path identities before/after,
and checks size, timestamps, mode, device, inode and link count. Directory
identities are checked along the entire ancestor chain. Repeated physical directory/file identities are excluded so path aliases cannot
become false duplicate keepers. macOS path comparisons conservatively case-fold
even on case-sensitive volumes. Read errors are visible,
not silently interpreted as free space or successful cleanup.

Journal writes use private temporary files, fsync and atomic replacement. Source
and destination directories are synced where Node supports directory fsync.
Journals are HMAC-SHA-256 authenticated using a private random key under the
quarantine root. Do not remove or expose `.aster-journal-key`; losing it prevents
automatic journal recovery. A journal signature is integrity protection against
accidental modification, not a security boundary against another process with the
same user's permissions. Keeping journals/key/recovery files is essential.

Recovery detects a completed move whose last status update was interrupted. For
restore, intent is durable before an exclusive copy. A complete interrupted copy
can be verified and accepted. An incomplete copy is left intact and reported as a
collision; the original remains in quarantine for deliberate manual recovery.
Mutation storage locks are process-local and keyed by directory device/inode;
the Electron host must enforce a single app instance. Cancellation during native
`copyFile` takes effect after that OS operation returns. A batch interruption may leave some files moved/restored and some untouched; the
journal records/reconciles this. The operation is not an atomic multi-file
transaction and never promises automatic rollback.

## Native release gate and residual risks

Portable Node has no generally available descriptor-relative, no-replace rename
API. Ancestor checks narrow but cannot eliminate a hostile concurrent parent-path
swap between validation and an OS call. Same-user processes can change private
storage; POSIX permissions alone cannot prevent that. Windows ACL/reparse-point
coverage and private-root ownership need native verification. Directory fsync is
not reliably exposed by Node on Windows. Filesystem/network/provider semantics
can differ. Cloud placeholder downloads and content-reading side effects are not
identified by this portable implementation; unsupported providers must be gated
out before native release. No privilege elevation is requested.

Therefore this core is a **fixture-tested reference implementation**, not evidence
that native cleanup is safe. Keep native quarantine/restore disabled in shipping
builds until real Windows 11/macOS 13+ x64/arm64 tests and an appropriate native
filesystem adapter/permission review establish the required guarantees. The gate
must not be remotely or renderer-toggleable. Test source replacement, junctions,
reparse points, filesystem mount swaps, hardlinks, Windows sharing violations,
macOS permission prompts, cloud placeholders, interrupted writes, full disks,
process crashes, concurrent destination creation and same-user path races.

## Tests

`node --test test/core/core.test.js`

Tests create tiny isolated fixtures only under `test/core/.fixtures`; they never
scan or clean a real user home or unrelated workspace. Fixture cleanup is test
harness code, not a product purge API. Current automated run is Linux/Node 24;
no macOS or Windows native-safety pass is claimed.

## Read-only snapshot analysis

`analyzeScan`, `buildRecommendations`, and `compareScans` are synchronous pure
functions, exported from `src/core/index.js` and `src/core/analysis.js`. They do not
read the filesystem, trust renderer paths for actions, change a file, or run a
system command. Treat all outputs as explanations for manual review, never as a
cleanup permission or a current-content verification.

- `analyzeScan(scan, options)` produces `totals: { files, bytes }`, ranked
  `categories` and `directories` rows (`{ name, bytes, files }`), `largeFiles`,
  `oldFiles`, full candidate counts, `unknownDates`, `duplicatePotentialBytes`,
  `duplicateGroups`, `completeness`, warnings, and measurement notes. Directory
  rows represent **direct-parent** totals, so their sizes do not double count
  nested trees. `directoriesOmitted` reports display-row truncation. Unknown
  categories become `other`; these remain extension-derived scan labels.
- `buildRecommendations({ scan, systemInfo, applications, startup }, options)`
  returns ordered `{ id, title, detail, severity, action, evidence }` records.
  Evidence consists of aggregates and coverage warnings, without file paths.
  Low storage requires valid home-volume capacity below 10% available. Missing
  capacity does not become zero or a healthy diagnosis. No memory-pressure,
  startup-impact, disk-health, registry-repair, or performance score is inferred.
- `compareScans(previous, current, options)` matches normalized absolute paths,
  not transient scan file IDs. Windows paths are case-folded; POSIX paths are
  case-sensitive. `totals` reports `beforeBytes`, `afterBytes`, `deltaBytes`,
  `addedBytes`, `removedBytes`, `changedBytes` (signed change for matching paths),
  `addedFiles`, `removedFiles`, `changedFiles`, and `unchangedFiles`. Bounded
  `added`, `removed`, and `changed` rows carry paths; `rowsOmitted` reports the
  number of rows not returned. Private exports should omit these path-bearing
  rows unless the user requests detail. `sameScope` and `comparable` distinguish
  comparable complete snapshots from changed roots, exclusions, hidden-file
  policy, unavailable scope, or partial snapshots. Added/removed only means
  observed in one snapshot: it does not prove creation/deletion. Renames appear
  in both categories. Unchanged means no change detected from available size,
  modification-time and hash evidence; it does not prove equal contents.

Options are `maxFiles` (default/hard maximum 100,000), `maxRows` (default 100,
maximum 1,000), `largeFileBytes` (default 50 MiB), `oldFileDays` (default 365,
maximum 36,500), and optional `nowMs`. Positive integer bounds are validated.
Analysis reads only the first `maxFiles` records; later records are not visited.
Without `nowMs`, age uses the snapshot's completion timestamp for reproducibility.
Unknown, invalid or future modification times are not considered old. Modification
age is not a last-used timestamp. Display truncation does not change aggregates;
input truncation does make coverage partial. Sorting is deterministic for the
same bounded record set. Duplicate path records count once; conflicting records
for the same path are excluded. Unsafe numerical sizes are excluded with warnings.

Duplicate estimates group valid SHA-256 and equal sizes from the supplied scan;
claims in a supplied `duplicates.recoverableBytes` are not trusted. Physical
aliases must already have been excluded by the scanner. This calculation neither
rehashes content nor promises allocated-block savings. Old/large/duplicate sets
overlap and their byte estimates must not be added. Quarantine still frees no
space. Tests: `node --test test/core/analysis.test.js`.
