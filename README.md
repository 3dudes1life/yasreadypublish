# YasReady Publish v0.2.0

Private-alpha publishing system focused on one permanent rule: **format the book without rewriting the story.**

## What 0.2 adds

- Local DOCX import and SHA-256 Story Lock from 0.1
- 6×9 working paperback model
- Mirrored inside/outside margins
- Adjustable gutter, top, bottom, and outside margins
- Draft typography controls
- Right-hand (odd-page) chapter starts
- Automatic intentional blank verso insertion
- Two-page structural book preview with page jumping
- Safe migration of local 0.1 projects into the 0.2 design layer

## Important quality boundary

0.2 is the **print-structure milestone**, not the final KDP exporter. It establishes page geometry and chapter parity. Production font calibration, running headers/footers, final widow/orphan behavior, preflight, and PDF export come in later milestones.

The source manuscript remains read-only. Design metadata is stored separately and Story Lock is verified before pagination.

## Run locally

```bash
npm run verify
npm run dev
```

Open `http://localhost:4173`.

GitHub Pages works as a static deployment; no bundler is required.
