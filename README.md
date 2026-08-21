# YasReady Publish v0.5.0

Private manuscript-to-book production software.

## Current milestone

v0.5 adds a **long-book production navigator** on top of the Story-Locked print engine. The manuscript can now be inspected by chapter, physical page, printed page, spread, and front/body/back section without scrolling through hundreds of rendered pages or altering source prose.

### Active in v0.5

- Local DOCX import
- SHA-256 Story Lock
- Read-only Source Inspector
- Chapter detection
- Front matter / story body / conservative back matter mapping
- Book title + author metadata stored outside manuscript text
- 6×9 mirrored page model
- Right-hand/odd chapter starts and automatic blank versos
- Tres Amigos Series · Book 1 typography and margins
- Printed folios beginning at Chapter 1
- Optional running headers
- Post-pagination source-text integrity verification
- Dedicated Manuscript Navigator view
- Page map generated only after Story Lock-safe pagination
- Direct chapter and section jumps
- Previous/next chapter controls
- Previous/next spread controls
- Physical-page jump field
- Full-book page scrubber for 500+ page books
- Zoomable two-page spread preview
- Searchable preview navigator rail
- Current chapter/location highlighting

### Not claimed yet

- Production PDF export
- EPUB/Kindle export
- Automated TOC generation
- Production widow/orphan controls
- Embedded-font packaging

## Story Lock

Navigation is presentation metadata only. The navigator stores page destinations and section/chapter labels generated from the already-locked manuscript structure. It never creates or edits an alternate copy of story prose. If Story Lock or post-pagination integrity fails, page mapping remains blocked.

## Run locally

```bash
npm run verify
npm run dev
```

Then open `http://localhost:4173`.
