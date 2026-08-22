# YasReady Publish v1.0.6 — Ebook Focus Release QA

## Automated gate

Run:

```bash
npm run verify
```

Current result:

- Automated suite: **96 / 96 PASS**
- Static verification: **PASS**
- Superman audit: **PASS**
- Application JS syntax/import checks: **22 modules**
- Literal button IDs audited: **36**
- Dynamic control families audited: **11**
- Browser network-egress primitive scan: **PASS** (`fetch` / XHR / WebSocket / `sendBeacon` absent from application source)

## 1.0.6 regression targets

- Existing 1.0.5 projects migrate to schema 16 without changing manuscript blocks.
- Ebook migration enables visible TOC, chapters-only navigation, and Clean front matter.
- Chapter navigation includes every detected chapter and excludes copyright/dedication clutter by default.
- Visible Table of Contents is inserted immediately before Chapter 1.
- OPF spine includes the nav/Contents document before the first chapter.
- Landmarks identify Table of Contents and Begin Reading.
- Internal ebook cover is packaged once as `cover-image`; no duplicate HTML cover page is created.
- Missing cover blocks universal export.
- A compliant cover clears all five retailer readiness cards.
- Clean front matter collapses print-only blank paragraph presentation while preserving source words.
- Uniform chapter-body rhythm remains unchanged after front-matter cleanup.
- Source coverage remains exact and in order.

## Manual Book 2 ebook acceptance run

1. Open the existing Book 2 project; do not re-import solely for 1.0.6 Clean mode.
2. Open **Ebook / Kindle**.
3. Click **Park print editions**.
4. Confirm title: `Tres Amigos, Una Vida: A Throuple Love Story — Fault Lines`.
5. Confirm author: `D.C.W.`.
6. Set Publisher / imprint: `3Dudes1Life Creative`.
7. Attach the final front-cover JPEG/PNG.
8. Leave **Visible Table of Contents = Yes**.
9. Leave **TOC entries = Chapters only** for the novel.
10. Leave **Front matter reflow = Clean ebook layout**.
11. Inspect the copyright page and copyright-law page.
12. Inspect the dedication.
13. Open the synthetic **Table of Contents** reading-order item; verify all 55 chapters appear and links target the correct chapters.
14. Inspect Chapter 1.
15. Inspect Chapter 5, the first chapter that exposed earlier spacing inconsistency.
16. Inspect a middle chapter around Chapter 30.
17. Inspect Chapter 55.
18. Run EPUB preflight and clear all blocking errors.
19. Download the Universal EPUB.
20. Validate it with current EPUBCheck and open it in retailer/device preview tooling before commercial upload.

## What this QA does not claim

Passing 96 automated tests does not prove that every reader engine will render every page identically. Reflowable books intentionally respond to reader font/size/margin settings. 1.0.6 therefore treats the real exported EPUB in real reader tooling as the final acceptance gate.
