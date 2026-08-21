# YasReady Publish 0.7 — KDP Paperback Preflight

This file documents the checks built into the 0.7 production gate.

## Blocking checks

- Story Lock must verify against the imported manuscript hash.
- A paginated single-page interior model must exist.
- Physical page count must be in the 24–828 working range used by this build.
- Inside margin must meet the page-count band:
  - 24–150 pages: 0.375 in
  - 151–300 pages: 0.500 in
  - 301–500 pages: 0.625 in
  - 501–700 pages: 0.750 in
  - 701–828 pages: 0.875 in
- No-bleed outside margin must be at least 0.250 in.
- Active text styles must not be below 7 pt.
- If the theme requires right-hand chapter starts, every detected chapter opener must land on an odd/right physical page.
- Intentional blank versos must not carry running headers or folios.
- DOCX image assets block 0.7 export because image/bleed production is not yet implemented.

## Warning checks

- Non-6×9 trim sizes require matching selection/verification in KDP.
- Font embedding cannot be proven until the final PDF exists and must be checked after Save as PDF.

## Export gate

When preflight has no blocking errors, YasReady Publish creates a fixed single-page Print Master. The Print Master runs an additional DOM overflow check against every physical page. The Print / Save as PDF button remains disabled if overflow is detected.

The KDP Previewer remains the final manufacturing preview.
