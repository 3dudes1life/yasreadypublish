# YasReady Publish — Story Lock Specification

## Non-negotiable rule

YasReady Publish may transform **presentation metadata**. It may not silently transform manuscript language.

## Canonical source

The imported final DOCX is treated as the canonical manuscript source. On import, Publish creates SHA-256 fingerprints for both the source file and canonical manuscript text.

## Allowed operations

- classify paragraphs and chapter boundaries
- map front/body/back matter without reordering source blocks
- paginate source blocks
- change trim size, margins, gutters, typography, spacing, headers, and folios
- insert print-only blank pages
- save/apply reusable print themes
- export/import **theme metadata**
- navigate and preview the resulting book
- generate a print master from already-verified page fragments
- export preflight metadata and reports
- map the same locked source into reflowable EPUB sections
- generate ebook navigation and package metadata

## Forbidden silent operations

- rewriting or paraphrasing prose
- autocorrecting spelling or punctuation
- changing capitalization
- merging/deleting/reordering manuscript paragraphs
- altering text-message wording
- guessing tracked-change outcomes
- storing manuscript prose inside reusable theme files

## Theme isolation (v0.6)

A theme contains presentation settings only. Theme save/export/import operations do not copy `project.manuscript`, source blocks, canonical text, or Story Lock hashes.

Deleting a theme affects only the saved theme record. It does not alter a book project or its manuscript.

## Pagination verification

Before pagination, Story Lock verifies the current canonical manuscript text against the import fingerprint.

After pagination, Publish reconstructs each source paragraph from its rendered page fragments and compares the reconstructed text character-for-character with the source paragraph. A mismatch blocks the preview.

## Failure behavior

When Publish cannot safely interpret or verify content, it must stop and report the problem rather than inventing a correction.


## Production export isolation (v0.7)

KDP export is a presentation-only operation. Immediately before creating a print master, Publish re-verifies the current canonical manuscript against the original SHA-256 manuscript fingerprint.

The print master is built from the same page fragments that passed post-pagination character-for-character reconstruction. Export may add HTML/PDF page containers, headers, folios, and print-only blank pages, but it may not create substitute prose or alter fragment text.

If Story Lock fails, KDP export is blocked. If a fixed production page overflows in the print-master window, Print / Save as PDF remains disabled until the layout is corrected.


## EPUB export isolation (v0.8)

EPUB export is a second presentation engine, not a manuscript editor. Print-only concepts such as physical page numbers, gutters, running headers, and blank versos are excluded from reflowable output instead of being translated into story content.

Immediately before EPUB packaging, Publish re-verifies the canonical SHA-256 manuscript fingerprint. It then builds an ebook section map and verifies that every imported source block appears exactly once, in original order, with identical text. A mismatch blocks export.

Generated XHTML may encode reserved XML characters such as `<` and `&` for valid markup, but their decoded text remains the original source characters. Navigation labels, metadata, stylesheets, package files, and EPUB container files are presentation/package metadata and are kept outside the canonical manuscript layer.

## Generated matter + Structure Repair isolation (v0.9)

Version 0.9 introduces two presentation/structure features that remain outside the canonical source layer.

### Generated print Table of Contents

The print TOC is created as generated layout fragments after a first pagination pass. Its labels come from detected chapter/back-matter headings and its numbers come from the printed page map. These generated fragments have no source paragraph identity and are excluded from canonical manuscript reconstruction.

After the generated TOC is inserted, Publish re-paginates and compares every TOC target against the final printed page map. A mismatch blocks print export.

If the imported DOCX already contains a source `Table of Contents` / `Contents` heading, Publish does not add a second generated TOC and does not delete the source TOC. The user must intentionally change the master DOCX and re-import if they want to replace a manual TOC with generated matter.

### Structure Repair

Structure Repair stores only a mapping of source paragraph ID to structural classification. It may change how a paragraph is treated by layout—for example, `body` → `chapter-title`—but it cannot change that paragraph's text, runs, order, source ID, or canonical hash input.

Story Lock verification always hashes the original `project.manuscript.blocks`, never an effective/overridden copy. Print and EPUB engines may consume an effective structural clone, but source coverage is checked against the immutable original block IDs and text.

### Unsupported source-content protection

If a DOCX contains footnotes or endnotes that the current importer cannot safely place into reading order, import is blocked instead of omitting the note text. Other layout-sensitive constructs such as tables, Word fields, and manual page breaks are surfaced in preflight rather than silently treated as fully supported formatting.
