# YasReady Publish 1.0.8 — Kindle / KDP Standards

This release intentionally targets one ebook output: a reflowable EPUB for Amazon KDP / Kindle. Paperback and hardcover remain separate editions.

## KDP rules enforced by YasReady

- EPUB 3 reflowable package.
- Exact Story Lock verification immediately before export.
- Every source paragraph must map exactly once and in source order.
- Working logical Table of Contents for every detected chapter.
- Visible linked Contents page placed near the beginning, immediately before Chapter 1.
- EPUB landmarks identify the Contents and Begin Reading location.
- No fixed print page numbers in the ebook TOC.
- Internal high-resolution cover image packaged exactly once as `cover-image`; no duplicate HTML cover page.
- Title, author and language metadata required.
- Body font size and line height are left to Kindle reader defaults.
- Relative-unit paragraph indentation/spacing only.
- Fewer than 300 XHTML files.
- Individual source sections must remain below Amazon's 30 MB HTML-file limit.
- DOCX images block export until image packaging is implemented rather than being silently dropped.

## Cover target

KDP recommends approximately 1600 × 2560 pixels for the marketing cover and requires a high-resolution internal content cover. YasReady treats 1600 × 2500+ as the high-resolution target and warns below it. The marketing cover is still uploaded separately in KDP.

## Final acceptance

YasReady preflight is not a substitute for Amazon's converter. The release file should still be opened in Kindle Previewer and inspected on phone, tablet and e-reader views before submission.


## Preview Studio safety

The live Preview Studio is a rendering surface, not a manuscript editor. Cover preview is synthetic and must not create a duplicate XHTML cover page. Formatting overrides may alter presentation metadata and final EPUB CSS/inline presentation, but cannot alter source wording. Device proofs are read-only derivatives and remain local/share-sheet files in 1.0.8.
