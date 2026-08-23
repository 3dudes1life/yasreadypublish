# YasReady Publish

**Current release: v1.0.20 — Tres Amigos Divider Hotfix + Bug Log**

Private publishing studio for Story-Locked manuscripts.

Version 1.0.20 is the **Tres Amigos Divider Hotfix + Bug Log** pass. It removes a stale legacy chapter-heading flourish from the private Tres Amigos house style without changing manuscript text, and adds a tiny browser-local Bug Log under Advanced Tools. Version 1.0.19 was the **Tres Amigos Kindle Match** pass. It keeps the 1.0.18 split chapter-number/title renderer and tunes the private Tres Amigos chapter-opening geometry against the real Book 1 Kindle reference: 8.0em top breathing room and 5.5em after the italic chapter title. Existing custom spacing is preserved.

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
- Scene-break ornaments may visually replace source marks, but the locked source marks remain preserved in the EPUB source.
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
