# YasReady Publish v1.0.8

Private Story-Locked publishing studio for `Tres Amigos, Una Vida` and future YasReady publishing projects.

## Current production focus

Version 1.0.8 is **Kindle / eBook Preview Studio**. Paperback and hardcover remain parked while the Kindle experience is hardened end-to-end.

## Preview Studio

- Live cover preview as reading item 0 when a cover is attached.
- Front matter, visible linked Table of Contents, and every chapter in one reading-order rail.
- Click rendered blocks to inspect formatting without enabling manuscript text editing.
- Safe presentation overrides: spacing before/after, first-line indent, alignment, and suppress-indent.
- Reset individual overrides to the theme, or promote safe body/chapter formatting to the edition default.
- Presentation overrides are stored outside the locked content layer and flow into the final EPUB.

## iPhone / iPad proof

`Preview on iPhone / iPad` generates a self-contained, read-only HTML proof. On supported Macs it opens the Share Sheet so the proof can be AirDropped; otherwise the same proof downloads for manual transfer. The proof contains the cover, linked Contents, front matter, chapters, reader-size controls, and light/sepia/dark appearances.

Version 1.0.8 intentionally does **not** upload manuscript content to create a public preview URL. A true expiring link/QR flow will require a dedicated private preview backend so the static Story Lock build does not weaken its no-network-egress guarantee.

## Kindle workflow

1. Import the final DOCX and verify Story Lock.
2. Set book title / author metadata and attach the Kindle cover.
3. Inspect Cover → front matter → Table of Contents → early/middle/late chapters in Preview Studio.
4. Click any visual problem and correct presentation metadata only.
5. Open the device proof on an iPhone/iPad and read it like a customer.
6. Pass Kindle preflight.
7. Download the KDP EPUB.
8. Validate that exact EPUB in Kindle Previewer before uploading to KDP.

## Story Lock

Presentation can change. Manuscript wording cannot. Every source paragraph remains stored in source order and must survive EPUB packaging exactly once with identical text. Preview formatting controls never expose a content-editing field.

## Run locally

```bash
npm run verify
npm run dev
```

Then open `http://localhost:4173`.

## QA

`npm run verify` runs the automated test suite, static verification, and Superman audit. Release QA for 1.0.8: **107/107 tests passing**.
