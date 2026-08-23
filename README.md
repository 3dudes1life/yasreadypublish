# YasReady Publish v1.0.10

Private Story-Locked publishing studio for `Tres Amigos, Una Vida` and future YasReady publishing projects.

## Current production focus

Version 1.0.10 is the **Kindle finalization pass**. Paperback and hardcover remain available but are intentionally parked while the reflowable KDP EPUB is brought to release quality.

## Kindle Preview Studio

Preview Studio is now a publishing workbench rather than a long web page. The core workspace is:

**Reading Order | Live Book Preview | Format Inspector**

Each pane scrolls independently. The preview controls remain at the top, and `Open Preview Studio` jumps directly from setup to the working area.

The simulator uses the same section rendering and ebook stylesheet source as the EPUB package, but it does **not** claim to embed Amazon's proprietary Kindle Previewer. Amazon Kindle Previewer remains the final rendering authority before KDP submission.

### Reader simulation

- Kindle / Phone / Tablet device classes
- Portrait / Landscape
- Reader text-size simulation
- Light / Sepia / Dark
- Color by default
- Optional e-ink/grayscale simulation for Kindle device preview

Reader-simulation controls never change the final EPUB.

### Safe live formatting

`Read Mode` is the default and contains no selection hooks. `Adjust Layout` must be entered explicitly.

When adjusting, a paragraph or heading can be selected and presentation-only values can be changed live: spacing before/after, first-line indent, alignment, and indent suppression. Undo/Redo and reset-to-theme controls are provided.

There is **no manuscript text editor** in Preview Studio. Story wording remains immutable.

## Front matter

1.0.10 treats front matter as ebook presentation rather than blindly reproducing print line breaks. Copyright/legal lines can reflow into normal ebook paragraphs while every Story-Locked source block is retained. Generic Word heading styles no longer automatically split front matter into new reading items.

Likely source placeholders such as `CHAPTERS PAGE` are flagged and block final EPUB release. YasReady never silently removes those words; the master manuscript must be corrected deliberately and reimported.

## Finished EPUB audit

Before release, YasReady audits the generated package itself for:

- title and author metadata
- exactly one internal cover image and no duplicate cover XHTML
- chapter XHTML count and logical chapter navigation count
- visible linked Contents in the reading spine
- Begin Reading landmark
- Preview Studio-only CSS/classes/hooks leaking into production
- source placeholder warnings

Story Lock and exact source coverage remain separate mandatory gates.

## iPhone / iPad proof

`Preview on iPhone / iPad` creates a self-contained, read-only proof for Share Sheet/AirDrop or local download. No private web/QR upload service is included in this static build.

## Kindle release workflow

1. Import the final DOCX and verify Story Lock.
2. Set book metadata and attach the Kindle cover.
3. Open Preview Studio and proof cover, front matter, Contents, early/middle/late chapters.
4. Use Adjust Layout only where presentation needs correction.
5. Clear any source-placeholder warnings in the master DOCX and reimport if necessary.
6. Pass KDP preflight + finished EPUB audit.
7. Download the KDP EPUB.
8. Open that exact EPUB in Amazon Kindle Previewer before submission.

## Run locally

```bash
npm run verify
npm run dev
```

Then open `http://localhost:4173`.

## QA

`npm run verify` runs the automated test suite, static verification, and Superman audit. Release QA for 1.0.10: **119/119 tests passing**.
