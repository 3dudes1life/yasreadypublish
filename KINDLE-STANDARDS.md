# YasReady Publish 1.0.9 — Kindle / KDP Standards

This release targets one ebook output: a reflowable EPUB for Amazon KDP / Kindle.

## Amazon source-of-truth behavior

Amazon's Kindle Previewer is a standalone desktop application. Amazon also provides an Online Previewer in KDP. Amazon documents preview controls for device type, orientation, font, and text size, with E-reader mode shown in grayscale and phone/tablet modes shown in color. Kindle Create additionally recommends checking multiple reader background appearances. There is no official embeddable Kindle Previewer SDK/template included in this project.

YasReady therefore uses a high-fidelity **working simulator**, not a claim of pixel-identical Amazon rendering. The final acceptance file must still be opened in Amazon Kindle Previewer.

Official references:
- https://kdp.amazon.com/en_US/help/topic/G202131170
- https://kdp.amazon.com/en_US/help/topic/G200641240
- https://kdp.amazon.com/en_US/help/topic/GRVZMSZ2THRTR5V9

## KDP rules enforced by YasReady

- EPUB 3 reflowable package.
- Exact Story Lock verification immediately before export.
- Every source paragraph maps exactly once and in source order.
- Working logical Table of Contents for detected chapters.
- Visible linked Contents page immediately before Chapter 1.
- EPUB landmarks identify Contents and Begin Reading.
- No fixed print page numbers in ebook Contents.
- One internal cover image packaged as `cover-image`; no duplicate HTML cover page.
- Title, author, and language metadata required.
- Body font size / line height remain reader-controlled in final EPUB.
- Relative-unit paragraph indentation/spacing only.
- Fewer than 300 XHTML files.
- Individual source sections stay below Amazon's 30 MB HTML-file limit.
- Unsupported DOCX images block export rather than being silently omitted.

## Simulator contract

- Simulator uses the same section rendering and stylesheet source as EPUB packaging.
- Device, orientation, reader font, text size, and appearance are preview-only controls.
- E-reader simulator converts artwork to grayscale for preview only.
- Read Mode contains no block-inspection markers.
- Adjust Layout may add preview-only selection markers, but those markers must never appear in packaged EPUB XHTML.
- Cover preview is synthetic and must never create a duplicate XHTML cover file.

## Final acceptance

YasReady preflight is not a substitute for Amazon conversion. Download the final KDP EPUB and inspect that exact file in Kindle Previewer on e-reader, phone, and tablet views before submission.
