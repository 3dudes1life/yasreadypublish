import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrintMasterHtml } from '../src/lib/print-export.js';
import { TRES_AMIGOS_TEMPLATE } from '../src/lib/print-model.js';

test('print master emits one fixed page per physical preview page and story hash metadata', () => {
  const project = {
    title: 'My Book', author: 'D.C.W.',
    manuscript: { blocks: [{ id: 'p-1', text: 'Exact words.', runs: [{ text: 'Exact words.', bold: false, italic: false, underline: false, strike: false, smallCaps: false }] }] },
    design: { print: { ...TRES_AMIGOS_TEMPLATE } },
  };
  const preview = {
    design: { ...TRES_AMIGOS_TEMPLATE },
    pages: [
      { number: 1, side: 'right', bookPageNumber: 1, intentionalBlank: false, showRunningHeader: false, chapterTitle: 'Chapter 1: Home', fragments: [{ sourceBlockId: 'p-1', kind: 'body', text: 'Exact words.', continuation: false, startOffset: 0, endOffset: 12, isFinalPiece: true, suppressIndent: false }] },
      { number: 2, side: 'left', bookPageNumber: 2, intentionalBlank: true, showRunningHeader: false, fragments: [] },
    ],
  };
  const html = buildPrintMasterHtml({ project, preview, manuscriptHash: 'abc123' });
  assert.equal((html.match(/<section class="pdf-page/g) || []).length, 2);
  assert.match(html, /yasready-story-lock" content="abc123"/);
  assert.match(html, /Exact words\./);
  assert.match(html, /@page \{ size: 6in 9in; margin: 0; \}/);
  assert.doesNotMatch(html, />2<\/div>\s*<\/section>/); // intentional blank should not get a folio
});
