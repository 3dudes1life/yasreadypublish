# YasReady Publish — Story Lock Specification

## Non-negotiable rule

YasReady Publish may transform **presentation metadata**. It may not silently transform manuscript language.

## Canonical source

The imported final DOCX is treated as the canonical manuscript source. On import, Publish creates SHA-256 fingerprints for both the source file and canonical manuscript text.

## Allowed operations

- classify paragraphs and chapter boundaries
- map front/body/back matter without reordering source blocks
- paginate source blocks
- change trim size, margins, gutters, typography, spacing, headers, and folios
- insert print-only blank pages
- save/apply reusable print themes
- export/import **theme metadata**
- navigate and preview the resulting book
- generate a print master from already-verified page fragments
- export preflight metadata and reports
- map the same locked source into reflowable EPUB sections
- generate ebook navigation and package metadata

## Forbidden silent operations

- rewriting or paraphrasing prose
- autocorrecting spelling or punctuation
- changing capitalization
- merging/deleting/reordering manuscript paragraphs
- altering text-message wording
- guessing tracked-change outcomes
- storing manuscript prose inside reusable theme files

## Theme isolation (v0.6)

A theme contains presentation settings only. Theme save/export/import operations do not copy `project.manuscript`, source blocks, canonical text, or Story Lock hashes.

Deleting a theme affects only the saved theme record. It does not alter a book project or its manuscript.

## Pagination verification

Before pagination, Story Lock verifies the current canonical manuscript text against the import fingerprint.

After pagination, Publish reconstructs each source paragraph from its rendered page fragments and compares the reconstructed text character-for-character with the source paragraph. A mismatch blocks the preview.

## Failure behavior

When Publish cannot safely interpret or verify content, it must stop and report the problem rather than inventing a correction.


## Production export isolation (v0.7)

KDP export is a presentation-only operation. Immediately before creating a print master, Publish re-verifies the current canonical manuscript against the original SHA-256 manuscript fingerprint.

The print master is built from the same page fragments that passed post-pagination character-for-character reconstruction. Export may add HTML/PDF page containers, headers, folios, and print-only blank pages, but it may not create substitute prose or alter fragment text.

If Story Lock fails, KDP export is blocked. If a fixed production page overflows in the print-master window, Print / Save as PDF remains disabled until the layout is corrected.


## EPUB export isolation (v0.8)

EPUB export is a second presentation engine, not a manuscript editor. Print-only concepts such as physical page numbers, gutters, running headers, and blank versos are excluded from reflowable output instead of being translated into story content.

Immediately before EPUB packaging, Publish re-verifies the canonical SHA-256 manuscript fingerprint. It then builds an ebook section map and verifies that every imported source block appears exactly once, in original order, with identical text. A mismatch blocks export.

Generated XHTML may encode reserved XML characters such as `<` and `&` for valid markup, but their decoded text remains the original source characters. Navigation labels, metadata, stylesheets, package files, and EPUB container files are presentation/package metadata and are kept outside the canonical manuscript layer.

## Generated matter + Structure Repair isolation (v0.9)

Version 0.9 introduces two presentation/structure features that remain outside the canonical source layer.

### Generated print Table of Contents

The print TOC is created as generated layout fragments after a first pagination pass. Its labels come from detected chapter/back-matter headings and its numbers come from the printed page map. These generated fragments have no source paragraph identity and are excluded from canonical manuscript reconstruction.

After the generated TOC is inserted, Publish re-paginates and compares every TOC target against the final printed page map. A mismatch blocks print export.

If the imported DOCX already contains a source `Table of Contents` / `Contents` heading, Publish does not add a second generated TOC and does not delete the source TOC. The user must intentionally change the master DOCX and re-import if they want to replace a manual TOC with generated matter.

### Structure Repair

Structure Repair stores only a mapping of source paragraph ID to structural classification. It may change how a paragraph is treated by layout—for example, `body` → `chapter-title`—but it cannot change that paragraph's text, runs, order, source ID, or canonical hash input.

Story Lock verification always hashes the original `project.manuscript.blocks`, never an effective/overridden copy. Print and EPUB engines may consume an effective structural clone, but source coverage is checked against the immutable original block IDs and text.

### Unsupported source-content protection

If a DOCX contains footnotes or endnotes that the current importer cannot safely place into reading order, import is blocked instead of omitting the note text. Other layout-sensitive constructs such as tables, Word fields, and manual page breaks are surfaced in preflight rather than silently treated as fully supported formatting.

## 1.0 Stable — recovery, readiness, and final production gate

Version 1.0 adds workflow and recovery features without weakening the canonical-source rule.

