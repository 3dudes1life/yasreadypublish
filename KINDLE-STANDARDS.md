# YasReady Publish 1.0.27 — Amazon Hard Mode Kindle Rules

YasReady produces a conservative reflowable EPUB for Amazon KDP and treats Amazon acceptance as an **external pipeline**, not an internal claim. Passing YasReady means the exact EPUB build is ready to be tested in Kindle Previewer.

## Core production rules

- EPUB 3 reflowable package with Kindle-compatible NCX fallback
- logical EPUB navigation kept separate from the visible linked Contents page
- Begin Reading landmark and OPF guide targets for Kindle compatibility
- one internal cover image with EPUB 3 and legacy Kindle cover declarations; no duplicate cover XHTML page
- no print trim, gutter, running folios, fixed-page geometry, absolute positioning, or blank-verso logic in ebook output
- normal body prose does **not** force font face, base font size, base line-height, text color/background, or alignment
- differentiated fiction elements use relative styling and percentage horizontal margins where side indentation is needed
- actual generated XHTML is audited for file count and per-file byte size before export
- non-empty hidden source text is blocked from production XHTML
- Kindle-bound images are JPEG/PNG only and are checked for conversion-hazard dimensions; transparency/likely-CMYK conditions are surfaced
- source tables block Kindle readiness until they can be preserved semantically; YasReady does not silently flatten them
- simple source lists are emitted as semantic lists; source hyperlinks are preserved on 1.0.27+ imports
- Story Lock SHA-256 and private source fingerprints stay **inside YasReady/release reports**, not in the publishable OPF metadata

## Amazon external gates

Internal Amazon Hard Mode completion is only the first gate. For the exact release token, the production flow is:

1. Ready for Kindle Previewer
2. Kindle Previewer opens/converts successfully
3. Enhanced Typesetting is confirmed when Amazon reports support
4. Upload the same EPUB to KDP
5. Approve the KDP Online Preview

Any manuscript, design, cover, override, or review-state change invalidates stale external confirmations for that build.

## Preview versus EPUB

Device type, orientation, appearance, preview reference size, Focus Preview, and the 3-View Torture Test are **simulation controls**. They do not alter the EPUB.

Layout/semantic changes made through the Format Inspector are **edition presentation metadata**. They may alter generated XHTML/CSS presentation but may not alter manuscript wording, note text, media bytes, source IDs/order, or Story Lock hashes.

## Production Console / review decisions

The Production Console combines setup, technical preflight, Kindle Pro quality, and Kindle Intelligence. Its Polish Queue is a production workflow layer outside the EPUB package.

- blocking errors can never be dismissed as intentional
- a non-blocking finding may be marked intentional only for its exact current token (identity, severity, label, message, source location, fingerprint)
- if that finding changes, the old acknowledgement does not match and the item resurfaces
- an acknowledgement never changes source text, EPUB markup, or the underlying QA finding

## Semantic fiction roles

Kindle-safe semantic presentation includes Subheads, Block Quotes, Written Notes / Letters, Verse / Poetry, Text Conversations, Scene Breaks, Footnotes / Endnotes, and supported inline manuscript images. Role assignment remains presentation metadata.

## Kindle Intelligence rules

Whole-book intelligence may compare presentation fingerprints, flag isolated drift, navigate to source-backed blocks, and apply explicit presentation-only safe fixes. It may not rewrite, normalize, delete, or reorder manuscript text.

## Story Lock v2 for new imports

New DOCX imports protect canonical paragraph wording/boundaries, footnote/endnote wording, and embedded-image SHA-256 fingerprints/file identity. Existing projects retain their canonical version/hash unless deliberately reimported.

## Release gate

Kindle release requires Story Lock/source coverage, EPUB preflight, Kindle Pro quality, Kindle Intelligence, and finished-package audit. **Run Final Check uses the current Amazon Hard Mode + intelligence gate in 1.0.27.**

Amazon Kindle Previewer remains the final external rendering check for the exact exported EPUB.
