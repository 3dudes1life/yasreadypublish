# YasReady Publish v1.0.9

Private Story-Locked publishing studio for `Tres Amigos, Una Vida` and future YasReady publishing projects.

## Current production focus

Version 1.0.9 is **Kindle Preview Studio hardening**. Paperback and hardcover remain parked while the Kindle/eBook path is finished first.

## Kindle Preview Studio

YasReady does not pretend to be Amazon's proprietary Kindle renderer. Amazon provides Kindle Previewer as a standalone app, not an embeddable SDK/template. YasReady therefore uses the **same XHTML/CSS that is packaged into the final EPUB** inside a high-fidelity working simulator, then requires the final EPUB to be checked in Amazon Kindle Previewer before submission.

The simulator now includes the same categories of controls Amazon documents for Kindle Previewer:

- Kindle E-reader, Phone, and Tablet device classes.
- Portrait / landscape orientation.
- Reader Serif / Reader Sans preview faces.
- Five reader text-size previews.
- White, Sepia, Mint, and Black reading appearances.
- E-reader artwork is previewed in grayscale; phone/tablet artwork remains color.
- The attached cover is fitted inside the simulated device viewport instead of appearing as an oversized web image.

## Read Mode vs Adjust Layout

**Read Mode** is the default. The book behaves like a reader proof: no hover boxes, no formatting selection, and no accidental layout edits.

**Adjust Layout** is explicit. Only then do source blocks become selectable. Clicking a paragraph updates the Format Inspector **without rebuilding the entire preview iframe**, so selection no longer jumps or feels like broken text highlighting.

Allowed adjustments remain presentation-only: spacing before/after, first-line indent, alignment, and indent suppression. There is still no manuscript text editor. Individual fixes can be reset, promoted to safe edition defaults, or all cleared back to the Tres Amigos ebook theme.

## Cover + EPUB truth

The cover appears as preview item 0 in the working simulator but is not added as a duplicate XHTML cover page. The final EPUB still packages one internal `cover-image` asset only.

## iPhone / iPad proof

`Preview on iPhone / iPad` creates a self-contained, read-only proof that can be shared through the Mac Share Sheet/AirDrop or downloaded for transfer. No manuscript content is uploaded by YasReady in this static build.

## Kindle workflow

1. Import final DOCX and verify Story Lock.
2. Set title/author metadata and attach the Kindle cover.
3. Use Read Mode across Cover → front matter → Contents → early/middle/late chapters.
4. If something looks wrong, switch to Adjust Layout and make presentation-only corrections.
5. Test E-reader / Phone / Tablet, portrait/landscape, multiple text sizes, and white/sepia/mint/black appearances.
6. Open the device proof on iPhone/iPad.
7. Pass Kindle preflight and download the KDP EPUB.
8. Open that exact EPUB in Amazon Kindle Previewer for the final Enhanced Typesetting check.

## Story Lock

Presentation can change. Manuscript wording cannot. Every source paragraph remains stored in source order and must survive EPUB packaging exactly once with identical text.

## Run locally

```bash
npm run verify
npm run dev
```

Then open `http://localhost:4173`.

## QA

`npm run verify` runs the automated test suite, static verification, and Superman audit. Release QA for 1.0.9: **111/111 tests passing**.
