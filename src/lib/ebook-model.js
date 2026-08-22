import { analyzeMatter, matterSectionForBlockIndex } from './structure-model.js';
import { effectiveBlocks } from './structure-overrides.js';

export const DEFAULT_EBOOK_DESIGN = Object.freeze({
  themeId: 'tres-amigos-ebook',
  name: 'Tres Amigos Series · Reflowable',
  language: 'en',
  publisher: '',
  fontFamily: 'reader',
  lineHeight: 1.42,
  firstLineIndentEm: 1.35,
  paragraphGapEm: 0,
  bodyBlankPolicy: 'normalize',
  bodyBlankSpaceEm: 0.7,
  chapterTitleAlignment: 'center',
  chapterTopEm: 4.2,
  chapterAfterEm: 2.4,
  bodyAlignment: 'left',
  textMessageIndentEm: 1.2,
  sceneBreakSpaceEm: 1.2,
});

const clamp = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

export function normalizeEbookDesign(input = {}) {
  const design = { ...DEFAULT_EBOOK_DESIGN, ...(input || {}) };
  design.language = String(design.language || 'en').trim() || 'en';
  design.publisher = String(design.publisher || '').trim();
  design.fontFamily = ['reader', 'serif', 'sans'].includes(design.fontFamily) ? design.fontFamily : 'reader';
  design.lineHeight = clamp(design.lineHeight, DEFAULT_EBOOK_DESIGN.lineHeight, 1, 2.2);
  design.firstLineIndentEm = clamp(design.firstLineIndentEm, DEFAULT_EBOOK_DESIGN.firstLineIndentEm, 0, 3);
  design.paragraphGapEm = clamp(design.paragraphGapEm, DEFAULT_EBOOK_DESIGN.paragraphGapEm, 0, 2);
  design.bodyBlankPolicy = ['normalize','preserve','collapse'].includes(design.bodyBlankPolicy) ? design.bodyBlankPolicy : (design.collapseBodyBlankParagraphs === false ? 'preserve' : 'normalize');
  design.bodyBlankSpaceEm = clamp(design.bodyBlankSpaceEm, DEFAULT_EBOOK_DESIGN.bodyBlankSpaceEm, 0, 2);
  delete design.collapseBodyBlankParagraphs;
  design.chapterTitleAlignment = ['left', 'center', 'right'].includes(design.chapterTitleAlignment) ? design.chapterTitleAlignment : 'center';
  design.chapterTopEm = clamp(design.chapterTopEm, DEFAULT_EBOOK_DESIGN.chapterTopEm, 0, 8);
  design.chapterAfterEm = clamp(design.chapterAfterEm, DEFAULT_EBOOK_DESIGN.chapterAfterEm, 0, 6);
  design.bodyAlignment = ['left', 'justify'].includes(design.bodyAlignment) ? design.bodyAlignment : 'left';
  design.textMessageIndentEm = clamp(design.textMessageIndentEm, DEFAULT_EBOOK_DESIGN.textMessageIndentEm, 0, 4);
  design.sceneBreakSpaceEm = clamp(design.sceneBreakSpaceEm, DEFAULT_EBOOK_DESIGN.sceneBreakSpaceEm, 0, 4);
  design.themeId = String(design.themeId || DEFAULT_EBOOK_DESIGN.themeId);
  design.name = String(design.name || DEFAULT_EBOOK_DESIGN.name);
  return design;
}

export function ensureEbookDesign(project) {
  if (!project) return project;
  project.design = project.design || {};
  project.design.ebook = normalizeEbookDesign(project.design.ebook);
  return project;
}

function sectionSlug(type, index) {
  if (type === 'chapter') return `chapter-${String(index).padStart(3, '0')}`;
  if (type === 'front') return `front-${String(index).padStart(3, '0')}`;
  return `back-${String(index).padStart(3, '0')}`;
}

