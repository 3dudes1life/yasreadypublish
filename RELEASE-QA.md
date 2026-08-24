# YasReady Publish v1.0.26 — Kindle Previewer Compatibility QA

**Automated release gate:** 208 automated tests passing + static verification + Superman audit.

## Release target

Produce a Kindle-bound EPUB whose package structure follows the compatibility rules YasReady can verify before the author performs the final external test in Amazon Kindle Previewer. Generic EPUB validity alone is not considered sufficient.

## Automated release gate

- 208 automated tests
- 208 pass
- 0 fail
- static verification PASS
- Superman audit PASS
- ZIP/XML compatibility audit PASS

## v1.0.26 regressions covered

- `mimetype` remains the first stored/uncompressed ZIP entry
- logical `nav.xhtml` is not placed in the reading-order spine
- visible `text/contents.xhtml` is a separate spine item
- navigation files contain no hidden/display-none TOC markup
- OPF guide contains Contents and Begin Reading targets
- cover metadata uses EPUB 3 cover-image declaration plus legacy Kindle cover metadata when a cover exists
- publishable OPF contains no private `yasready:` Story Lock/source-file metadata
- Kindle-bound image preflight allows JPEG/PNG and blocks unsupported image types
- all XML/XHTML/OPF/NCX files parse successfully in the package audit
- migration to 1.0.26 leaves Story Lock source content unchanged

## v1.0.17 regressions covered

- migration from 1.0.16 remains on schema 25 and keeps Story-Locked manuscript blocks byte-identical
- four Simple Mode steps are present and ordered Book → Style → Preview → Export
- Advanced Tools remains available without occupying the default workflow
- Theme Studio is collapsed by default
- legacy Theme Studio, Kindle Intelligence, Release Gate, accessibility, semantic, preview, print, and export systems remain present underneath Simple Mode
- missing simplified-form controls fall back to the persisted ebook design instead of erasing advanced settings
- Story Lock, exact source coverage/order, media/note fingerprints, and edition invalidation remain enforced
- finished EPUB audit, KDP preflight, accessibility audit, release proof token, and freeze invalidation remain unchanged

## Superman static audit

- all application JS syntax/imports resolve
- literal button IDs must have bindings
- dynamic control families must have bindings
- no application source may contain `fetch`, `XMLHttpRequest`, `WebSocket`, or `sendBeacon` manuscript-egress pathways
- Simple Mode markers and hidden advanced production systems must both remain present

## Manual acceptance before a production freeze

1. export the exact production EPUB from YasReady
2. drag/open that EPUB in Amazon Kindle Previewer 3 on macOS
3. confirm Kindle Previewer converts it without an internal conversion error
4. inspect title/copyright/dedication, Contents navigation, first/middle/last chapters, text conversations, scene breaks, and cover
5. inspect Kindle Previewer's Conversion Log for warnings before KDP submission

## v1.0.23 format-first flow + dedication spacing

- Import a new DOCX and confirm Kindle, Paperback, and Hardcover all begin unselected.
- Select only Kindle and confirm print controls stay out of the normal four-step flow.
- Open the Tres Amigos dedication page and confirm each semantic paragraph has obvious breathing room.
- Export a ready Kindle EPUB and confirm the Export step offers Continue with Paperback and Continue with Hardcover.
- Confirm an existing 1.0.22 project keeps its previously saved edition selections.

## v1.0.22 Book 1 front matter match
- Confirm Tres Amigos title page uses spaced uppercase title hierarchy and generous vertical position.
- Confirm copyright first line is not rendered as an oversized heading.
- Confirm dedication is centered/italic with no forced bold heading.
- Confirm switching to a non-Tres-Amigos theme leaves generic clean front matter intact.
- Confirm source block JSON remains byte-identical through migration/export.
