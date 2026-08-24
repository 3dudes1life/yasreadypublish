# YasReady Publish v1.0.31

## Amazon Print Gate

1.0.31 binds the exact finished interior PDF, cover PDF, final page count, print-production settings, KDP handoff metadata, and manual proof state into one release token. YasReady now stops at **Ready for KDP Print Previewer** until the author confirms Amazon's own Print Previewer passed for that exact package. A physical proof can then be marked approved for YasReady proof certification. Kindle state from 1.0.30 is preserved during migration.

# YasReady Publish

**Current release: v1.0.30 — Cover Brain + Kindle E21018 Fix**

## v1.0.30 — Cover Brain + Kindle E21018 Fix

Version 1.0.30 uses the real Kindle Previewer conversion log from the Tres Amigos Book 2 test as a release input. The logged `E21018` failure pointed at `OEBPS/text/front-001.xhtml`; the production EPUB now contains no `display:none`, `visibility:hidden`, hidden attributes, or front-matter blank helper markup, and the finished-package audit blocks export if those patterns reappear. Preview Studio may still use private visual helpers because they are not packaged for Amazon.

Cover Brain v1 now sits on top of the frozen print interior. Paperback cover geometry is calculated from final page count + trim + ink + paper, reserves Amazon's barcode area, checks 300-DPI front artwork, enforces spine-text eligibility, and can build a one-page full-wrap cover PDF with the deterministic PDF engine. Hardcover uses Amazon's published wrap/hinge/safety geometry, but final production remains locked until the exact spine width from Amazon Cover Calculator is entered and explicitly confirmed; YasReady will not fabricate a manufacturing-critical formula Amazon does not publish.

## v1.0.29 — Print PDF Hard Mode

YasReady now owns the primary KDP print-interior PDF instead of delegating final production to Chrome/Safari Print → Save as PDF. After the frozen Paperback/Hardcover preflight passes, YasReady renders each physical page at 300 DPI, builds a PDF with exact physical MediaBox geometry, audits the finished byte stream, hashes the result, and downloads only after the PDF audit passes.

The finished-file audit verifies physical page count, exact trim/bleed page size, 300-DPI raster geometry, no encryption, no annotations/comments, no added trim/crop-mark boxes, the modeled 650 MB KDP ceiling, and a complete PDF trailer. Because each final page is baked into a print-resolution image, the PDF contains no live font objects and cannot suffer font substitution at KDP. The older HTML Print Master remains available under advanced export actions only as a visual/debug fallback.

## v1.0.28 — Print Brain + Actionable Kindle QA

YasReady now repairs the false Kindle chapter/navigation blockers exposed by Book Brain and starts the physical-book workflow with **Print Brain**. Kindle QA compares the finished EPUB against Book Brain’s effective structure instead of frozen parser counts, front/back-matter numbering no longer creates impossible list blockers, and real structural findings route to Book Brain or Structure Repair instead of rendering as dead red boxes.

Paperback and Hardcover now begin with the physical manufacturing choice—trim, ink, paper, and bleed—before advanced typography. YasReady models KDP page-range eligibility, all five current hardcover trim sizes, and page-count-driven safe margin floors while preserving roomier house-style margins. This is the Print Brain foundation; deterministic production-PDF generation remains the 1.0.29 target.

## v1.0.27 — Amazon Hard Mode

YasReady now audits the **finished EPUB package** against Kindle-specific production rules before calling a book ready for external testing. Normal prose no longer forces a body font, base size, line-height, color, background, or alignment; differentiated fiction elements use reflow-safe percentage side margins; generated XHTML is checked by actual packaged byte size and file count; hidden source text and unsafe positioning are blocked; and Kindle-bound images receive stricter dimension/format diagnostics.

New DOCX imports also preserve source hyperlinks and export simple Word lists as semantic `<ol>/<ul>` structures. Source tables are no longer silently flattened into a supposedly-ready Kindle file: they block export until a semantic table workflow exists or the author resolves them. All of this remains outside Story Lock source wording.

