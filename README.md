# YasReady Publish v0.3.0

Private manuscript-to-book production software.

## Current milestone

v0.3 adds the first production-calibrated design preset: **Tres Amigos Series · Book 1**. It is based on measurements from the published Book 1 paperback and sits entirely outside the locked manuscript content layer.

### Active in v0.3

- Local DOCX import
- SHA-256 Story Lock
- Chapter detection
- Read-only source inspector
- 6×9 mirrored page model
- Right-hand/odd chapter starts
- Automatic blank versos
- Book 1-calibrated page geometry and typography
- Inline bold/italic/underline/strike/small-caps rendering
- Printed page numbers beginning at Chapter 1, with front matter unnumbered
- Outside-bottom folios matching Book 1's placement logic
- Two-page preview
- Post-pagination manuscript integrity verification

### Not claimed yet

- Production PDF export
- EPUB/Kindle export
- Automated TOC generation
- Production widow/orphan controls
- Embedded-font packaging

## Story Lock

Formatting is allowed to change presentation only. Manuscript wording cannot be edited by YasReady Publish. Pagination is blocked if source integrity verification fails.

## Run locally

```bash
npm run verify
npm run dev
```

Then open `http://localhost:4173`.
