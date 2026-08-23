# YasReady Publish v1.0.17 — Superman QA

**Automated release gate:** 173 automated tests passing + static verification + Superman audit.

## Release target

Make the mature publishing engine feel obvious to a first-time author without deleting or weakening any advanced production capability. Default UX is **Book → Style → Preview → Export**; expert systems remain behind **Advanced Tools**.

## Automated release gate

- 173 automated tests
- 173 pass
- 0 fail
- static verification PASS
- Superman audit PASS

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

1. import the real production DOCX and confirm the four-step workflow feels obvious
2. choose a theme from Style and verify the preview changes without source-text changes
3. read early, middle, and late sections in Preview
4. confirm Export reports issues in plain language and safe fixes behave correctly
5. open Advanced Tools once and verify the production diagnostics are still available
6. export the exact EPUB and inspect it in Amazon Kindle Previewer before KDP submission

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