The release pipeline is deliberately honest: passing YasReady means **Ready for Kindle Previewer**, not “Amazon approved.” Kindle Previewer, Enhanced Typesetting, and KDP Online Preview are token-bound external confirmations for the exact EPUB build. Any source/design/cover/review change makes those confirmations stale.

## v1.0.25 — Book Brain · Smart eBook Interpretation

YasReady now interprets manuscript meaning instead of depending on perfect Word formatting. On DOCX import it identifies high-confidence chapter starts, title/copyright/dedication/contents boundaries, text conversations, scene breaks, subheads, notes/letters, and verse. High-confidence interpretation is applied automatically as Story-Lock-safe metadata; ambiguous items appear in a small review queue. Source wording, runs, order, notes, media, and canonical hashes are never rewritten.

PDF reconstruction is a future Book Brain input path; v1.0.25 intentionally keeps the production importer on DOCX while the semantic engine is hardened.


Private publishing studio for Story-Locked manuscripts.

Version 1.0.23 is the **Format-First Flow + Dedication Spacing** pass. New imports no longer assume paperback or Kindle: the first project decision is “What are you making?” and the author explicitly chooses Kindle, paperback, hardcover, or any combination. Tres Amigos dedication paragraphs now receive clear Book 1-style breathing room between semantic paragraphs. After a successful Kindle EPUB download, YasReady offers a direct continuation into Paperback or Hardcover without re-importing the manuscript. Version 1.0.22 is the **Book 1 Front Matter Match** pass. The private Tres Amigos Kindle theme now automatically gives the title page, copyright page, and dedication page the same semantic visual hierarchy as Book 1 while preserving every Story-Locked source word. Version 1.0.21 was the **Simple Metadata Restore** pass. Required Kindle metadata is visible again in Step 1: title, author, language, and publisher/imprint. The Kindle “Finish Metadata” action jumps directly to those fields. Version 1.0.20 was the **Tres Amigos Divider Hotfix + Bug Log** pass. It removes a stale legacy chapter-heading flourish from the private Tres Amigos house style without changing manuscript text, and adds a tiny browser-local Bug Log under Advanced Tools. Version 1.0.19 was the **Tres Amigos Kindle Match** pass. It keeps the 1.0.18 split chapter-number/title renderer and tunes the private Tres Amigos chapter-opening geometry against the real Book 1 Kindle reference: 8.0em top breathing room and 5.5em after the italic chapter title. Existing custom spacing is preserved.

Version 1.0.17 is the **simplification pass**. It keeps the full publishing engine from 1.0.12–1.0.16—Theme Studio, Kindle Intelligence, accessibility audits, production proofing, Release Gate, Story Lock, print controls, and EPUB validation—but stops putting all of that machinery in the author's face.

The default workflow is now four steps:

1. **Book** — import the finished manuscript and choose editions.
2. **Style** — choose a polished book look, with deeper customization only when wanted.
3. **Preview** — read the actual output and visually check the book.
4. **Export** — see a plain-language ready/not-ready status, fix safe issues, and download the finished edition.

Everything else lives behind **Advanced Tools**. No publishing capability was removed, and project schema 25 remains unchanged because this release changes UX rather than Story-Locked manuscript data.

## Story Lock remains the first rule

YasReady may change presentation. It may not rewrite manuscript language.

- Source paragraphs remain immutable.
- Content-style and layout choices are stored as edition presentation metadata by source block ID.
- Intentional-review decisions are QA metadata only; they never change source text or EPUB content.
- Scene-break ornaments may visually replace source marks in the exported EPUB; the exact locked source marks remain preserved in YasReady's canonical Story Lock model rather than being duplicated as hidden EPUB text.
- New DOCX imports use canonical Story Lock v2 so note wording and embedded-image fingerprints are protected alongside body paragraphs.
- Existing projects keep their original Story Lock algorithm and hash during migration.

## Theme Studio

Theme Studio sits inside the existing Kindle workspace and adds:

