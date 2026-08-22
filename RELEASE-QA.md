# YasReady Publish v1.0.7 — Kindle Focus QA

## Release goal

Make the ebook workflow feel simple enough to use without understanding EPUB internals while tightening the file specifically for Amazon KDP / Kindle.

## Acceptance flow

1. Open the existing project; migration must not change a manuscript block.
2. Focus on Ebook / Kindle.
3. Confirm title and author metadata.
4. Attach the front cover.
5. Save & Refresh Preview.
6. Inspect front matter, visible Table of Contents, Chapter 1, Chapter 5, a middle chapter, and the final chapter.
7. Review Kindle preflight.
8. Download the KDP EPUB only when the release gate is green.
9. Open the exported EPUB in Kindle Previewer before KDP submission.

## Regression targets

- Story Lock/source coverage.
- Chapter 1 through final-chapter paragraph rhythm.
- Clean reflowable front matter.
- Visible linked Contents immediately before Chapter 1.
- Kindle Go To navigation and NCX.
- One internal cover image, no duplicate HTML cover.
- Reader-controlled body font size and line height.
- No multi-store readiness cards or retailer-specific clutter.
- All literal and dynamic UI controls remain wired.
