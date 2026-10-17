# Aster interface design

Aster is a calm desktop utility for understanding storage before making changes. Its visual language is deliberately original: warm near-white surfaces, a graphite-green navigation rail, soft sage accents, restrained outlined iconography, a custom eight-armed aster mark, and an editorial serif moment inside the overview. It does not borrow a competing product’s layouts or branding.

## Interface principles

- **Clarity instead of alarm.** No health score, fake damage, invented threat count, registry cleaner, memory booster, or “fix everything” button.
- **Evidence before action.** Every metric has a source or a clear demo label. Unavailable hardware readings stay unavailable. Large files are not automatically junk, duplicate location can matter, and file extensions are only review hints.
- **Read first.** Folder scans are read-only and explicitly scoped. No files are selected by default. Sorting, searching, filtering, and file details help the user make their own decisions.
- **No false recovery claim.** Local quarantine moves bytes; it does not reclaim disk capacity. The confirmation view explicitly shows 0 B freed and explains restoration and application disruption risks.
- **Honest alpha.** Demo mode is visible on every page when the native bridge is absent. Demo data never gets substituted for a failed native read. The native alpha has a persistent read-only banner when mutation capabilities are disabled. Its review dialog exposes the backend’s reason, and cannot execute unless both the capability and authoritative preview permit it.

## Screen architecture

1. **Overview:** Home-volume snapshot, available memory with context, scoped review findings, storage composition, and folder scan entry point
2. **Storage map:** Area-faithful binary treemap, category drill-down, searchable and sortable table, and selection review
3. **Cleanup review:** Explicit candidates and reasons, personal-review guidance, and quarantine preview
4. **Large files:** User-configurable size threshold; never equates size with waste
5. **Duplicates:** Hash-based content matches grouped together; prevents selecting every copy in a group
6. **Startup items:** Partial, read-only OS inventory; verified allowlisted settings destination when supported
7. **Applications:** Read-only installed-app inventory; OS settings handoff instead of an unsafe homemade uninstaller
8. **System report:** Hardware and OS facts, measurement caveats, bounded recommendations, and report export
9. **Activity & restore:** Verified local operation records, restore confirmation, and capability-aware restore controls
10. **Settings:** Theme, dotfile scan inclusion, large-file threshold, and safety principles

## Implementation

The renderer is dependency-free HTML, CSS, and JavaScript ES modules under `src/renderer/`. There are no remote fonts, analytics, CDN libraries, third-party images, or network services. SVG icons and the brand mark are local inline assets. The font stack uses operating-system sans-serif families and Georgia for the overview’s editorial headline.

The Electron preload exposes `window.aster`. The renderer only uses these narrowly scoped methods:

- `getSystemInfo()`, `getSettings()`, `updateSettings(patch)`
- `selectFolder()`, `scan({root, includeHidden})`, `cancelScan()`
- `onScanProgress(callback)`, `onChooseFolderRequested(callback)`
- `listStartup()`, `listApplications()`, `getActivity()`
- `previewQuarantine({scanId, paths})`, `quarantine({previewId})`, `restore({operationId})`
- `revealPath(path)`, `openSystemSettings(key)`, `exportReport()`

The app treats the native layer as the authority for scope, scan membership, plans, file identity, capabilities, and execution. Client validation improves understanding; it never substitutes for backend enforcement. Capability-based disabling is redundant with the native release gate. Restore also checks the individual operation’s verification status; unverified journals cannot be restored.

If `window.aster` is missing, `demo.js` supplies an explicitly illustrative dataset. “Run sample scan” animates sample progress without accessing files. Folder selection explains the native requirement. Quarantine and restore remain disabled; report downloads include a demo marker. With a bridge present, an error stays an error rather than falling back to fabricated success.

## Interaction details

- `/` focuses file search; native Cmd/Ctrl+O triggers the trusted folder picker
- Keyboard-accessible navigation buttons, visible focus outlines, native checkboxes/selects, and native modal dialogs
- File detail sheets expose name, full path, type, size, modification time, and reason/risk context
- Empty, loading, canceled, partial, error, and unsupported states are distinct
- Scan cancellation is explicit, and selecting a new folder is blocked until the active scan stops
- File tables render at most 500 matching rows; “Select visible files” only selects those displayed rows
- Selecting an entire duplicate group is rejected before review
- File-move and restore cancel responses do not produce success claims
- Long paths truncate in lists, remain visible on hover, and wrap in file details
- Toasts are announced through a polite live region
- Dark and system themes use local preferences; native settings are persisted by the bridge
- Reduced-motion mode suppresses nonessential animation

## Responsive behavior

The layout adapts from a two-column desktop overview to a stacked tablet composition. Navigation collapses behind a keyboard-accessible menu below 760 px. File tables retain readable columns inside horizontal scroll regions rather than shrinking into illegibility. Mobile-width layouts remain useful for reviewing the browser preview, though the primary product is a desktop application.

## Product boundaries

This is an alpha interface and an early native application, not a production-certified system cleaner. Native quarantine and restore are deliberately disabled until platform validation is complete. OS inventory is partial. Dotfile inclusion does not inspect Windows Hidden attributes. Available RAM is not memory pressure, CPU cores are logical processors, and storage is the home-directory volume rather than every disk. The application provides no permanent-delete action.

## Verification status

The repeatable optional development harness is `scripts/qa-renderer.cjs`. Its consolidated 73-check run covers DOM events, native-bridge simulation, safety gates, and the self-contained offline preview. Details and commands are in `qa/renderer-qa.md`, with machine-readable results in `qa/renderer-dom.json`.

Actual browser-engine visual validation was blocked by the cloud environment. No screenshot/pixel QA, real Windows/macOS execution, or native dialog/focus behavior is claimed. Those checks remain necessary before release.
