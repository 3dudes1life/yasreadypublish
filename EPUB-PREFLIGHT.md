# YasReady Publish 0.9 — EPUB / Kindle Preflight

Version 0.9 retains a separate reflowable ebook engine. It consumes the same Story-Locked manuscript blocks as print but does **not** inherit fixed-page concepts such as gutters, folios, running headers, physical blank versos, or trim size.

## Export gate

EPUB export is blocked when:

- Story Lock does not match the canonical imported manuscript hash.
- Ebook source mapping does not include every source paragraph exactly once and in source order.
- No chapter starts were safely detected.
- Book title metadata is blank.
- The ebook language tag is invalid.
- DOCX image assets are present in 0.9, because image packaging is not yet implemented and Publish refuses to silently omit them.
- No reflowable sections or clickable navigation entries can be created.

Blank author metadata is a warning rather than fabricated metadata. Publish never invents an author name.

## EPUB package

The generated `.epub` contains:

- uncompressed root `mimetype`
- `META-INF/container.xml`
- EPUB 3 `OEBPS/package.opf`
- EPUB 3 navigation document `OEBPS/nav.xhtml`
- legacy `OEBPS/toc.ncx` for broad reader compatibility
- ebook-only CSS
- reading-order XHTML sections for front matter, chapters, and recognized back matter

The OPF embeds the canonical manuscript SHA-256 as YasReady metadata for auditability.

## Story Lock behavior

Ebook settings may change typography and reflow behavior only. They cannot change source text. Before packaging, the manuscript SHA-256 is recalculated. The section builder also checks that every imported source block appears exactly once, in the original order, with the exact same text.


## v0.9 structure repair

EPUB sectioning honors metadata-only Structure Repair overrides while source coverage continues to compare the effective reading order against the immutable source block IDs and exact source text. Word tables and manual Word page breaks are surfaced as warnings because reflowable EPUB does not preserve Word page geometry.
