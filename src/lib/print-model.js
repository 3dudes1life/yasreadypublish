export const TRES_AMIGOS_TEMPLATE = Object.freeze({
  name: 'Tres Amigos Series · Book 1',
  description: 'Book 1 series interior: 6×9, wide binding margin, Arial body, centered chapter openers, outside-bottom folios.',
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
  bodyAlignment: 'left',
  firstLineIndent: 0.5,
  paragraphGap: 0.333,
  chapterStarts: 'right',
  chapterTopSpace: 0.82,
  chapterAfterSpace: 1.08,
  chapterTitleSize: 14,
  chapterTitleLineHeight: 1.12,
  chapterTitleAlignment: 'center',
  chapterLabelWeight: 700,
  chapterNameWeight: 400,
  pageNumberFontSize: 12,
  pageNumbers: 'outside-bottom',
  folioBottom: 0.45,
  folioOutsideInset: 0.35,
  numberFromFirstChapter: true,
  runningHeaders: false,
  runningHeaderMode: 'book-chapter',
  runningHeaderFontSize: 8,
  runningHeaderTop: 0.35,
  runningHeaderOutsideInset: 0.35,
  suppressHeaderOnChapterOpen: true,
  printToc: true,
  tocTitle: 'Table of Contents',
  tocIncludeBackMatter: true,
  tocTitleSize: 12,
  tocEntryFontSize: 10.5,
  tocLineHeight: 1.22,
  tocTopSpace: 0.05,
  tocAfterTitleSpace: 0.16,
});

export const CLASSIC_NOVEL_TEMPLATE = Object.freeze({
  ...TRES_AMIGOS_TEMPLATE,
  name: 'Classic Novel',
  description: 'A traditional serif 6×9 novel layout with restrained spacing and right-hand chapter openings.',
  templateId: 'classic-novel',
  insideMargin: 0.85,
  outsideMargin: 0.55,
  topMargin: 0.65,
  bottomMargin: 0.7,
  bodyFont: 'Georgia',
  bodyFontSize: 10.5,
  lineHeight: 1.28,
  firstLineIndent: 0.25,
  paragraphGap: 0,
  chapterTopSpace: 1.05,
  chapterAfterSpace: 0.65,
  chapterTitleSize: 18,
  pageNumberFontSize: 9,
  runningHeaders: true,
});

export const MODERN_ROMANCE_TEMPLATE = Object.freeze({
  ...TRES_AMIGOS_TEMPLATE,
  name: 'Modern Romance',
  description: 'Airier contemporary fiction styling with generous chapter openings and clean serif body text.',
  templateId: 'modern-romance',
  insideMargin: 0.9,
  outsideMargin: 0.6,
  topMargin: 0.7,
  bottomMargin: 0.75,
  bodyFont: 'Baskerville',
  bodyFontSize: 11,
  lineHeight: 1.30,
  firstLineIndent: 0.28,
  paragraphGap: 0,
  chapterTopSpace: 1.25,
  chapterAfterSpace: 0.8,
  chapterTitleSize: 20,
  pageNumberFontSize: 9,
  runningHeaders: false,
});