function headingLike(block) {
  return Boolean(block && block.kind !== 'blank' && (
    block.kind === 'front-back-heading'
    || block.kind === 'heading'
    || /heading|title/i.test(block.style?.name || '')
  ));
}

function sectionTitle(type, blocks, ordinal) {
  const firstHeading = blocks.find((block) => block.kind === 'chapter-title' || headingLike(block));
  if (firstHeading?.text?.trim()) return firstHeading.text.trim();
  if (type === 'front') return ordinal === 1 ? 'Front Matter' : `Front Matter ${ordinal}`;
  if (type === 'back') return ordinal === 1 ? 'Back Matter' : `Back Matter ${ordinal}`;
  return `Chapter ${ordinal}`;
}

export function buildEbookSections(project) {
  const blocks = effectiveBlocks(project);
  const structure = analyzeMatter(blocks);
  const sections = [];
  let current = null;
  let frontCount = 0;
  let chapterCount = 0;
  let backCount = 0;

  const startSection = (type) => {
    const ordinal = type === 'front' ? ++frontCount : type === 'chapter' ? ++chapterCount : ++backCount;
    current = {
      id: sectionSlug(type, ordinal),
      type,
      ordinal,
      blocks: [],
      title: '',
      href: '',
      includeInToc: type === 'chapter',
    };
    sections.push(current);
    return current;
  };

  for (const block of blocks) {
    const matter = matterSectionForBlockIndex(block.index, structure);
    const type = matter === 'body' ? 'chapter' : matter;
    const startsChapter = block.kind === 'chapter-title';
    const startsMatterHeading = type !== 'chapter' && headingLike(block) && current?.blocks?.some((candidate) => candidate.kind !== 'blank');

    if (!current || current.type !== type || startsChapter || startsMatterHeading) startSection(type);
    current.blocks.push(block);
    if (startsChapter || (type !== 'chapter' && headingLike(block))) current.includeInToc = true;
  }

  for (const section of sections) {
    section.title = sectionTitle(section.type, section.blocks, section.ordinal);
    section.href = `text/${section.id}.xhtml`;
    section.startBlockIndex = section.blocks[0]?.index ?? null;
    section.endBlockIndex = section.blocks.at(-1)?.index ?? null;
    section.wordCount = section.blocks.reduce((sum, block) => sum + (block.wordCount || 0), 0);
  }

  return { sections, structure };
}

export function ebookTocEntries(project) {
  return buildEbookSections(project).sections
    .filter((section) => section.includeInToc && section.blocks.some((block) => block.kind !== 'blank'))
    .map((section, index) => ({
      id: `nav-${index + 1}`,
      label: section.title,
      href: section.href,
      type: section.type,
    }));
}

export function verifyEbookSourceCoverage(project, sectionsInput = null) {
  const blocks = project?.manuscript?.blocks || [];
  const sections = sectionsInput || buildEbookSections(project).sections;
  const flattened = sections.flatMap((section) => section.blocks);
  const mismatches = [];

  if (flattened.length !== blocks.length) {
    mismatches.push({ type: 'count', expected: blocks.length, actual: flattened.length });
  }

  const length = Math.max(blocks.length, flattened.length);
  for (let index = 0; index < length; index += 1) {
    const expected = blocks[index];
    const actual = flattened[index];
    if (!expected || !actual || expected.id !== actual.id || expected.text !== actual.text) {
      mismatches.push({
        type: 'block',
        index,
        expectedId: expected?.id || null,
        actualId: actual?.id || null,
        expectedText: expected?.text ?? null,
        actualText: actual?.text ?? null,
      });
      if (mismatches.length >= 25) break;
    }
  }

  return { ok: mismatches.length === 0, checkedBlocks: blocks.length, mismatches };
}

export function ebookFontStack(fontFamily = 'reader') {
  if (fontFamily === 'serif') return 'Georgia, "Times New Roman", serif';
  if (fontFamily === 'sans') return 'Arial, Helvetica, sans-serif';
  return 'serif';
}
