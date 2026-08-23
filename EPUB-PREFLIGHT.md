# EPUB Preflight — v1.0.13

Kindle release requires Story Lock plus the KDP EPUB, Kindle Pro quality, and Kindle Intelligence structure gates.

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
- finished nav/spine target resolution
- no Preview Studio classes/hooks in production output
- Enhanced Typesetting-friendly CSS


## v1.0.13 intelligence checks

- every chapter receives a presentation fingerprint and consistency score
- chapter-title and opening-paragraph structure are compared across the book
- isolated local layout overrides are surfaced for review
- orphan presentation overrides are surfaced with a safe removal action
- chapter comparison never compares or rewrites story prose
- safe fixes modify ebook presentation metadata only and remain undo-compatible

The downloadable preflight JSON includes the full Kindle Intelligence report so production QA can be archived with the release.

## v1.0.12 semantic-content checks

- semantic fiction blocks remain source-backed and presentation-only
- embedded DOCX image references must resolve to packaged assets
- image MIME types must be supported by the Kindle path
- image alt text is reviewed for accessibility
- footnote/endnote references must resolve to imported, Story-Locked note text
- finished EPUB audit verifies manuscript-image manifest/file coverage and note targets

New imports use Story Lock canonical v2 so note wording and embedded-media fingerprints participate in the source integrity gate. Existing projects are never silently re-hashed during migration.

A green YasReady preview is not final retailer acceptance. Open the exact exported EPUB in Amazon Kindle Previewer before upload.
