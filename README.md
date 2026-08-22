# YasReady Publish v1.0.6

Private, local-first manuscript-to-book production for YasReady.

**Prime directive:** format the book; never rewrite the story.

## Release focus

Version 1.0.6 intentionally focuses on finishing the **reflowable ebook edition first**. Paperback and Hardcover remain in the project but can be parked while EPUB is proofed and hardened. This keeps one Story-Locked master manuscript while letting each edition own its own production rules.

## Ebook Focus Mode

Open **Ebook / Kindle** and use **Park print editions** to make the current acceptance run ebook-only. No print design or proof is deleted; those editions can be re-enabled later.

The ebook workspace now includes:

- a reflowable EPUB 3 engine
- a visible linked **Table of Contents** immediately before Chapter 1
- EPUB 3 logical navigation via `nav.xhtml`
- legacy `toc.ncx` compatibility navigation
- EPUB landmarks for **Table of Contents** and **Begin Reading**
- chapters-only novel TOC by default, with optional front/back-matter entries
- clean front-matter reflow that removes print-only blank spacing without changing source words
- independent chapter-body paragraph rhythm so inconsistent Word blank paragraphs cannot alter later chapters
- internal JPEG/PNG ebook cover packaging as OPF `cover-image`
- no duplicate HTML cover page
- store-readiness cards for Amazon Kindle, Apple Books, Kobo Writing Life, Google Play Books, and B&N NOOK
- exact source-coverage verification before packaging
- Story Lock SHA-256 embedded as YasReady audit metadata

## Recommended Book 2 ebook settings

- **Publisher / imprint:** `3Dudes1Life Creative`
- **Visible Table of Contents:** Yes — before Chapter 1
- **TOC entries:** Chapters only
- **Front matter reflow:** Clean ebook layout
- **Chapter blank lines:** Collapse source blank lines
- **Reader font behavior:** Reader default
- Attach the final front-cover JPEG or PNG before release.

## Front matter behavior

Word documents often use repeated blank paragraphs to position copyright, legal, dedication, or title-page text on a printed page. Those empty paragraphs are still present in the Story-Locked source, but **Clean ebook layout** gives them zero visual height in reflowable front/back matter. This prevents a print-layout copyright page from becoming a badly spaced ebook page.

The words, punctuation, inline emphasis, block order, IDs, and Story Lock input are unchanged. Authors who truly need Word-derived spacing can select **Use bounded source spacing**; new imports capture paragraph alignment/spacing metadata for that mode.

## Table of Contents behavior

The EPUB contains two reader experiences from the same chapter map:

1. **Visible Contents page** — a linked reading-order item placed before Chapter 1.
2. **Reader navigation** — the EPUB 3 `toc nav`, plus legacy NCX support.

Ebook TOC entries never contain fixed print page numbers. Reflowable page positions depend on device size and reader settings.

## Cover behavior

The attached ebook cover is edition artwork, not manuscript text. YasReady packages it as the EPUB `cover-image`. The preflight checks JPEG/PNG type, dimensions, Apple interior-image pixel ceiling, Google minimum cover size, and a broad 1400px+ short-side quality target.

The marketing/store cover may still be uploaded separately where a retailer supports or requires that workflow.

## Story Lock

The canonical manuscript is the ordered source paragraph text fingerprinted with SHA-256 at import. Presentation metadata lives separately.

YasReady may change:

- reflowable typography and spacing
- chapter/front/back matter classification metadata
- visible/logical navigation
- cover packaging
- EPUB metadata and container files
- print geometry/pagination when print editions are later resumed

YasReady may **not** silently change:

- words
- punctuation
- capitalization
- paragraph order
- dialogue
- text-message wording
- story content

If exact source coverage cannot be verified, export is blocked.

## Current release gate

Run:

```bash
npm run verify
```

Version 1.0.6 currently passes:

- **96 / 96 automated tests**
- static JavaScript verification
- Superman audit
- 22 application JS module syntax/import checks
- 36 literal button wiring checks
- 11 dynamic control-family checks
- browser-source scan showing no `fetch`, XHR, WebSocket, or `sendBeacon` manuscript-egress path

This is a software gate, not a claim that no browser/runtime bug can ever exist. The commercial acceptance gate remains a real-device pass of the final EPUB.

## Run locally

```bash
npm run verify
npm run dev
```

Open `http://localhost:4173`.

No `npm install` is required for the application runtime. JSZip is vendored under `public/vendor/`.

## GitHub Pages

The app uses relative static paths and can run from:

`https://3dudes1life.github.io/yasreadypublish/`

See `EBOOK-PREFLIGHT.md`, `EBOOK-STANDARDS.md`, `STORY-LOCK-SPEC.md`, `KDP-PREFLIGHT.md`, and `RELEASE-QA.md`.
