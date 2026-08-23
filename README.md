# YasReady Publish v1.0.12

Private publishing studio for Story-Locked manuscripts.

Version 1.0.12 is the **Kindle semantic feature-parity pass**. It keeps the stable Kindle Pro preview/QA engine from 1.0.11 and adds fiction-specific semantic styling, safe DOCX note/image import, and stronger Story Lock coverage for newly imported manuscripts.

## Story Lock remains the first rule

YasReady may change presentation. It may not rewrite manuscript language.

- Source paragraphs remain immutable.
- Content-style choices are stored as edition presentation metadata by source block ID.
- Scene-break ornaments may visually replace source marks, but the locked source marks remain preserved in the EPUB source.
- New DOCX imports use canonical Story Lock v2 so note wording and embedded-image fingerprints are protected alongside body paragraphs.
- Existing projects keep their original Story Lock algorithm and hash during migration.

## Kindle semantic styles

Preview Studio can now recognize or assign:

- Subhead
- Block Quote
- Written Note / Letter
- Verse / Poetry
- Text Conversation
- Scene Break

The **Semantic Style Palette** controls the book-wide presentation of these elements. In **Adjust Layout**, select a block and use **Content style** to override its role without editing its words.

Word style names are treated as detection hints, not permission to rewrite content. Manual semantic overrides are presentation-only.

## Inline images

New DOCX imports can preserve embedded manuscript images and package them inside the Kindle EPUB. Image placement remains tied to its source paragraph. YasReady checks:

- image asset/reference resolution
- Kindle-safe image MIME types
- EPUB manifest/package coverage
- source alt text when available

Meaningful images without alt text are surfaced as accessibility warnings rather than silently altered.

## Footnotes and endnotes

New DOCX imports can preserve footnotes and endnotes. Note text is included in Story Lock v2 and rendered with linked EPUB `noteref` / footnote/endnote semantics. Unresolved references block import or release rather than dropping note text.

## Kindle Pro remains active

1.0.12 retains:

- 11pt-equivalent preview calibration without forcing EPUB body size
- Kindle / Phone / Tablet simulation
- 3-View Torture Test
- whole-book consistency scan
- Enhanced Typesetting-oriented CSS checks
- finished EPUB autopsy
- visible linked Contents and Kindle Go To navigation
- single internal cover packaging
- Preview Studio Read / Adjust modes
- Undo / Redo / Reset for presentation overrides

## Existing Book 2 projects

You do **not** need to reimport an existing project merely to use semantic Content styles or the new Style Palette.

A reimport is required only when you want YasReady to extract **footnotes/endnotes or embedded manuscript images** from the DOCX, because older project files never stored those assets. Reimporting creates a new canonical v2 Story Lock fingerprint; migration alone never changes the old fingerprint.

## Final validation

YasReady is not Amazon's rendering engine. Final Kindle release remains:

1. Story Lock passes
2. Kindle Pro scan passes
3. KDP EPUB preflight passes
4. Finished EPUB audit passes
5. Download the EPUB
6. Open that exact EPUB in Amazon Kindle Previewer

## Local use

```bash
npm run verify
npm run dev
```

Then open `http://localhost:4173`.

`npm run verify` runs automated tests, static verification, and the Superman audit.
