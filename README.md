# YasReady Publish v0.7.0

Private, story-safe book production software being built toward a Vellum-quality YasReady Publish 1.0.

## What v0.7 adds

- Dedicated **KDP Export** workspace
- KDP-oriented paperback preflight for the current fixed-layout page model
- Page-count-aware inside-margin validation
- No-bleed outside-margin validation
- 7 pt minimum-font validation
- Right-hand chapter parity validation
- Intentional blank-page furniture validation
- DOCX image-asset detection; image/bleed export is blocked instead of silently dropping assets
- **Open PDF Print Master** action
- **Download Print Master HTML** archival action
- Fixed one-page-per-physical-page export document using CSS `@page`
- Export-window overflow guard that disables printing if any production page exceeds its fixed page box
- Downloadable KDP preflight JSON report containing project metadata, page count, design checks, and Story Lock hash
- Story Lock is re-verified immediately before any print-master export
- Intentional blank versos now suppress both running headers and folios

## PDF workflow in v0.7

1. Import the final DOCX.
2. Apply/save the print theme.
3. Build **Print Preview**.
4. Open **KDP Export** and resolve blocking preflight errors.
5. Click **Open PDF Print Master**.
6. The print-master window checks every fixed page for overflow.
7. Only after the overflow check passes does **Print / Save as PDF** become available.
8. In the browser print dialog, keep scale at 100%, disable browser headers/footers, and save as PDF.
9. Confirm font embedding in the resulting PDF before KDP upload.

The current 0.7 production exporter is intentionally **no bleed / text-first**. If DOCX image assets are detected, export is blocked rather than silently omitting them.

## KDP working rules used by 0.7 preflight

- Paperback interior is exported as individual pages, not spreads.
- Standard Tres Amigos trim: 6 × 9 in.
- Working paperback page-count range: 24–828 pages.
- Minimum font size: 7 pt.
- No-bleed outside margin minimum: 0.25 in.
- Inside margin by physical page count:
  - 24–150: 0.375 in
  - 151–300: 0.500 in
  - 301–500: 0.625 in
  - 501–700: 0.750 in
  - 701–828: 0.875 in

These checks are a production aid, not a replacement for the final KDP Previewer or post-export PDF inspection.

## Story Lock remains the first rule

The imported DOCX remains the canonical source. Before pagination and again immediately before export, the manuscript hash is rechecked. After pagination, every source paragraph is reconstructed from page fragments and compared character-for-character with the locked source.

The print-master export is generated only from those verified fragments. It can change page presentation; it cannot rewrite a sentence.

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

- **0.7** KDP preflight + production print-master/PDF workflow
- **0.8** EPUB/Kindle engine
- **0.9** import repair + edge-case hardening + post-export PDF inspection
- **1.0** private publisher-grade release
