# YasReady Publish v0.4.0

Private manuscript-to-book production software.

## Current milestone

v0.4 adds **whole-book structure and page furniture** around the Story-Locked manuscript. Publish now distinguishes front matter, chapter body, and recognized back matter; stores book title/author as metadata; and can render optional running headers without inserting anything into the manuscript.

### Active in v0.4

- Local DOCX import
- SHA-256 Story Lock
- Read-only Source Inspector
- Chapter detection
- Front matter mapping before Chapter 1
- Conservative back matter detection (About the Authors, Join the Journey, acknowledgments, etc.)
- Book title + author metadata stored outside manuscript text
- 6×9 mirrored page model
- Right-hand/odd chapter starts and automatic blank versos
- Tres Amigos Series · Book 1 typography and margins
- Printed folios beginning at Chapter 1
- Optional running headers with three metadata patterns
- Automatic running-header suppression on front matter, back matter and chapter openings
- Back matter begins on a fresh physical page when confidently detected
- Two-page spread preview with section labels
- Post-pagination source-text integrity verification

### Not claimed yet

- Production PDF export
- EPUB/Kindle export
- Automated TOC generation
- Production widow/orphan controls
- Embedded-font packaging

## Story Lock

Formatting is presentation metadata only. Matter detection never reorders source blocks. Running headers are generated from project metadata and chapter structure, never inserted into manuscript text. If Story Lock fails, pagination remains blocked.

## Run locally

```bash
npm run verify
npm run dev
```

Then open `http://localhost:4173`.
