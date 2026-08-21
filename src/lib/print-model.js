export const TRES_AMIGOS_TEMPLATE = Object.freeze({
  name: 'Tres Amigos Series · Book 1',
  templateId: 'tres-amigos-book1',
  trimWidth: 6,
  trimHeight: 9,
  insideMargin: 1.25,
  outsideMargin: 0.5,
  topMargin: 0.5,
  bottomMargin: 0.75,
  bodyFont: 'Arial',
  bodyFontSize: 12,
  lineHeight: 1.10,
  firstLineIndent: 0.5,
  paragraphGap: 0.333,
  chapterStarts: 'right',
  chapterTopSpace: 0.82,
  chapterAfterSpace: 1.08,
  chapterTitleSize: 14,
  chapterTitleLineHeight: 1.12,
  pageNumberFontSize: 12,
  pageNumbers: 'outside-bottom',
  numberFromFirstChapter: true,
  runningHeaders: false,
  runningHeaderMode: 'book-chapter',
  runningHeaderFontSize: 8,
  suppressHeaderOnChapterOpen: true,
});

export const DEFAULT_PRINT_DESIGN = Object.freeze({ ...TRES_AMIGOS_TEMPLATE });

const FONT_STACKS = {
  Arial: 'Arial, Helvetica, sans-serif',
  Georgia: 'Georgia, "Times New Roman", serif',
  Garamond: 'Garamond, "EB Garamond", Georgia, serif',
  Baskerville: 'Baskerville, "Baskerville Old Face", Georgia, serif',
  'Times New Roman': '"Times New Roman", Times, serif',
};

export function fontStack(name) {
  return FONT_STACKS[name] || FONT_STACKS.Arial;
}

export function normalizePrintDesign(input = {}) {
  const merged = { ...DEFAULT_PRINT_DESIGN, ...(input || {}) };
  const number = (value, fallback, min, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  };

  merged.trimWidth = number(merged.trimWidth, 6, 4, 12);
  merged.trimHeight = number(merged.trimHeight, 9, 5, 15);
  merged.insideMargin = number(merged.insideMargin, 1.25, 0.25, 2);
  merged.outsideMargin = number(merged.outsideMargin, 0.5, 0.25, 2);
  merged.topMargin = number(merged.topMargin, 0.5, 0.25, 2);
  merged.bottomMargin = number(merged.bottomMargin, 0.75, 0.25, 2);
  merged.bodyFontSize = number(merged.bodyFontSize, 12, 7, 18);
  merged.lineHeight = number(merged.lineHeight, 1.10, 1, 2);
  merged.firstLineIndent = number(merged.firstLineIndent, 0.5, 0, 1);
  merged.paragraphGap = number(merged.paragraphGap, 0.333, 0, 0.75);
  merged.chapterTopSpace = number(merged.chapterTopSpace, 0.82, 0, 2.5);
  merged.chapterAfterSpace = number(merged.chapterAfterSpace, 1.08, 0, 1.5);
  merged.chapterTitleSize = number(merged.chapterTitleSize, 14, 9, 28);
  merged.chapterTitleLineHeight = number(merged.chapterTitleLineHeight, 1.12, 1, 2);
  merged.pageNumberFontSize = number(merged.pageNumberFontSize, 12, 7, 18);
  merged.runningHeaderFontSize = number(merged.runningHeaderFontSize, 8, 6, 14);
  merged.chapterStarts = merged.chapterStarts === 'next' ? 'next' : 'right';
  merged.bodyFont = FONT_STACKS[merged.bodyFont] ? merged.bodyFont : 'Arial';
  merged.pageNumbers = merged.pageNumbers === 'none' ? 'none' : 'outside-bottom';
  merged.numberFromFirstChapter = merged.numberFromFirstChapter !== false;
  merged.runningHeaders = Boolean(merged.runningHeaders);
  merged.runningHeaderMode = ['book-chapter','author-book','book-author'].includes(merged.runningHeaderMode) ? merged.runningHeaderMode : 'book-chapter';
  merged.suppressHeaderOnChapterOpen = merged.suppressHeaderOnChapterOpen !== false;
  merged.templateId = merged.templateId || 'custom';
  return merged;
}

export function applyTemplate(templateId = 'tres-amigos-book1') {
  if (templateId === 'tres-amigos-book1') return normalizePrintDesign({ ...TRES_AMIGOS_TEMPLATE });
  return normalizePrintDesign({ templateId: 'custom', name: 'Custom 6×9' });
}

export function ensurePrintDesign(project) {
  if (!project) return project;
  project.design = project.design || {};
  project.design.print = normalizePrintDesign(project.design.print);
  project.design.template = project.design.template || project.design.print.name || TRES_AMIGOS_TEMPLATE.name;
  return project;
}

export function pageSide(pageNumber) {
  return Number(pageNumber) % 2 === 1 ? 'right' : 'left';
}

export function isRightPage(pageNumber) {
  return pageSide(pageNumber) === 'right';
}

export function contentBoxInches(designInput) {
  const design = normalizePrintDesign(designInput);
  return {
    width: Math.max(1, design.trimWidth - design.insideMargin - design.outsideMargin),
    height: Math.max(1, design.trimHeight - design.topMargin - design.bottomMargin),
  };
}

export function validatePrintDesign(designInput) {
  const design = normalizePrintDesign(designInput);
  const content = contentBoxInches(design);
  const warnings = [];
  if (content.width < 3.5) warnings.push('Text area is very narrow. Reduce side margins or increase trim width.');
  if (content.height < 5.5) warnings.push('Text area is very short. Reduce top/bottom margins or increase trim height.');
  if (design.insideMargin < 0.75) warnings.push('Inside margin is below the 0.75 in working target for this long paperback.');
  return { ok: warnings.length === 0, warnings, design, content };
}

export function chapterNeedsBlankVerso(nextPageNumber, chapterStarts = 'right') {
  return chapterStarts === 'right' && !isRightPage(nextPageNumber);
}
