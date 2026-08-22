# YasReady Publish v1.0.7

Private Story-Locked publishing studio for `Tres Amigos, Una Vida` and future YasReady publishing projects.

## Current production focus

Version 1.0.7 deliberately finishes **Kindle / eBook first**. The ebook workspace now targets one release file: a high-quality reflowable EPUB for Amazon KDP. Paperback and hardcover remain independent editions and can be re-enabled after the ebook is accepted.

## Kindle workflow

1. Import the final DOCX.
2. Verify Story Lock.
3. Set book title / author metadata.
4. Attach the Kindle front cover.
5. Save & Refresh Preview.
6. Inspect front matter, linked Contents, and chapter samples across the full book.
7. Pass Kindle preflight.
8. Download KDP EPUB.
9. Validate in Kindle Previewer and then upload to KDP.

## Story Lock

Presentation can change. Manuscript wording cannot. Every source paragraph is stored in order and must survive ebook packaging exactly once with identical text.

## Run locally

```bash
npm run verify
npm run dev
```

Then open `http://localhost:4173`.

## QA

`npm run verify` runs the automated test suite, static verification, and Superman audit.
