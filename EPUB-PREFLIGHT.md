# YasReady Publish 1.0.6 — Universal EPUB Preflight

Version 1.0.6 is the ebook-first acceptance build. Print editions can be parked while the reflowable EPUB is completed.

## Blocking export checks

Universal EPUB export is blocked when any of the following is true:

- Story Lock no longer matches the canonical imported manuscript hash.
- Ebook source mapping does not include every source paragraph exactly once, in source order, with identical text.
- Chapter navigation is incomplete.
- The visible linked Table of Contents is disabled.
- Book title metadata is blank.
- Language metadata is invalid.
- An internal JPEG/PNG ebook cover has not been attached.
- The internal cover exceeds Apple Books’ 5.6-million-pixel interior-image limit.
- The cover short side is below Google Play Books’ 640px minimum.
- DOCX image assets are present but unsupported by the current manuscript-image packager; export fails closed rather than silently omitting them.

A cover short side below 1400px is currently a quality warning rather than a universal hard failure.

## Navigation package

The generated EPUB contains:

- EPUB 3 `nav.xhtml` with `<nav epub:type="toc">`
- the same navigation document in the OPF manifest as `properties="nav"`
- the visible navigation document inserted in the **spine immediately before Chapter 1**
- hidden landmarks pointing to the Table of Contents and the first chapter / Begin Reading location
- legacy `toc.ncx` for broad/older reader compatibility
- chapter links with no fixed page numbers

For novels, the default visible/logical TOC includes chapters only. `Chapters + front/back headings` remains available for books that need it.

## Front matter

`Clean ebook layout` is the default. It:

- preserves every source word, punctuation mark, run, block ID, and order
- preserves headings and emphasis
- collapses print-only blank source paragraphs visually
- avoids carrying printed-page positioning into a reflowable reader

The blank source blocks still exist in Story Lock/source coverage; only their ebook presentation height changes.

`Use bounded source spacing` is optional. New DOCX imports capture paragraph alignment/spacing metadata to support that mode without trusting unbounded Word page geometry.

## Cover package

The attached front cover is stored as ebook-edition artwork outside Story Lock and included in the EPUB manifest with `properties="cover-image"`. YasReady deliberately does **not** generate an additional HTML cover page, preventing duplicate-cover behavior on Kindle.

## Store readiness cards

The app currently evaluates a common universal EPUB against five major delivery targets:

- **Amazon Kindle** — logical TOC, visible linked TOC, landmarks, reflowable text, internal cover.
- **Apple Books** — EPUB navigation, metadata, reflowable spine, cover-image packaging, 5.6M-pixel interior-image ceiling.
- **Kobo Writing Life** — reflowable content, built-in chapter navigation, linked Contents page, validation-oriented structure.
- **Google Play Books** — EPUB navigation and embedded front cover, with 640px minimum short-side cover check.
- **B&N NOOK** — NCX compatibility, linked Contents, OPF manifest/spine, reflowable XHTML, cover metadata.

Passing a card means YasReady’s structural checks for that retailer are green; it does not replace the retailer’s own ingestion/preview validation.

## Final commercial acceptance

Before upload, use the final EPUB in actual reader tooling and verify:

1. Copyright/front matter
2. Dedication
3. visible Table of Contents
4. every TOC link
5. reader/menu TOC
6. Chapter 1
7. a formerly problematic early chapter such as Chapter 5
8. a middle chapter
9. final chapter
10. cover rendering
11. smart quotes/dashes/special characters
12. text-message styling
13. scene breaks
14. font-size changes and device rotation where available

The recommended external validator is the current EPUBCheck release.
