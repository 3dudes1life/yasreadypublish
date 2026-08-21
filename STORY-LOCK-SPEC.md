# YasReady Publish — Story Lock Specification v1

## Prime directive

YasReady Publish is a publishing/layout system, not a manuscript rewriting system.

**Design is mutable. Story wording is immutable.**

## Canonical content layer

On DOCX import, v0.1 reads `word/document.xml` and reconstructs each visible Word paragraph from `w:t` text nodes plus supported visible control characters:

- tabs → `\\t`
- explicit line breaks / carriage returns → `\\n`
- non-breaking hyphen → U+2011
- soft hyphen → U+00AD

Paragraph text is stored exactly as imported. Paragraph boundaries are represented in the Story Lock canonical string with U+2029 (PARAGRAPH SEPARATOR).

## Fingerprints

Two SHA-256 hashes are generated:

1. **Source file hash** — raw `.docx` bytes.
2. **Manuscript hash** — canonical paragraph text and paragraph boundaries.

The manuscript hash is the export gate for future versions.

## Allowed transformations

Future versions may alter only presentation or explicit structure metadata, including:

- page size
- margins / gutter
- font family / font size
- leading
- paragraph indentation
- chapter-opening page rules
- headers / footers / page numbers
- visual style of text messages or scene breaks
- generated table of contents
- print-only blank pages

## Forbidden implicit transformations

Without a deliberate source-manuscript update, Publish may never silently:

- rewrite or paraphrase prose
- spell-correct
- grammar-correct
- change punctuation
- normalize capitalization
- convert words or names
- merge or split paragraph wording in a way that changes the canonical manuscript
- remove repeated-looking text
- invent missing text
- alter `[Name]: message` wording
- reorder story paragraphs

If the software cannot safely classify source content, it must preserve it and flag the structure rather than guessing.

## v0.5 navigation rule

The Navigator may index physical page numbers, printed page numbers, spreads, chapter titles already present in the manuscript, and generated book-section labels. It must never store or generate rewritten story prose. Navigation destinations are disposable presentation metadata and are rebuilt whenever pagination changes.
