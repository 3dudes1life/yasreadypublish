# YasReady Publish v0.8.0

Private, Story-Locked book production software being built toward a Vellum-quality YasReady Publish 1.0.

## What v0.8 adds

Version 0.8 introduces a **separate reflowable EPUB / Kindle engine** while preserving the fixed-page paperback engine from 0.7. Both engines consume the same canonical manuscript blocks and neither has permission to rewrite story text.

- Dedicated **Ebook / Kindle** workspace
- EPUB 3 reflowable packaging entirely in the browser
- Clickable Contents generated from detected chapters and recognized book matter
- EPUB 3 `nav.xhtml` plus legacy `toc.ncx` navigation
- Reading-order XHTML split into front matter, chapter files, and recognized back matter
- Ebook-specific typography controls independent from print gutters, trim, folios, and blank versos
- Reflowable section preview with generated navigation rail
- EPUB metadata for title, creator, language, publisher, stable UUID identifier, and modified timestamp
- Story Lock SHA-256 embedded as YasReady package metadata
- EPUB preflight and downloadable JSON report
- Source-coverage verification that confirms every imported paragraph maps into the ebook exactly once, in original order, with exact source text
- Story Lock is re-verified immediately before `.epub` packaging
- DOCX images remain intentionally blocked in 0.8 rather than silently omitted

## Two production engines

### Paperback / KDP

The print engine remains fixed-page:

- 6 × 9 and other trim sizes
- mirrored margins / binding gutter
- physical page parity
- intentional blank versos
- folios and running headers
- KDP preflight
- single-page Print Master for Save as PDF

### EPUB / Kindle

The ebook engine is deliberately reflowable:

- no fixed trim size
- no gutter
- no physical page numbers
- no print blank versos
- no running headers
- reader-controlled screen size and font behavior
- publisher-controlled chapter structure, inline emphasis, scene breaks, text-message presentation, and clickable navigation

## EPUB workflow

1. Import the final DOCX.
2. Set Book Title and Author metadata on the Project screen.
3. Open **Ebook / Kindle**.
4. Set language/publisher and reflowable typography.
5. Review generated Contents and the reflowable preview.
6. Resolve blocking EPUB preflight errors.
7. Click **Download .EPUB**.
8. Validate the generated EPUB in the target retailer/reader previewer before release.

The `.epub` is created locally in the browser with the already-vendored JSZip runtime. No manuscript text is sent to a server by YasReady Publish 0.8.

## Story Lock remains rule #1

The imported DOCX is canonical. Design metadata is stored separately. Before print or EPUB export, the current manuscript hash is recalculated and compared with the import fingerprint.

For EPUB, Publish performs a second structural integrity check: all source blocks must appear exactly once and in source order in the ebook section map. If either verification fails, export stops.

See `STORY-LOCK-SPEC.md`, `KDP-PREFLIGHT.md`, and `EPUB-PREFLIGHT.md`.

## Run locally

```bash
npm run verify
npm run dev
```

Open `http://localhost:4173`.

No `npm install` is required for the current static build.

## GitHub Pages

The project uses relative static paths and can be hosted at a repository subpath such as:

`https://3dudes1life.github.io/yasreadypublish/`

## Current roadmap

- **0.8** EPUB/Kindle engine + clickable ebook Contents
- **0.9** import repair, automated print TOC, edge-case hardening, EPUB/PDF inspection tooling
- **1.0** private publisher-grade release
