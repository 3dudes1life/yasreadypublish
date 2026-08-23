import { analyzeMatter, matterSectionForBlockIndex } from './structure-model.js';
import { effectiveBlocks } from './structure-overrides.js';
import { defaultEbookThemeStudio, normalizeEbookThemeStudio } from './ebook-theme-studio.js';

export const DEFAULT_EBOOK_DESIGN = Object.freeze({
  themeId: 'tres-amigos-ebook',
  name: 'Tres Amigos Series · Reflowable',
  language: 'en',
  publisher: '',
  fontFamily: 'reader',
  lineHeight: 1.42,
  firstLineIndentEm: 1.35,
  paragraphGapEm: 0.7,
  bodyBlankPolicy: 'collapse',
  bodyBlankSpaceEm: 0.7,
  chapterTitleAlignment: 'center',
  chapterTopEm: 6.2,
  chapterAfterEm: 5.4,
  bodyAlignment: 'reader',
  textMessageIndentEm: 1.2,
  sceneBreakSpaceEm: 1.2,
  subheadAlignment: 'left',
  subheadSizeEm: 1.12,
  blockQuoteIndentEm: 1.2,
  blockQuoteStyle: 'plain',
  writtenNoteStyle: 'inset',
  verseIndentEm: 1.0,
  textMessageStyle: 'inset',
  sceneBreakTreatment: 'source',
  tocScope: 'chapters',
  visibleToc: true,
  frontMatterMode: 'clean',
  themeStudio: defaultEbookThemeStudio(),
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
  design.bodyBlankPolicy = ['normalize','preserve','collapse'].includes(design.bodyBlankPolicy) ? design.bodyBlankPolicy : (design.collapseBodyBlankParagraphs === false ? 'preserve' : 'collapse');
  design.bodyBlankSpaceEm = clamp(design.bodyBlankSpaceEm, DEFAULT_EBOOK_DESIGN.bodyBlankSpaceEm, 0, 2);
  delete design.collapseBodyBlankParagraphs;
  design.chapterTitleAlignment = ['left', 'center', 'right'].includes(design.chapterTitleAlignment) ? design.chapterTitleAlignment : 'center';
  design.chapterTopEm = clamp(design.chapterTopEm, DEFAULT_EBOOK_DESIGN.chapterTopEm, 0, 8);
  design.chapterAfterEm = clamp(design.chapterAfterEm, DEFAULT_EBOOK_DESIGN.chapterAfterEm, 0, 6);
  design.bodyAlignment = ['reader', 'left', 'justify'].includes(design.bodyAlignment) ? design.bodyAlignment : 'reader';
  design.textMessageIndentEm = clamp(design.textMessageIndentEm, DEFAULT_EBOOK_DESIGN.textMessageIndentEm, 0, 4);
  design.sceneBreakSpaceEm = clamp(design.sceneBreakSpaceEm, DEFAULT_EBOOK_DESIGN.sceneBreakSpaceEm, 0, 4);
  design.subheadAlignment = ['left','center','right'].includes(design.subheadAlignment) ? design.subheadAlignment : DEFAULT_EBOOK_DESIGN.subheadAlignment;
  design.subheadSizeEm = clamp(design.subheadSizeEm, DEFAULT_EBOOK_DESIGN.subheadSizeEm, 0.9, 1.8);
  design.blockQuoteIndentEm = clamp(design.blockQuoteIndentEm, DEFAULT_EBOOK_DESIGN.blockQuoteIndentEm, 0, 3);
  design.blockQuoteStyle = ['plain','italic'].includes(design.blockQuoteStyle) ? design.blockQuoteStyle : DEFAULT_EBOOK_DESIGN.blockQuoteStyle;
  design.writtenNoteStyle = ['plain','inset'].includes(design.writtenNoteStyle) ? design.writtenNoteStyle : DEFAULT_EBOOK_DESIGN.writtenNoteStyle;
  design.verseIndentEm = clamp(design.verseIndentEm, DEFAULT_EBOOK_DESIGN.verseIndentEm, 0, 3);
  design.textMessageStyle = ['inset','compact','bubbles','left-right','transcript'].includes(design.textMessageStyle) ? design.textMessageStyle : DEFAULT_EBOOK_DESIGN.textMessageStyle;
  design.sceneBreakTreatment = ['source','asterisks','dots','diamond','flourish','whitespace','custom-text','custom-image'].includes(design.sceneBreakTreatment) ? design.sceneBreakTreatment : DEFAULT_EBOOK_DESIGN.sceneBreakTreatment;
  design.tocScope = design.tocScope === 'all-matter' ? 'all-matter' : 'chapters';
  design.visibleToc = design.visibleToc !== false;
  design.frontMatterMode = design.frontMatterMode === 'source' ? 'source' : 'clean';
  design.themeId = String(design.themeId || DEFAULT_EBOOK_DESIGN.themeId);
  design.name = String(design.name || DEFAULT_EBOOK_DESIGN.name);
  design.themeStudio = normalizeEbookThemeStudio(design.themeStudio || {});
  if (!design.themeStudio.themeId) design.themeStudio.themeId = design.themeId;
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

const FRONT_SECTION_RE = /^(?:copyright(?:\s*(?:©|\(c\))\s*\d{0,4}|\s+\d{4}|\s+(?:page|notice)\b|$)|dedication(?:\s+page)?\b|acknowledg(?:e)?ments\b|foreword\b|preface\b|introduction\b|previously on\b|table of contents\b|contents\b)/i;
const BACK_SECTION_RE = /^(about the author(?:s)?|acknowledg(?:e)?ments|join the journey|also by|author(?:’|'|)s? note|notes|connect|stay connected|newsletter|resources|book club|discussion questions|reading group|contact)\b/i;
const PLACEHOLDER_RE = /^(chapters? page|toc page|table of contents page)$/i;

export function matterSectionHeading(block, type = 'front') {
  if (!block || block.kind === 'blank') return false;
  const text = String(block.text || '').trim();
  if (!text) return false;
  if (type === 'front') return FRONT_SECTION_RE.test(text);
  if (type === 'back') return BACK_SECTION_RE.test(text);
  return false;
}

function sectionTitle(type, blocks, ordinal) {
  const firstHeading = blocks.find((block) => block.kind === 'chapter-title' || matterSectionHeading(block, type));
  if (firstHeading?.text?.trim()) return firstHeading.text.trim();
  if (type === 'front') return ordinal === 1 ? 'Front Matter' : `Front Matter ${ordinal}`;
  if (type === 'back') return ordinal === 1 ? 'Back Matter' : `Back Matter ${ordinal}`;
  return `Chapter ${ordinal}`;
}

export function ebookMatterRole(section = {}) {
  if (section.type === 'chapter') return 'chapter';
  const first = (section.blocks || []).find((block) => matterSectionHeading(block, section.type));
  const text = String(first?.text || '').trim();
  if (section.type === 'front') {
    if (/^copyright\b/i.test(text)) return 'copyright';
    if (/^dedication\b/i.test(text)) return 'dedication';
    if (/^(table of contents|contents)\b/i.test(text)) return 'source-toc';
    if (/^acknowledg/i.test(text)) return 'acknowledgments';
    if (section.ordinal === 1) return 'title';
    return 'front';
  }
  if (section.type === 'back') return 'back';
  return 'matter';
}

export function detectEbookPlaceholders(project) {
  const blocks = effectiveBlocks(project);
  const structure = analyzeMatter(blocks);
  return blocks
    .filter((block) => matterSectionForBlockIndex(block.index, structure) !== 'body')
    .filter((block) => PLACEHOLDER_RE.test(String(block.text || '').trim()))
    .map((block) => ({ id:block.id, index:block.index, text:String(block.text || '').trim() }));
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
    const startsMatterHeading = type !== 'chapter'
      && matterSectionHeading(block, type)
      && current?.blocks?.some((candidate) => candidate.kind !== 'blank');

    if (!current || current.type !== type || startsChapter || startsMatterHeading) startSection(type);
    current.blocks.push(block);
    if (startsChapter || (type !== 'chapter' && matterSectionHeading(block, type))) current.includeInToc = true;
  }

  for (const section of sections) {
    section.title = sectionTitle(section.type, section.blocks, section.ordinal);
    section.href = `text/${section.id}.xhtml`;
    section.startBlockIndex = section.blocks[0]?.index ?? null;
    section.endBlockIndex = section.blocks.at(-1)?.index ?? null;
    section.wordCount = section.blocks.reduce((sum, block) => sum + (block.wordCount || 0), 0);
    section.role = ebookMatterRole(section);
  }

  return { sections, structure };
}

export function ebookTocEntries(project, designInput = null) {
  const design = normalizeEbookDesign(designInput || project?.editions?.ebook?.design || project?.design?.ebook || {});
  return buildEbookSections(project).sections
    .filter((section) => section.blocks.some((block) => block.kind !== 'blank'))
    .filter((section) => section.type === 'chapter' || (design.tocScope === 'all-matter' && section.includeInToc))
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
