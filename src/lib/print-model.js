export const DEFAULT_PRINT_DESIGN = Object.freeze({
  name: 'Novel 6×9 Draft',
  trimWidth: 6,
  trimHeight: 9,
  insideMargin: 0.75,
  outsideMargin: 0.5,
  topMargin: 0.65,
  bottomMargin: 0.65,
  bodyFont: 'Georgia',
  bodyFontSize: 11,
  lineHeight: 1.22,
  firstLineIndent: 0.22,
  paragraphGap: 0,
  chapterStarts: 'right',
  chapterTopSpace: 0.72,
  chapterAfterSpace: 0.28,
});

const FONT_STACKS = {
  Georgia: 'Georgia, "Times New Roman", serif',
  Garamond: 'Garamond, "EB Garamond", Georgia, serif',
  Baskerville: 'Baskerville, "Baskerville Old Face", Georgia, serif',
  'Times New Roman': '"Times New Roman", Times, serif',
};

export function fontStack(name) {
  return FONT_STACKS[name] || FONT_STACKS.Georgia;
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
  merged.insideMargin = number(merged.insideMargin, 0.75, 0.25, 2);
  merged.outsideMargin = number(merged.outsideMargin, 0.5, 0.25, 2);
  merged.topMargin = number(merged.topMargin, 0.65, 0.25, 2);
  merged.bottomMargin = number(merged.bottomMargin, 0.65, 0.25, 2);
  merged.bodyFontSize = number(merged.bodyFontSize, 11, 7, 18);
  merged.lineHeight = number(merged.lineHeight, 1.22, 1, 2);
  merged.firstLineIndent = number(merged.firstLineIndent, 0.22, 0, 1);
  merged.paragraphGap = number(merged.paragraphGap, 0, 0, 0.5);
  merged.chapterTopSpace = number(merged.chapterTopSpace, 0.72, 0, 2.5);
  merged.chapterAfterSpace = number(merged.chapterAfterSpace, 0.28, 0, 1.5);
  merged.chapterStarts = merged.chapterStarts === 'next' ? 'next' : 'right';
  merged.bodyFont = FONT_STACKS[merged.bodyFont] ? merged.bodyFont : 'Georgia';
  return merged;
}

export function ensurePrintDesign(project) {
  if (!project) return project;
  project.design = project.design || {};
  project.design.print = normalizePrintDesign(project.design.print);
  project.design.template = project.design.template || 'Novel 6×9 Draft';
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
