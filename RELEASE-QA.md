# YasReady Publish v1.0.15 — Superman QA

**Automated release gate:** 164 automated tests passing + static verification + Superman audit.

## Release target

Turn the mature Kindle engine into a faster, clearer production workflow without weakening Story Lock, finished-EPUB checks, or the existing semantic/intelligence systems.

## Automated release gate

- 155 automated tests
- 155 pass
- 0 fail
- static verification PASS
- Superman audit PASS

## v1.0.15 regressions covered

Theme Studio release guards include:

- applying any of the eight theme families does not alter Story-Locked manuscript blocks
- Word-style remapping changes semantic presentation only
- chapter-specific heading overrides remain presentation-only
- custom scene-break artwork is packaged in EPUB while source break marks remain preserved
- Book DNA and style-usage scans are derived from semantic/presentation state and do not write into source
- legacy 1.0.14 Production Console and release gates remain present

- schema migrates to 24 / app 1.0.15 without changing manuscript blocks
- Kindle review decisions survive edition normalization
- non-blocking findings may be marked intentional for the **exact** current finding
- changed finding tokens automatically invalidate old intentional-review decisions
- blocking errors and informational notices cannot be marked intentional; only warning/review findings are eligible
- Production Flow prioritizes missing setup, then blockers, then review items, then final visual proof
- Polish Queue separates unresolved from acknowledged findings and never lets an acknowledged duplicate hide an unresolved finding
- production review workflow cannot mutate Story-Locked manuscript blocks
- Production Console / Polish Queue / Next Best Action controls are present
- Reading Order search, keyboard commands, Focus Preview, and inspector quick-polish controls are wired
- `Run Final Check` includes Kindle Intelligence in the ebook readiness gate
- button-audit parsing distinguishes literal button IDs from `data-*-id` attributes

## Existing Kindle regressions retained

The complete suite still covers Story Lock, exact source coverage/order, front-matter reflow, visible/logical TOC, single-cover packaging, EPUB container integrity, Preview Studio Read/Adjust isolation, live layout overrides, Undo/Redo, 3-View Torture Test, Enhanced Typesetting-oriented CSS checks, semantic fiction roles, footnotes/endnotes, inline images, media fingerprints, accessibility review, whole-book chapter anomaly mapping, chapter comparison, safe presentation fixes, print-proof ownership, edition invalidation, and fixed-page print safety.

## Superman static audit

- all application JS syntax/imports resolve
- literal button IDs must have bindings
- dynamic control families must have bindings
- no application source may contain `fetch`, `XMLHttpRequest`, `WebSocket`, or `sendBeacon` manuscript-egress pathways
- Production Flow, review-decision safeguards, finished EPUB audit, and Final Check intelligence markers must exist

## Manual acceptance still required

Automated tests cannot replace a black-box pass with the real production manuscript. Before freezing Kindle:

1. inspect the Production Console and Polish Queue
2. mark/unmark one non-blocking finding as intentional
3. jump to an issue and verify the correct chapter/block is selected
4. use ⌘K search and keyboard navigation
5. use Tighter / Theme / Airier on one selected paragraph, then Undo/Redo/Reset
6. verify Focus Preview returns cleanly to the workbench
7. run the 3-View Torture Test on early/middle/late chapters
8. export the exact EPUB and open it in Amazon Kindle Previewer
