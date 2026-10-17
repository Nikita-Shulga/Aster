# Review workflows

Aster's eleven-section interface keeps native evidence separate from the browser demonstration. File changes remain disabled under the alpha policy.

## Recommendations

Native recommendations come from the trusted desktop service. Cards explain the evidence and provide a link to the relevant review view. The browser preview derives clearly labelled examples from sample files. Counts can overlap across large files, duplicates, and cache-like files; they must not be added as storage savings.

## Finding a file

Storage, cleanup, large-file, and duplicate views support path/name search, category and exact-extension filters, modification-age filters, and size/name/date sorting. Missing or invalid dates have a separate filter. Modification age does not establish disuse. Reset filters clears all file filters, including folder scope.

Storage includes child-folder drill-down. Folder totals include scanned descendants, and the file table shows the selected folder and its descendants. Thirty child folders are shown by size; path search remains available for others. Tables render at most 500 matching rows with an explicit limit notice. Bulk selection selects only visible rows; duplicate groups deliberately have no bulk-selection control. Review still rejects a selection containing every copy of a duplicate group.

## Comparisons

The native scan engine supplies comparisons after successive scans with known scope. The renderer preserves the engine's comparability flag, warnings, and evidence notes; it never infers matching native scope merely from a folder name. Browser demonstration comparisons are in-memory metadata examples. Added or missing observations do not prove file creation or deletion. Session history is not background monitoring.

## System observations

Native system reports include supported volume-capacity and battery snapshots. Missing readings stay unavailable, zero remains valid, and source limitations remain visible. Security and update checks are explicitly unassessed, without a fabricated health score. Battery charge is not battery health.

## Keyboard and verification

Navigation focuses the main region. Search fields, filters, and file-selection controls retain focus through updates; visible focus styles and reduced-motion support are retained. Native dialog behavior and pixel layout require a real browser/Electron check. The optional `scripts/qa-renderer.cjs` suite checks DOM/events with jsdom, including simulated bridge responses; it does not certify Windows or macOS execution.
