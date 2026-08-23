# YasReady Publish 1.0.11 — Kindle Production Rules

This project deliberately produces a conservative reflowable EPUB for Amazon KDP.

## Core production rules

- EPUB 3 reflowable package
- visible linked Table of Contents before Chapter 1
- EPUB navigation document plus NCX compatibility navigation
- Begin Reading landmark at first chapter
- one internal cover image; no duplicate cover XHTML page
- no fixed print trim/gutter/folios in ebook output
- body text size remains reader-controlled
- body base line-height remains reader-controlled
- chapter and matter sizing uses relative units
- Story Lock SHA-256 is embedded in package metadata

## 1.0.11 Kindle Pro checks

- finished navigation targets must resolve
- finished spine targets must resolve
- Story Lock metadata must match the current manuscript hash
- production CSS may not force body px/pt size
- production CSS should avoid fixed/absolute positioning and negative-margin hacks
- chapter headings use relative em sizing and explicit page breaks
- entire book is scanned for chapter-map inconsistencies and suspicious presentation outliers

## Preview calibration

The 10.5 / 11 / 12pt reference control affects only YasReady's simulator. It exists so an author can visually compare the reflowable preview to a familiar manuscript baseline. It is not written into EPUB body CSS.

Amazon Kindle Previewer remains the final external rendering check.