- eight coordinated book families, including the private **Tres Amigos** preset
- one-screen controls for chapter headings, first paragraphs, body rhythm, subheads, block quotes, written notes, verse, text conversations, scene breaks, and Contents
- visible **Theme style → Chapter override → Paragraph override** hierarchy
- optional chapter-heading and scene-break artwork packaged inside the EPUB
- transparent Word-style inference and remapping
- **Show me every place using this style** whole-book review
- **Book DNA** theme-adherence, semantic-feature, local-override, and outlier counts

Theme Studio is presentation metadata. It does not rewrite manuscript paragraphs, notes, media bytes, source order, or Story Lock hashes.

## Kindle Production Console

The top of the Kindle workspace now answers four questions immediately:

1. Is metadata complete?
2. Is the Kindle cover ready?
3. Is navigation valid?
4. Does Story Lock/source coverage pass?

It combines those setup checks with Kindle Pro quality and Kindle Intelligence results, then presents one **NEXT BEST ACTION** instead of making the author hunt through the page.

The **Polish Queue** merges whole-book quality and intelligence findings. Blocking errors can never be dismissed as intentional. Non-blocking review findings may be marked **Intentional** for that exact finding only; if its label/message/block/section/fingerprint changes later, it automatically returns to the active queue.

## Faster Preview Studio

Version 1.0.15 keeps the 1.0.14 three-pane production workbench:

**Reading Order | Live Book Preview | Format Inspector**

and adds:

- Reading Order search with **⌘K / Ctrl+K** jump focus
- **E** to toggle Read / Adjust mode when not typing
- **Option+Left / Option+Right** to move through reading order
- **N** to jump to the next unresolved polish item
- **Focus Preview** to temporarily hide the navigator and inspector
- persistent Previous / Next, Undo / Redo, and Next Issue controls above the preview
- section position indicator

## Quick polish without prose editing

When a source-backed block is selected in Adjust mode, the inspector shows the theme baseline and offers **Tighter / Theme / Airier** shortcuts before the fine controls.

These shortcuts alter edition-scoped spacing presentation only. They never write to source text, note text, media bytes, source order, or Story Lock hashes. Undo / Redo remains available.

## Kindle Intelligence

The whole-book intelligence layer still provides:

- chapter consistency map with per-chapter scores
- isolated chapter-heading/opening drift detection
- unusual local spacing, indent, and body-alignment detection
- orphan presentation-override detection
- rare Word-style fingerprints for source QA
- direct **Go there** navigation
- presentation-only safe fixes
- **Compare Chapters** for presentation fingerprints only

## Semantic Kindle content

Preview Studio can recognize or assign Subhead, Block Quote, Written Note / Letter, Verse / Poetry, Text Conversation, and Scene Break presentation. New DOCX imports can also preserve supported embedded images plus footnotes/endnotes under canonical Story Lock v2.

## Kindle Pro / package QA

The release pipeline retains:

- 11pt-equivalent preview reference without forcing EPUB body size
- Kindle / Phone / Tablet simulation
- 3-View Torture Test
- Enhanced Typesetting-oriented CSS checks
- finished EPUB autopsy
- visible linked Contents and Kindle Go To navigation
- single internal cover packaging
- package/nav/spine/Story Lock checks
- source-placeholder detection

**Run Final Check now includes Kindle Intelligence in the ebook release gate.** A green result still does not replace Amazon Kindle Previewer; final release requires opening the exact exported EPUB there.

## Existing projects

No reimport is required merely to update an existing project to 1.0.15. Migration creates the Theme Studio presentation container, invalidates stale ebook preflight status, and leaves manuscript blocks, notes, media, source order, canonical algorithm, and Story Lock hashes untouched.

A fresh import is required only when an older project needs DOCX footnotes/endnotes or embedded manuscript images that were never captured by its original importer.

## Local use

```bash
npm run verify
npm run dev
```

Then open `http://localhost:4173`.

`npm run verify` runs automated tests, static verification, and the Superman audit.


## v1.0.16 final Kindle production pass

The Kindle workspace now includes batch-safe presentation cleanup, exact-token batch review, finished-EPUB accessibility checks, a current visual-proof stamp, an invalidating Kindle Freeze token, and a downloadable release report. These features sit on top of the v1.0.15 Theme Studio and preserve Story Lock.
