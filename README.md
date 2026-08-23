# YasReady Publish v1.0.14

Private publishing studio for Story-Locked manuscripts.

Version 1.0.14 is the **Kindle Production UX pass**. It keeps the semantic Kindle engine and whole-book intelligence from 1.0.12–1.0.13, then turns those systems into one guided production workflow: a Production Console, an exact next action, a reviewable Polish Queue, faster Preview Studio navigation, Focus Preview, and quick visual rhythm controls.

## Story Lock remains the first rule

YasReady may change presentation. It may not rewrite manuscript language.

- Source paragraphs remain immutable.
- Content-style and layout choices are stored as edition presentation metadata by source block ID.
- Intentional-review decisions are QA metadata only; they never change source text or EPUB content.
- Scene-break ornaments may visually replace source marks, but the locked source marks remain preserved in the EPUB source.
- New DOCX imports use canonical Story Lock v2 so note wording and embedded-image fingerprints are protected alongside body paragraphs.
- Existing projects keep their original Story Lock algorithm and hash during migration.

## Kindle Production Console

The top of the Kindle workspace now answers four questions immediately:

1. Is metadata complete?
2. Is the Kindle cover ready?
3. Is navigation valid?
4. Does Story Lock/source coverage pass?

It combines those setup checks with Kindle Pro quality and Kindle Intelligence results, then presents one **NEXT BEST ACTION** instead of making the author hunt through the page.

The **Polish Queue** merges whole-book quality and intelligence findings. Blocking errors can never be dismissed as intentional. Non-blocking review findings may be marked **Intentional** for that exact finding only; if its label/message/block/section/fingerprint changes later, it automatically returns to the active queue.

## Faster Preview Studio

Version 1.0.14 keeps the three-pane production workbench:

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

No reimport is required merely to update an existing project to 1.0.14. Migration creates the new Kindle review-state container, invalidates stale ebook preflight status, and leaves manuscript blocks and Story Lock hashes untouched.

A fresh import is required only when an older project needs DOCX footnotes/endnotes or embedded manuscript images that were never captured by its original importer.

## Local use

```bash
npm run verify
npm run dev
```

Then open `http://localhost:4173`.

`npm run verify` runs automated tests, static verification, and the Superman audit.
