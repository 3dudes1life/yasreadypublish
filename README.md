# YasReady Publish

Private publishing system for YasReady.

## Version 0.1.0 — Story Lock Foundation

This first release intentionally does **not** format or edit the manuscript. It establishes the content-safety architecture that every later release must respect.

### What 0.1 does

- Imports `.docx` files entirely in the browser.
- Reads Word's underlying `document.xml` directly; no copy/paste pipeline.
- Preserves paragraph text as the canonical manuscript content layer.
- Detects common chapter titles (`Chapter 1`, Roman numerals, Prologue/Epilogue).
- Detects `[Name]:` text-message paragraphs without changing them.
- Maps scene breaks and Word paragraph styles for later design rules.
- Generates SHA-256 fingerprints for both the original DOCX bytes and canonical manuscript text.
- Saves projects locally in IndexedDB.
- Provides a **read-only** source inspector. There is no manuscript editor.
- Can re-verify Story Lock at any time.

### Story Lock rule

> YasReady Publish may transform presentation and structure metadata. It may never alter manuscript language without an explicit, user-authored source change.

0.1 enforces the safest version of that rule by having **no content-editing path at all**.

## Local development

```bash
npm run dev
```

No package install is required for v0.1; JSZip is vendored so the app can run entirely offline once cloned.

Open the URL Vite prints (normally `http://localhost:5173`).

## Verify before pushing

```bash
npm run verify
```

This runs the Story Lock/parser tests plus a static/syntax verification pass.

## Cloudflare Pages

v0.1 is intentionally a self-contained static site:

- Build command: leave blank (or use `npm run verify` as CI)
- Output directory: repository root (`.`)
- No server runtime is required

No API or database is required for 0.1. Manuscripts remain in the browser and projects are stored locally in IndexedDB.

## Roadmap

### 0.2 — Print structure
- 6 × 9 page model
- mirrored pages
- configurable inside/outside/top/bottom margins
- gutter logic
- right-hand / odd-page chapter starts
- automatic blank verso pages

### 0.3 — Typography + Tres Amigos template
- body typography
- paragraph indent/leading
- chapter title rules
- scene breaks
- text-message styling
- Book 1-derived `Tres Amigos Series` template

### Later milestones
- visual spreads
- headers/footers/page numbers
- print preflight
- PDF export
- EPUB/Kindle export
- cloud projects and entitlements

## Privacy note

0.1 does not upload manuscript text anywhere. A future cloud-backed version must preserve Story Lock, explicit source-versioning, and integrity verification as mandatory architecture.
