# YasReady Publish 1.0.13 — Kindle Production Rules

YasReady deliberately produces a conservative reflowable EPUB for Amazon KDP.

## Core production rules

- EPUB 3 reflowable package
- visible linked Table of Contents before Chapter 1
- EPUB navigation document plus NCX compatibility navigation
- Begin Reading landmark at the first chapter
- one internal cover image; no duplicate cover XHTML page
- no print trim, gutter, running folios, or blank versos in ebook output
- body font size and base line-height remain reader-controlled
- relative-unit chapter and semantic styling
- Story Lock SHA-256 embedded in package metadata

## Semantic fiction roles

Version 1.0.13 retains Kindle-safe structure for:

- Subheads (`h2`)
- Block Quotes (`blockquote`)
- Written Notes / Letters (`aside`)
- Verse / Poetry
- Text Conversations
- Scene Breaks
- Footnotes / Endnotes with EPUB note semantics
- Inline manuscript images with responsive sizing and alt text when supplied

Role assignment is presentation metadata. Source words, block IDs, and source order remain locked.


## Kindle Intelligence rules

Whole-book intelligence is presentation QA, not manuscript editing. It may:

- compare chapter presentation fingerprints
- flag isolated heading/opening/local-layout drift
- navigate directly to a source-backed block
- remove or normalize edition presentation metadata after an explicit user action

It may not rewrite, normalize, delete, or reorder manuscript text. Safe fixes preserve semantic Content style when only layout properties are being reset.

## Story Lock v2 for new imports

New DOCX imports protect:

- canonical paragraph wording/boundaries
- footnote/endnote wording
- embedded-image SHA-256 fingerprints and file identity

Story Lock verification also recomputes embedded image bytes against their stored fingerprints. Existing projects keep canonical v1 unless they are deliberately reimported from DOCX.

## Kindle Pro checks retained

- finished navigation targets resolve
- finished spine targets resolve
- Story Lock metadata matches the current project
- production CSS does not force body px/pt size
- no fixed/absolute book-content positioning or negative-margin hacks
- chapter headings use relative sizing and explicit breaks
- whole book scanned for structural/presentation outliers
- 3-View Torture Test for small phone, normal Kindle, and large tablet

Amazon Kindle Previewer remains the final external rendering check.
