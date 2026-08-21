# YasReady Publish 1.0 — EPUB / Kindle Preflight

YasReady Publish 1.0 keeps print and ebook as separate presentation engines over the same Story-Locked source. EPUB does **not** inherit fixed-page concepts such as trim size, gutters, folios, running headers, or intentional blank versos.

## Export gate

EPUB export is blocked when:

- Story Lock does not match the canonical imported manuscript hash.
- Ebook source mapping does not include every source paragraph exactly once and in original source order.
- No chapter starts were safely detected.
- Book title metadata is blank.
- The ebook language tag is invalid.
- DOCX image assets are present, because image packaging is not yet silently approximated.
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

The OPF embeds the canonical manuscript SHA-256 as YasReady audit metadata.

## Story Lock behavior

Ebook settings can change typography and reflow behavior only. Immediately before packaging, the canonical manuscript SHA-256 is recalculated. The section builder then verifies that every imported source block appears exactly once, in the original order, with the exact same text.

Metadata-only Structure Repair may change the structural role of a source block without changing its wording, runs, ID, order, or hash input. Word tables and manual Word page breaks are surfaced for review because a reflowable ebook does not preserve Word page geometry.

## 1.0 Final Check

The Project Home Final Check evaluates the EPUB gate alongside paperback production. “Superman Ready” requires both engines to pass their software checks. A final device/Kindle Previewer review remains part of commercial acceptance.