### Project backups

A `.yasready-project.json` backup is a private recovery artifact, not a reusable theme. Because its purpose is complete recovery, it intentionally contains the manuscript and project metadata. Restore never trusts the backup blindly: Publish migrates it into the current project schema and re-verifies the restored canonical manuscript against its stored Story Lock fingerprint before accepting it. A tampered backup is rejected.

Theme files remain presentation-only and never contain manuscript prose.

### Guided readiness

The Project Home workflow—Manuscript, Structure, Design, Proof, Paperback, Ebook—is status metadata. Changing workflow state cannot change manuscript blocks.

### Superman Final Check

“Run Final Check” is a production orchestration step, not an editor. It re-verifies canonical Story Lock, builds the current print preview, runs paperback preflight, and runs EPUB preflight. A green Superman Ready result means both production engines passed their current software gates.

Any structure, metadata, design, pagination, or ebook-setting change invalidates the previous Final Check result so the project must be checked again.

### Final principle

If presentation quality and source fidelity ever conflict, source fidelity wins. Publish must stop, flag, and require an explicit user decision rather than silently changing the book.


## Proof ownership and stale-state protection (v1.0.5)

Story Lock proves the manuscript text; proof ownership separately proves that a print preview belongs to the current presentation state. Each frozen print proof is signed against the edition type, manuscript hash, book/author metadata, structure overrides, and normalized print design.

If any of those values changes, the existing proof is stale and print preflight must block export until pagination is rebuilt. Changing presentation state invalidates proof/preflight metadata but never changes the canonical manuscript hash or source blocks.

A terminal blank page inserted solely to make the physical page count even is generated presentation metadata. It contains no manuscript text and is excluded from Story Lock reconstruction.


## Ebook Focus generated-navigation + cover isolation (v1.0.6)

Version 1.0.6 adds a visible generated ebook Table of Contents, EPUB landmarks, and an internal ebook cover asset. None of these are manuscript prose.

- The visible TOC labels are derived from source chapter headings and link to source-backed sections.
- Logical EPUB navigation, NCX, landmarks, OPF metadata, and spine ordering are generated package metadata outside canonical manuscript hashing.
- Clean front-matter reflow may collapse the **visual height** of blank source paragraphs, but those blank source blocks remain present in exact source coverage and in Story Lock order.
- Ebook cover artwork is stored under edition metadata and packaged as a `cover-image`; it is not inserted into canonical manuscript text.
- Parking Paperback/Hardcover changes enabled-edition state only and cannot delete or rewrite manuscript blocks.

Any source-coverage mismatch still blocks EPUB packaging.


## Kindle-first presentation isolation (v1.0.7)

Version 1.0.7 narrows the ebook workspace to Amazon KDP / Kindle. Migration may reset ebook presentation defaults (reader-controlled body alignment/font behavior, linked Contents, clean front matter), but it must never modify `project.manuscript.blocks`, canonical text, paragraph IDs, source order, or the Story Lock hash. KDP preflight and EPUB packaging remain presentation/output layers only.


## Preview Studio presentation overrides (v1.0.8)

Preview Studio may attach **presentation metadata** to a source block, scoped independently to ebook, paperback, or hardcover. Allowed ebook override properties are spacing before/after, first-line indent, alignment, and indent suppression. An override must reference an existing source block ID and must never contain replacement manuscript text.

The preview may expose a read-only snippet so an author knows which block is selected, but it must not expose `contenteditable`, a story textarea, or any control that writes to `block.text` or run text. Resetting an override removes presentation metadata only. Promoting a safe visual setting to a theme/default changes edition design metadata only.

The self-contained device proof is a rendered derivative and is read-only. Version 1.0.8 does not upload the manuscript or device proof to a remote preview service; Share Sheet/AirDrop or local download is used instead, preserving the static build's zero-network-manuscript-egress requirement.


## v1.0.10 Kindle presentation rule

Front-matter reflow and Preview Studio edits remain presentation operations. YasReady may group visual line-wraps, hide the visual height of print-only blank source blocks, or apply edition-scoped spacing/alignment metadata, but every source block and every source character remains in the canonical Story Lock sequence. Likely placeholders are flagged rather than removed. Preview Studio provides no prose-editing field.

## Semantic content + canonical v2 (v1.0.12)

Version 1.0.12 adds semantic Kindle presentation without turning Preview Studio into a manuscript editor.

### Semantic roles are presentation metadata

A source block may be presented as a Subhead, Block Quote, Written Note/Letter, Verse, Text Conversation, or Scene Break. Automatic detection may use source kind and Word paragraph-style names as hints. An explicit user choice is stored under the ebook presentation override for that source block.

