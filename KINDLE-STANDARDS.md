# YasReady Publish 1.0.10 — Kindle / KDP Standards

This release targets one ebook output: a reflowable EPUB for Amazon KDP / Kindle.

## Source of truth

YasReady's Preview Studio is a production workbench using the same ebook section renderer and stylesheet source as EPUB packaging. It is not Amazon's proprietary Kindle Previewer. The exact exported EPUB must still be opened in Amazon Kindle Previewer before submission.

## KDP-oriented rules enforced

- EPUB 3 reflowable package.
- Exact Story Lock verification before export.
- Every source paragraph maps exactly once and in source order.
- Working logical Table of Contents for detected chapters.
- Visible linked Contents immediately before Chapter 1.
- EPUB landmarks identify Contents and Begin Reading.
- No fixed print page numbers in ebook Contents.
- One internal cover image packaged as `cover-image`; no duplicate HTML cover page.
- Title, author, language, and publisher metadata where supplied.
- Reader controls body font sizing/line height.
- Relative-unit paragraph indentation/spacing.
- Fewer than 300 XHTML files.
- Individual XHTML sections remain below the KDP guard used by preflight.
- Unsupported DOCX images block release rather than being silently omitted.

## Preview Studio contract

- Defaults to color. E-ink grayscale is an explicit simulation toggle.
- Device/orientation/text-size/appearance controls are preview-only and never mutate EPUB presentation metadata.
- Read Mode contains no block-selection hooks.
- Adjust Layout is explicit and may add preview-only block-selection hooks.
- Formatting overrides are presentation metadata only. There is no manuscript text editor.
- Undo/Redo and reset-to-theme operate only on ebook presentation state.
- Preview-only classes/hooks must never appear in packaged EPUB output.

## Front-matter contract

- Word heading styles alone are not sufficient to invent ebook sections.
- Recognized title/copyright/dedication matter may receive clean ebook presentation.
- Print-layout line wraps may be visually reflowed while all source blocks and text remain retained.
- Likely placeholders (`CHAPTERS PAGE`, `TOC PAGE`, etc.) are warnings/errors, never silently deleted.

## Finished-package audit

The generated package is audited for title/creator metadata, single-cover packaging, chapter XHTML count, chapter navigation count, visible Contents in spine, Begin Reading landmark, and Preview Studio leakage.

## Final acceptance

YasReady preflight is not a substitute for Amazon conversion. Download the final KDP EPUB and inspect that exact file in Amazon Kindle Previewer before submission.
