# YasReady Publish 1.0.14 — Kindle Production Rules

YasReady deliberately produces a conservative reflowable EPUB for Amazon KDP while keeping Preview Studio simulation and editing metadata separate from production content.

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

## Preview versus EPUB

Device type, orientation, appearance, preview reference size, Focus Preview, and the 3-View Torture Test are **simulation controls**. They do not alter the EPUB.

Layout/semantic changes made through the Format Inspector are **edition presentation metadata**. They may alter generated XHTML/CSS presentation but may not alter manuscript wording, note text, media bytes, source IDs/order, or Story Lock hashes.

## Production Console / review decisions

The Production Console combines setup, technical preflight, Kindle Pro quality, and Kindle Intelligence. Its Polish Queue is a production workflow layer outside the EPUB package.

- blocking errors can never be dismissed as intentional
- a non-blocking finding may be marked intentional only for its exact current token (identity, severity, label, message, source location, fingerprint)
- if that finding changes, the old acknowledgement does not match and the item resurfaces
- an acknowledgement never changes source text, EPUB markup, or the underlying QA finding

## Semantic fiction roles

Kindle-safe semantic presentation includes Subheads, Block Quotes, Written Notes / Letters, Verse / Poetry, Text Conversations, Scene Breaks, Footnotes / Endnotes, and supported inline manuscript images. Role assignment remains presentation metadata.

## Kindle Intelligence rules

Whole-book intelligence may compare presentation fingerprints, flag isolated drift, navigate to source-backed blocks, and apply explicit presentation-only safe fixes. It may not rewrite, normalize, delete, or reorder manuscript text.

## Story Lock v2 for new imports

New DOCX imports protect canonical paragraph wording/boundaries, footnote/endnote wording, and embedded-image SHA-256 fingerprints/file identity. Existing projects retain their canonical version/hash unless deliberately reimported.

## Release gate

Kindle release requires Story Lock/source coverage, EPUB preflight, Kindle Pro quality, Kindle Intelligence, and finished-package audit. **Run Final Check uses the same intelligence gate in 1.0.14.**

Amazon Kindle Previewer remains the final external rendering check for the exact exported EPUB.
