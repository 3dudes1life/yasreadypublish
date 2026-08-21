# Changelog

## v0.8.0 — EPUB / Kindle Engine

- Added a dedicated reflowable Ebook / Kindle workspace.
- Added independent ebook design metadata so print geometry can never leak into EPUB layout.
- Added EPUB 3 package generation with uncompressed root `mimetype`, container.xml, OPF, XHTML reading order, CSS, `nav.xhtml`, and `toc.ncx`.
- Added automatic clickable Contents from safely detected chapters and recognized front/back matter.
- Added ebook section mapping that preserves every source block exactly once and in original order.
- Added ebook source-coverage integrity checks in addition to the canonical Story Lock SHA-256 check.
- Added reflowable preview and chapter/matter navigation.
- Added EPUB metadata controls for language and publisher while retaining project title/author metadata.
- Added Story Lock hash metadata inside the EPUB package for auditability.
- Added EPUB preflight and downloadable EPUB preflight JSON report.
- Added direct browser download of the generated `.epub`.
- Kept DOCX image assets blocked in 0.8 rather than silently omitting them.
- Migrated projects to schema version 8 / app version 0.8.0 without changing Story Lock hashes.
- Expanded the automated suite to 42 tests, including a real EPUB archive check that verifies the required uncompressed root `mimetype` entry.

## v0.7.0 — KDP Production Gate

- Added dedicated KDP Export workspace.
- Added page-count-aware paperback preflight using the current KDP inside-margin bands.
- Added checks for single-page interior output, page count, trim, no-bleed outside margin, minimum font size, right-hand chapter starts, Story Lock, and intentional blank-page furniture.
- Added DOCX image-asset detection and blocks 0.7 export when images are present rather than silently dropping them.
- Added fixed single-page Print Master HTML generation with CSS `@page` dimensions matching the selected trim size.
- Added export-window production overflow detection; Print / Save as PDF stays disabled if any page exceeds its fixed page box.
- Added Story Lock re-verification immediately before every print-master export.
- Added downloadable Print Master HTML and KDP preflight JSON report.
- Intentional blank versos now suppress both running headers and page-number folios.
- Migrated projects to schema version 7 / app version 0.7.0 without changing Story Lock hashes.
- Added KDP preflight and print-master tests.

## v0.6.0 — Reusable House Styles

- Added a reusable Theme Library while preserving the Story-Locked manuscript layer.
- Added built-in `Tres Amigos Series · Book 1`, `Classic Novel`, and `Modern Romance` print themes.
- Added private custom-theme creation from the current design.
- Added theme JSON export/import for backups and reuse across books/browsers.
- Added safe custom-theme deletion; deleting a theme never deletes or alters a manuscript.
- Added a Book 1 Calibration Inspector that compares presentation metadata against the saved series reference profile.
- Added body alignment and chapter-title alignment controls.
- Added configurable folio bottom/outside positions and running-header top/outside positions.
- Updated Book 1 preview furniture to use design-controlled placement rather than fixed preview pixels.
- Migrated projects to schema version 6 / app version 0.6.0 without changing Story Lock hashes.
- Added theme-store and calibration tests.

## v0.5.0 — Long Book Navigator

- Added a dedicated Navigator view for 500+ page books.
- Added physical-page and printed-page mapping for every detected chapter.
- Added direct jumps to front matter, chapters, and recognized back matter.
- Added previous/next chapter and previous/next spread controls.
- Added physical-page jump, full-book page scrubber, and preview zoom levels.
- Added a searchable navigation rail next to the spread preview.
- Kept all navigation outside the Story-Locked source layer.

## v0.4.0 — Whole Book Structure

- Added front/body/back matter mapping.
- Added running headers generated from metadata and chapter structure.
- Added header suppression rules for chapter openings and blank pages.
- Added fresh-page back-matter starts.

## v0.3.0 — Tres Amigos Template

- Added the initial Book 1 6×9 presentation profile.
- Added page numbers and chapter-opening styling.
- Added inline DOCX run formatting in preview.
- Added post-pagination text-integrity verification.

## v0.2.0 — Print Structure

- Added mirrored page geometry, binding margins, odd/right chapter starts, intentional blank versos, and structural spread preview.

## v0.1.0 — Story Lock Foundation

- Added local DOCX import, chapter detection, read-only source inspector, IndexedDB projects, and SHA-256 Story Lock.
