# YasReady Publish v1.0.32 Release QA

- Run `npm run verify`; **239 automated tests must pass**, followed by static verification and Superman audit.
- Reproduce a trailing Heading-1-style `BOOK TWO` author page and confirm it remains back matter rather than becoming an extra chapter.
- Confirm both supported orderings—About the Authors → Join the Journey and Join the Journey → About the Authors—produce separate semantic back-matter sections.
- Confirm a missing About-the-Authors source heading is supplied only as generated presentation; Story Lock manuscript blocks remain byte-identical through migration.
- Confirm author-bio and Join-the-Journey source paragraphs remain separate XHTML paragraphs and preserve inline bold/italic/link runs.
- Confirm production EPUB CSS/XHTML contain no `display:none`, `visibility:hidden`, hidden attributes, or hidden source-marker helpers.
- Confirm a package hidden-content finding exposes **Rebuild package** and a rebuild clears/recalculates the current package audit rather than leaving a dead error.
- Confirm migration from 1.0.31 reanalyzes Book Brain and invalidates stale Kindle visual/Previewer confirmations because rendered EPUB output changed, while preserving Story Lock and the Amazon Print Gate.
- Export the real Book 2 EPUB and test the exact file in Kindle Previewer; external Amazon conversion remains the authoritative final confirmation.

# YasReady Publish v1.0.31 Release QA

Amazon Print Gate requires: current KDP print preflight, current audited interior PDF, current audited cover PDF built for the same final page count/proof, valid KDP handoff metadata, a manual YasReady visual proof, then a locked release token. Only then can the author confirm KDP Print Previewer. Physical-proof approval is tracked separately as the final recommended proof-certification step.

# YasReady Publish 1.0.30 Release QA

- Run `npm run verify`; **230 automated tests must pass**.
- Reproduce the Kindle package path that previously failed with `E21018` and confirm `OEBPS/text/front-001.xhtml` still contains the visible title while the production CSS/XHTML contains no `display:none`, `visibility:hidden`, hidden attributes, or `matter-source-blank` helpers.
- Confirm the finished EPUB audit reports `audit-amazon-no-hidden-css` PASS.
- Export a fresh Book 2 EPUB and test that exact file in Kindle Previewer; only the external app can confirm Amazon conversion success.
- Confirm migrating a pre-1.0.30 project invalidates stale Kindle Previewer / Enhanced Typesetting confirmations, while reopening an already-current 1.0.30 project preserves them.
- For a 200-page 6×9 cream-paper paperback, confirm Cover Brain computes a 0.5000-inch spine and 12.7500 × 9.2500-inch full cover.
- Confirm paperback spine text is blocked at 79 pages and allowed at 80 pages.
- Confirm Amazon barcode mode reserves a 2 × 1.2-inch clear zone on the back cover.
- Confirm Kindle cover reuse and uploaded JPEG/PNG front artwork are checked for effective 300-DPI print resolution.
- Confirm Hardcover shows only an estimated planning spine until the exact Amazon Cover Calculator spine width is entered and confirmed; production cover PDF must stay locked before confirmation.
- Confirm print proof/design invalidation clears the remembered Cover PDF audit without altering Story Lock manuscript data.

# YasReady Publish 1.0.29 Release QA

- Run `npm run verify`; 224 automated tests must pass.
- Confirm the primary Paperback/Hardcover export button says **Build … PDF** and does not open a browser print dialog.
- Confirm Print PDF Hard Mode renders at 300 DPI and downloads only after the finished-byte audit passes.
- Confirm a generated sample PDF reports the exact 6 × 9 MediaBox as 432 × 648 points, is unencrypted, and contains the expected physical page count in an independent PDF parser.
- Confirm the finished audit checks page count, MediaBox dimensions, 300-DPI image geometry, encryption, annotations, extra page boxes, file size, and EOF closure.
- Confirm changing print design/production/pagination invalidates `lastPdfAudit`.
- Confirm migration from 1.0.28 clears stale pre-Hard-Mode PDF audit state without changing Story Lock manuscript data.
- Keep **Open Print Master / Download HTML Master** as advanced fallback/debug actions only.

# YasReady Publish 1.0.28 Release QA

- Run `npm run verify`.
- Confirm a migrated 1.0.27 project preserves Story Lock text and reanalyzes Book Brain chapter boundaries.
- Confirm Kindle QA has no false 55/56 chapter mismatch when effective EPUB structure is consistent.
- Confirm front/back-matter numbering does not create a fake nested-list blocker.
- Confirm Paperback and Hardcover enter Print Brain before advanced Design until manufacturing setup is saved.
- Confirm 6×9 black/cream/no-bleed recommendation and all five hardcover trims are available.
- Confirm print preflight uses exact selected ink/paper/trim page-range rules and page-count gutter floors.

# YasReady Publish v1.0.27 — Kindle Previewer Compatibility QA

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

## v1.0.27 regressions covered

- `mimetype` remains the first stored/uncompressed ZIP entry
- logical `nav.xhtml` is not placed in the reading-order spine
- visible `text/contents.xhtml` is a separate spine item
- navigation files contain no hidden/display-none TOC markup
- OPF guide contains Contents and Begin Reading targets
- cover metadata uses EPUB 3 cover-image declaration plus legacy Kindle cover metadata when a cover exists
- publishable OPF contains no private `yasready:` Story Lock/source-file metadata
- Kindle-bound image preflight allows JPEG/PNG and blocks unsupported image types
- all XML/XHTML/OPF/NCX files parse successfully in the package audit
- migration to 1.0.27 leaves Story Lock source content unchanged

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
