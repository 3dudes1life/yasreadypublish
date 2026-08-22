import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEbookSections, ebookTocEntries, normalizeEbookDesign, verifyEbookSourceCoverage } from '../src/lib/ebook-model.js';

function block(index, kind, text, styleName = 'Normal') {
  return { id: `p-${index + 1}`, index, kind, text, style: { name: styleName }, runs: [{ text }], wordCount: text.trim() ? text.trim().split(/\s+/).length : 0 };
}

function project() {
  const blocks = [
    block(0, 'front-back-heading', 'Copyright', 'Title'),
    block(1, 'body', 'Copyright body.'),
    block(2, 'front-back-heading', 'Contents', 'Heading 1'),
    block(3, 'chapter-title', 'Chapter 1: Home', 'Heading 1'),
    block(4, 'chapter-opening', 'First exact paragraph.'),
    block(5, 'text-message', '[Juan]: I am here.'),
    block(6, 'chapter-title', 'Chapter 2: Morning', 'Heading 1'),
    block(7, 'chapter-opening', 'Second exact paragraph.'),
    block(8, 'front-back-heading', 'About the Authors', 'Heading 1'),
    block(9, 'body', 'Back matter exact text.'),
  ];
  return { manuscript: { blocks }, design: { ebook: {} } };
}

test('ebook sections preserve every source block once and in order', () => {
  const p = project();
  const built = buildEbookSections(p);
  const coverage = verifyEbookSourceCoverage(p, built.sections);
  assert.equal(coverage.ok, true);
  assert.equal(coverage.checkedBlocks, p.manuscript.blocks.length);
  assert.equal(built.sections.flatMap((section) => section.blocks).map((b) => b.id).join(','), p.manuscript.blocks.map((b) => b.id).join(','));
});

test('chapter starts become separate reflowable sections', () => {
  const sections = buildEbookSections(project()).sections;
  const chapters = sections.filter((section) => section.type === 'chapter');
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, 'Chapter 1: Home');
  assert.equal(chapters[1].title, 'Chapter 2: Morning');
});

test('ebook TOC includes chapters and recognized matter headings', () => {
  const toc = ebookTocEntries(project(), { tocScope: 'all-matter' });
  assert.ok(toc.some((entry) => entry.label === 'Chapter 1: Home'));
  assert.ok(toc.some((entry) => entry.label === 'Chapter 2: Morning'));
  assert.ok(toc.some((entry) => entry.label === 'About the Authors'));
});

test('ebook design normalization is independent from print geometry', () => {
  const design = normalizeEbookDesign({ language: 'en-US', lineHeight: 99, firstLineIndentEm: -2, fontFamily: 'nonsense' });
  assert.equal(design.language, 'en-US');
  assert.equal(design.lineHeight, 2.2);
  assert.equal(design.firstLineIndentEm, 0);
  assert.equal(design.fontFamily, 'reader');
  assert.equal('insideMargin' in design, false);
});
