# YasReady Publish v0.6.0

Private, story-safe book production software being built toward a Vellum-quality YasReady Publish 1.0.

## What v0.6 adds

- Reusable print **Theme Library**
- Three built-in starting themes:
  - **Tres Amigos Series · Book 1**
  - **Classic Novel**
  - **Modern Romance**
- Save the current design as a private reusable house style
- Export private themes as `.yasready-theme.json`
- Import theme JSON files back into Publish
- Delete private themes without affecting any manuscript
- Book 1 **Calibration Inspector** showing which presentation settings differ from the saved series reference
- More precise design controls for:
  - body alignment
  - chapter-title alignment
  - page-number bottom offset
  - page-number outside inset
  - running-header top/outside offsets
- Existing 0.5 long-book navigator, whole-book matter mapping, mirrored pagination, right-hand chapter starts, and Story Lock remain intact

## Story Lock remains the first rule

Themes contain **presentation metadata only**. They do not contain manuscript paragraphs, dialogue, messages, or story content.

The imported DOCX remains the canonical source. Before pagination, the manuscript hash is rechecked. After pagination, every source paragraph is reconstructed from page fragments and compared character-for-character with the locked source.

## Run locally

```bash
npm run verify
npm run dev
```

Open `http://localhost:4173`.

No `npm install` is required for the current static build.

## GitHub Pages

The project uses relative static paths and can be hosted at a repository subpath such as:

`https://3dudes1life.github.io/yasreadypublish/`

## Current roadmap

- **0.6** reusable themes + Book 1 calibration
- **0.7** production PDF export + print preflight
- **0.8** EPUB/Kindle engine
- **0.9** import repair + edge-case hardening
- **1.0** private publisher-grade release