Changing a semantic role may change XHTML element choice, CSS class, indentation, alignment, or ornament presentation. It may not replace the block's source text, source ID, order, or canonical wording.

When a scene-break ornament differs from the source marks, the source marks remain preserved in the generated XHTML as source-backed content while the chosen ornament is a presentation layer.

### Canonical Story Lock v2 for new DOCX imports

New 1.0.12 DOCX imports extend the canonical integrity stream to include:

1. the exact ordered manuscript paragraph stream,
2. imported footnote/endnote wording and paragraph boundaries, and
3. embedded-media fingerprints/file identity.

Embedded media are fingerprinted at import with SHA-256. Story Lock verification recomputes each stored media payload and compares it to its fingerprint before accepting canonical v2, so a replaced/tampered image payload cannot pass by retaining an old digest string.

### Legacy-project compatibility

Migration never upgrades an existing canonical v1 manuscript hash in place. Older projects retain their original Story Lock algorithm/hash and receive only empty note/media containers when those fields did not previously exist. Footnotes/endnotes or embedded images can only gain canonical v2 protection through a deliberate fresh DOCX import.

### Note and image failure behavior

Unresolved footnote/endnote references are never silently omitted. New DOCX import stops if a note reference cannot be resolved safely.

Embedded image references must resolve to imported assets. Unsupported image types or missing assets block Kindle release. Missing alt text is surfaced for review rather than invented by YasReady.


## Kindle Intelligence isolation (v1.0.13)

Kindle Intelligence may inspect manuscript structure and edition presentation metadata to identify formatting drift across chapters. The intelligence engine may compute chapter fingerprints, compare source style names, count semantic roles, and inspect edition-scoped spacing/alignment overrides. These are read-only observations of Story-Locked source data.

A one-click intelligence fix is allowed only when the operation is presentation-only. Version 1.0.13 permits safe fixes to remove suspicious ebook layout properties or orphan presentation metadata. When resetting layout properties on an existing block, an intentional semantic Content style is preserved.

Intelligence fixes must never write to `block.text`, run text, note text, media bytes, source order, source IDs, or canonical Story Lock hashes. Every accepted fix invalidates stale ebook proof/preflight state and remains compatible with the Preview Studio Undo history.

Chapter comparison compares presentation fingerprints only. It must not create a prose diff, rewrite text, or use story-language similarity as a formatting decision.

## Kindle Production UX isolation (v1.0.14)

Version 1.0.14 adds production workflow metadata without expanding the set of operations allowed to modify source content.

### Intentional-review decisions

A Kindle quality/intelligence review item may be marked intentional only when it is non-blocking. The stored record contains an exact token derived from the finding's identity, severity, label, message, source block/section location, and fingerprint. If the finding later changes, the old decision no longer matches and the issue returns to the active Polish Queue.

Review decisions live under ebook edition metadata. They do not modify manuscript blocks, notes, media, canonical hashes, generated XHTML, or EPUB package contents. Blocking errors may never be marked intentional.

### Quick polish and Focus Preview

Preview Studio's Tighter / Theme / Airier controls are presentation shortcuts for edition-scoped spacing metadata. Focus Preview, Reading Order search, keyboard navigation, and device simulation are UI state only. None may write manuscript prose.

Every accepted presentation change invalidates stale ebook proof/preflight state. Story Lock remains the authoritative boundary.

### Final Check alignment

Version 1.0.14 requires the Final Check ebook branch to include Kindle Intelligence alongside EPUB preflight and Kindle Pro quality. A workflow UI may never bypass a stricter release gate that is already enforced by the Kindle production workspace.


## Theme Studio isolation (v1.0.15)

Version 1.0.15 expands presentation capability without expanding manuscript mutation authority. Theme family selection, Word-style mapping, chapter overrides, first-paragraph treatments, scene-break treatments, text-conversation layouts, Contents styling, and optional theme artwork are edition presentation metadata only.

Theme Studio operations must preserve manuscript blocks, notes, media bytes, source order, canonical algorithm selection, and Story Lock hashes. The UI performs before/after manuscript-block comparisons on critical Theme Studio writes, and export remains subject to the existing Story Lock/source-coverage gates.

A visual scene-break ornament may hide the source break mark from presentation, but the locked source mark remains in EPUB markup. Text-conversation styling must preserve literal manuscript labels such as `[Name]:` exactly. Optional chapter-heading and scene-break artwork may be added to the EPUB package because artwork is presentation media; it may not replace or rewrite Story-Locked prose.
