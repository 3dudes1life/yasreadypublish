# EPUB Preflight — v1.0.14

Kindle release requires Story Lock plus KDP EPUB preflight, Kindle Pro quality, Kindle Intelligence, and finished-package auditing.

## Core package checks

- exact source-block coverage and order
- chapter navigation count
- visible linked Contents before Chapter 1
- EPUB 3 navigation + NCX compatibility navigation
- Begin Reading landmark
- exactly one internal cover image and no duplicate cover XHTML
- title, author, publisher, and language metadata
- reflowable structure with reader-controlled body sizing
- Kindle HTML file count/section-size safety
- clean front-matter reflow and source-placeholder detection
- finished nav/spine/fragment target resolution
- no Preview Studio classes/hooks in production output
- Enhanced Typesetting-friendly CSS
- semantic note/image package coverage

## Production workflow layer

The v1.0.14 Production Console and Polish Queue do not add files or markup to the EPUB. Intentional-review records are local edition QA metadata only. They cannot suppress blocking errors and cannot change production content.

The queue combines Kindle Pro and Kindle Intelligence findings so the author can move directly to the next actionable location. Exact-finding review tokens ensure a changed issue resurfaces instead of remaining silently acknowledged.

## Kindle Intelligence

- every chapter receives a presentation fingerprint and consistency score
- chapter-title and opening-paragraph structure are compared across the book
- isolated local layout overrides are surfaced for review
- orphan presentation overrides are surfaced with safe removal actions
- chapter comparison never compares or rewrites story prose
- safe fixes modify ebook presentation metadata only and remain Undo-compatible

The downloadable preflight report includes the Kindle Intelligence report for archival QA.

## Semantic-content checks

- semantic fiction blocks remain source-backed and presentation-only
- embedded DOCX image references must resolve to packaged assets
- image MIME types must be supported by the Kindle path
- image alt text is reviewed for accessibility
- footnote/endnote references must resolve to imported, Story-Locked note text
- finished EPUB audit verifies manuscript-image manifest/file coverage and note targets

New imports use Story Lock canonical v2 for note wording and embedded-media fingerprints. Existing projects are never silently re-hashed during migration.

A green YasReady result is not final retailer acceptance. Open the exact exported EPUB in Amazon Kindle Previewer before upload.
