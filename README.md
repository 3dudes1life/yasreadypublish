# YasReady Publish v1.0.5

**v1.0.5:** Superman QA hardening. Print proofs are now cryptographically tied to the exact edition/design/structure state that produced them; stale proofs are blocked, print page counts are forced even under YasReady control, edition preflight state invalidates correctly, and the whole app runs through an expanded button/import/safety audit. The 1.0.4 whole-book spacing correction remains intact.

Private, local-first manuscript-to-book production for YasReady.

**Prime directive:** format the book; never rewrite the story.

## 1.0 workflow

1. **Import** a finished Microsoft Word `.docx` manuscript.
2. **Story Lock** fingerprints the canonical manuscript text with SHA-256.
3. **Review structure**: chapters, front/back matter, texts, scene breaks, and metadata-only repairs.
4. **Choose editions**: paperback, hardcover, ebook, or any combination.
5. **Design each physical edition independently** with reusable themes, including `Tres Amigos Series · Book 1`.
6. **Build Print Preview** using fixed single pages, mirrored margins, right-hand chapter starts, generated Contents, folios, and controlled blank pages.
7. **Print Export** runs edition-specific KDP preflight, opens the fixed-page production master, performs final overflow validation, and launches the system **Save as PDF** flow.
8. **Ebook / Kindle** builds a separate reflowable EPUB 3 with clickable navigation.
9. **Final Check** verifies Story Lock plus every enabled edition in one run.

## What makes 1.0.5 stable

- Guided Project Home with a clear manuscript → structure → editions → design → proof → export path.
- **Superman Ready Final Check** evaluates only the editions you enabled.
- Every print preview carries a **proof signature** tied to edition type, Story Lock hash, metadata, structure overrides, and normalized design. Changing any of those makes the old proof ineligible for export.
- Paperback and hardcover keep independent trim, gutter, pagination, generated Contents numbers, page counts, and preflight state.
- Physical proofs are forced to an **even total page count** with a YasReady-controlled terminal blank when necessary.
- Tres Amigos whole-book rhythm is renderer-owned: 0.12 in paragraph spacing in print and 0.7 em in ebook across all chapters, while empty source paragraphs remain preserved by Story Lock but do not randomly change visual rhythm.
- Portable **Project Backup / Restore** re-verifies Story Lock before a restored project is accepted.
- `npm run verify` runs the automated test suite, static verification, and the **Superman audit**.
- Superman audit checks JavaScript syntax/import resolution, button wiring, dynamic control families, version consistency, critical safety guards, and confirms no fetch/XHR/WebSocket/sendBeacon manuscript-egress path exists in the app source.
- Project schema 15 / app version 1.0.5.
- Story wording remains read-only throughout the publishing UI.

## Paperback engine

- 6×9 default trim.
- Mirrored left/right margins.
- Page-count-aware KDP inside-margin gate.
- Right-hand odd-page chapter starts.
- Intentional blank versos with no header or folio.
- Automatic print Table of Contents using final printed page numbers.
- Book 1-style page numbers in the actual fixed-page print master.
- Optional running headers with chapter-opening suppression.
- Source bold/italic/underline/strike/small-caps rendering.
- Final fixed-page overflow check before the system Print / Save as PDF dialog is enabled.

The current print exporter is intentionally **text-first / no bleed**. DOCX image assets block print export rather than being silently omitted.

## EPUB / Kindle engine

- EPUB 3 reflowable package.
- `nav.xhtml` + `toc.ncx` navigation.
- Clickable chapter and recognized matter links.
- Separate ebook typography controls.
- No print gutters, fixed pages, folios, running headers, or blank versos.
- Source-coverage verification requires every source paragraph exactly once and in source order.
- Story Lock hash embedded in package metadata.

DOCX image assets currently block EPUB export rather than being silently omitted.

## Story Lock

The canonical manuscript is the ordered source paragraph text joined with a paragraph separator and fingerprinted at import. Presentation metadata lives separately.

YasReady may change:

- page geometry
- typography
- pagination
- generated Table of Contents
- folios and running headers
- metadata-only paragraph classification
- EPUB packaging / navigation

YasReady may **not** silently change:

- words
- punctuation
- capitalization
- paragraph order
- text-message wording
- dialogue
- story content

If an operation cannot safely preserve source coverage, export is blocked.

## Run locally

```bash
npm run verify
npm run dev
```

Open `http://localhost:4173`.

No `npm install` is required for the application runtime. JSZip is vendored in `public/vendor/`.

## GitHub Pages

The app uses relative static paths and can run from a repository subpath such as:

`https://3dudes1life.github.io/yasreadypublish/`

## KDP production note

The built-in no-bleed preflight follows the current KDP paperback thresholds used by the 1.0 release: single-page interiors, 7 pt minimum text, at least 0.25 in outside margin, and inside margins that increase with page count. For 501–700 pages the current KDP inside minimum is 0.75 in. Always re-check KDP requirements if Amazon changes its manufacturing specifications.

See `KDP-PREFLIGHT.md`, `EPUB-PREFLIGHT.md`, `STORY-LOCK-SPEC.md`, and `RELEASE-QA.md`.


## 1.0.1 Book 2 proof corrections

The Tres Amigos template now uses no extra paragraph-after gap and begins generated print Contents on a left-hand page so the TOC reads as a facing spread before the blank verso and right-hand Chapter 1 opening. These are design-layer corrections only; Story Lock manuscript text is unchanged.
