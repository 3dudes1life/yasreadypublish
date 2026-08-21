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