export const BUILT_IN_PRINT_THEMES = Object.freeze([
  TRES_AMIGOS_TEMPLATE,
  CLASSIC_NOVEL_TEMPLATE,
  MODERN_ROMANCE_TEMPLATE,
]);

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
  merged.chapterLabelWeight = number(merged.chapterLabelWeight, 700, 100, 900);
  merged.chapterNameWeight = number(merged.chapterNameWeight, 400, 100, 900);
  merged.pageNumberFontSize = number(merged.pageNumberFontSize, 12, 7, 18);
  merged.folioBottom = number(merged.folioBottom, 0.45, 0.15, 1.5);
  merged.folioOutsideInset = number(merged.folioOutsideInset, 0.35, 0.1, 1.5);
  merged.runningHeaderFontSize = number(merged.runningHeaderFontSize, 8, 6, 14);
  merged.runningHeaderTop = number(merged.runningHeaderTop, 0.35, 0.1, 1.5);
  merged.runningHeaderOutsideInset = number(merged.runningHeaderOutsideInset, 0.35, 0.1, 1.5);
  merged.chapterStarts = merged.chapterStarts === 'next' ? 'next' : 'right';
  merged.bodyFont = FONT_STACKS[merged.bodyFont] ? merged.bodyFont : 'Arial';
  merged.bodyAlignment = ['left','justify'].includes(merged.bodyAlignment) ? merged.bodyAlignment : 'left';
  merged.chapterTitleAlignment = ['left','center','right'].includes(merged.chapterTitleAlignment) ? merged.chapterTitleAlignment : 'center';
  merged.pageNumbers = merged.pageNumbers === 'none' ? 'none' : 'outside-bottom';
  merged.numberFromFirstChapter = merged.numberFromFirstChapter !== false;
  merged.runningHeaders = Boolean(merged.runningHeaders);
  merged.runningHeaderMode = ['book-chapter','author-book','book-author'].includes(merged.runningHeaderMode) ? merged.runningHeaderMode : 'book-chapter';
  merged.suppressHeaderOnChapterOpen = merged.suppressHeaderOnChapterOpen !== false;
  merged.printToc = merged.printToc !== false;
  merged.tocTitle = String(merged.tocTitle || 'Table of Contents').trim() || 'Table of Contents';
  merged.tocIncludeBackMatter = merged.tocIncludeBackMatter !== false;
  merged.tocTitleSize = number(merged.tocTitleSize, 12, 9, 24);
  merged.tocEntryFontSize = number(merged.tocEntryFontSize, 10.5, 7, 16);
  merged.tocLineHeight = number(merged.tocLineHeight, 1.22, 1, 2);
  merged.tocTopSpace = number(merged.tocTopSpace, 0.05, 0, 1.5);
  merged.tocAfterTitleSpace = number(merged.tocAfterTitleSpace, 0.16, 0, 1.5);
  merged.templateId = merged.templateId || 'custom';
  merged.name = merged.name || (merged.templateId === 'custom' ? 'Custom' : 'Print Theme');
  merged.description = merged.description || '';
  return merged;
}

export function builtInThemeById(templateId) {
  return BUILT_IN_PRINT_THEMES.find((theme) => theme.templateId === templateId) || null;
}

export function applyTemplate(templateId = 'tres-amigos-book1') {
  const theme = builtInThemeById(templateId);
  if (theme) return normalizePrintDesign({ ...theme });
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

const CALIBRATION_FIELDS = Object.freeze([
  ['trimWidth', 'Trim width', 'in'],
  ['trimHeight', 'Trim height', 'in'],
  ['insideMargin', 'Inside margin', 'in'],
  ['outsideMargin', 'Outside margin', 'in'],
  ['topMargin', 'Top margin', 'in'],
  ['bottomMargin', 'Bottom margin', 'in'],
  ['bodyFont', 'Body font', 'text'],
  ['bodyFontSize', 'Body size', 'pt'],
  ['lineHeight', 'Line height', 'x'],
  ['bodyAlignment', 'Body alignment', 'text'],
  ['firstLineIndent', 'First-line indent', 'in'],
  ['paragraphGap', 'Paragraph gap', 'in'],
  ['chapterTopSpace', 'Chapter top space', 'in'],
  ['chapterAfterSpace', 'Chapter after space', 'in'],
  ['chapterTitleSize', 'Chapter title size', 'pt'],
  ['chapterTitleAlignment', 'Chapter alignment', 'text'],
  ['pageNumberFontSize', 'Folio size', 'pt'],
  ['folioBottom', 'Folio bottom', 'in'],
  ['folioOutsideInset', 'Folio outside inset', 'in'],
  ['chapterStarts', 'Chapter starts', 'text'],
  ['pageNumbers', 'Page number placement', 'text'],
  ['printToc', 'Generated print TOC', 'text'],
  ['tocTitle', 'TOC title', 'text'],
  ['tocEntryFontSize', 'TOC entry size', 'pt'],
  ['tocIncludeBackMatter', 'TOC back matter', 'text'],
]);

export function compareDesignToTemplate(designInput, templateInput = TRES_AMIGOS_TEMPLATE) {
  const design = normalizePrintDesign(designInput);
  const template = normalizePrintDesign(templateInput);
  const rows = CALIBRATION_FIELDS.map(([key, label, unit]) => {
    const actual = design[key];
    const target = template[key];
    const numeric = typeof actual === 'number' && typeof target === 'number';
    const delta = numeric ? actual - target : null;
    const match = numeric ? Math.abs(delta) < 0.0001 : actual === target;
    return { key, label, unit, actual, target, delta, match };
  });
  const matches = rows.filter((row) => row.match).length;
  return {
    rows,
    matches,
    total: rows.length,
    percent: Math.round((matches / rows.length) * 100),
    exact: matches === rows.length,
  };
}
