# Changelog

## 0.5.0 — Long-book navigator + production workbench

- Added a dedicated Manuscript Navigator view for fast chapter inspection.
- Added page-map generation after safe pagination; no page numbers are guessed before layout exists.
- Added direct jumps to front matter, every detected chapter, and recognized back matter.
- Added previous/next chapter navigation in Print Preview.
- Added a full-book physical-page scrubber for large manuscripts.
- Added searchable navigator rail beside the two-page spread.
- Added four preview zoom levels without changing pagination or manuscript content.
- Added current chapter/location highlighting and physical/printed page readouts.
- Added tested physical-page ↔ spread mapping helpers.
- Story Lock and post-pagination paragraph reconstruction remain mandatory.

## 0.4.0 — Whole-book structure + page furniture

- Added read-only Book Matter view that maps front matter, chapter body, and recognized back matter without moving source paragraphs.
- Added conservative back-matter detection; uncertain content stays in the story body instead of being guessed.
- Added project-level book title and author metadata outside Story Lock text.
- Added optional running headers with book/chapter and author/book patterns.
- Added running-header suppression on front matter, recognized back matter, intentional blanks, and chapter-opening pages.
- Added page section/chapter metadata to the two-page preview.
- Recognized back matter begins on a fresh physical page while continuing printed book numbering.
- Expanded Story Lock tests to cover book matter and generated page furniture.
- Manuscript wording remains read-only and pagination integrity is still mandatory.

## 0.3.0 — Book 1 calibrated series template

- Added `Tres Amigos Series · Book 1` template based on the published paperback interior.
- Calibrated 6×9 trim, 1.25 in inside margin, 0.5 in outside/top margin, 0.75 in bottom margin.
- Calibrated Arial 12 pt body typography, 1.10 line-height, 0.5 in first-line indent and paragraph rhythm.
- Added 14 pt centered chapter treatment with bold `Chapter N:` prefix and regular chapter title.
- Added outside-bottom printed folios beginning with page 1 at the first chapter; front matter remains unnumbered.
- Added inline DOCX emphasis rendering for bold, italic, underline, strike and small caps.
- Added pagination-integrity verification that reconstructs every source paragraph after page splitting and blocks preview on mismatch.
- Story Lock remains mandatory and manuscript wording remains read-only.

## 0.2.0

- Added print structure engine, mirrored margins, right-page chapter starts and spread preview.

## 0.1.0

- Added local DOCX import, chapter detection, Source Inspector and Story Lock fingerprinting.
