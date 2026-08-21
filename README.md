# YasReady Publish v0.9.0

Private, Story-Locked book production software being built toward a Vellum-quality YasReady Publish 1.0.

## What v0.9 adds

Version 0.9 hardens the print workflow around a long-form commercial novel while keeping manuscript text immutable.

- Automatic **print Table of Contents** generated from the final printed page map
- Book 1-style `Table of Contents` title, dot leaders, chapter page numbers, and optional recognized back matter entries
- Multi-pass pagination: page numbers are calculated, the generated TOC is inserted before Chapter 1, then the final map is verified again
- TOC integrity gate that blocks export if any generated page number is stale
- Safe detection of a manual/source Table of Contents; YasReady will not duplicate it or silently remove it
- New **Structure Repair** workspace for metadata-only paragraph reclassification
- Manual repair options for chapter title, body, scene break, text message, front/back heading, heading, and blank paragraph
- Structure overrides never modify source text, paragraph order, punctuation, capitalization, or Story Lock hashes
- Print and EPUB engines both honor the repaired structural metadata while consuming the same source wording
- DOCX edge-case metadata for Word tables, fields, hyperlinks, manual page breaks, images, footnotes, and endnotes
- Footnote/endnote import is blocked rather than silently omitting note text
- KDP preflight now checks generated TOC integrity, unexpected empty pages, Word tables, Word fields, and manual Word page breaks
- EPUB preflight reports structure repair metadata and Word-layout edge cases
- Project schema migrated to 9 / app version 0.9.0 without changing manuscript hashes

## Story Lock remains rule #1

The imported DOCX is canonical. YasReady may change **presentation and structure metadata**, but not the wording.

Structure Repair is intentionally not a manuscript editor. Selecting “Chapter title” for a paragraph changes only how that exact paragraph is interpreted by the layout engines. The paragraph text itself stays in the original `project.manuscript.blocks` array, and Story Lock continues hashing the untouched source layer.

Generated Table of Contents pages are also outside the source layer. They are generated book furniture, like page numbers and running headers.

## Print Table of Contents workflow

1. Import the final DOCX.
2. Open **Design** and leave **Generate print Table of Contents** enabled.
3. If YasReady detects a manual/source TOC, it will not generate a duplicate. Remove the manual TOC from the master DOCX and re-import if you want automatic page numbers.
4. Build **Print Preview**.
5. YasReady first paginates the locked manuscript, calculates chapter/back-matter printed page numbers, inserts the generated TOC before Chapter 1, and re-paginates.
6. The TOC integrity gate verifies every generated entry against the final page map.
7. KDP Export stays blocked if the generated TOC and final pagination disagree.

For the Tres Amigos Series theme, recognized back matter such as **About the Authors** and **Join the Journey** is included in the generated print TOC, matching the Book 1 production pattern.

## Structure Repair workflow

Use **Structure Repair** when Word styles or unusual chapter naming cause a paragraph to be misclassified.

- Search for the exact paragraph.
- Choose a structural label.
- YasReady saves only `{ paragraph id → structure kind }` metadata.
- Print Preview and EPUB are invalidated and rebuilt from the same locked text.
- Clear the override at any time to return to source detection.

No text-editing field exists in Structure Repair.

## Two output engines

### Paperback / KDP

- fixed trim size and mirrored margins
- binding gutter
- right-hand/odd chapter openings
- intentional blank versos
- page numbers and optional running headers
- generated print Table of Contents with final page numbers
- KDP preflight
- fixed single-page Print Master for Save as PDF

### EPUB / Kindle

- reflowable XHTML
- clickable EPUB Contents (`nav.xhtml` + `toc.ncx`)
- no fixed trim, gutter, print folios, running headers, or print blank versos
- chapter/scene/message structure from the same Story-Locked source
- EPUB preflight and direct `.epub` download

## Edge-case safety in v0.9

YasReady prefers stopping or warning over guessing.

- tracked changes: import blocked
- footnotes/endnotes: import blocked until note handling is implemented
- images: print/EPUB export blocked in the current text-first engine
- Word tables: text preserved, grid-layout warning shown
- manual Word page breaks: warning shown because YasReady repaginates from book rules
- Word fields: warning shown because dynamic Word fields are flattened to visible text

## Run locally

```bash
npm run verify
npm run dev
```

Open `http://localhost:4173`.

No `npm install` is required for the current static build.

## GitHub Pages

The project uses relative static paths and can be hosted at:

`https://3dudes1life.github.io/yasreadypublish/`

## Roadmap

- **0.9** automatic print TOC + safe structure repair + edge-case hardening
- **1.0** private publisher-grade release: final visual calibration, production QA, PDF/EPUB release workflow, and Book 2 acceptance testing
