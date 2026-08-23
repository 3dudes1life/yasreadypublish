# YasReady Publish v1.0.13 — Superman QA

## Release target

Kindle Intelligence adds whole-book presentation analysis without weakening Story Lock or destabilizing the working EPUB/Preview Studio path.

## Automated release gate

- 146 automated tests
- 146 pass
- 0 fail
- static verification PASS
- Superman audit PASS

## v1.0.13 regressions covered

- chapter consistency map covers every chapter
- isolated chapter-title formatting drift is detected
- chapter-opening presentation drift is detected
- unusual body spacing/alignment/indent overrides are surfaced
- orphan ebook presentation overrides are detected
- safe fixes change presentation metadata only
- safe layout fixes preserve an intentional semantic Content style
- chapter comparison scores matching formatting at 100%
- chapter comparison reports presentation drift without comparing story prose
- migration advances to schema 22 / app 1.0.13 without changing manuscript blocks
- UI exposes Kindle Intelligence, direct issue navigation, safe fixes, and Compare Chapters

## Existing Kindle regressions retained

The complete suite still covers Story Lock, source coverage/order, front-matter reflow, visible/logical TOC, single-cover packaging, EPUB package integrity, Kindle Preview Studio, Read/Adjust isolation, Undo/Redo, 3-View Torture Test, Enhanced Typesetting-oriented CSS checks, semantic fiction roles, footnotes/endnotes, inline images, media fingerprints, accessibility review, print-proof ownership, edition invalidation, and fixed-page print safety.

## Privacy / source safety

Application source contains no `fetch`, `XMLHttpRequest`, `WebSocket`, or `sendBeacon` manuscript-egress path. Kindle Intelligence is local analysis. No safe fix can modify manuscript wording, note wording, or embedded-media bytes.

## Manual acceptance still required

Automated tests cannot replace black-box inspection of the real Book 2 project. Before freezing Kindle, visually inspect early/middle/late chapters, exercise at least one safe fix + Undo, compare two chapters, export the exact EPUB, and open that EPUB in Amazon Kindle Previewer.
