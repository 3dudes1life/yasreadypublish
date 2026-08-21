import { normalizePrintDesign } from './print-model.js';

export const KDP_MARGIN_BANDS = Object.freeze([
  { min: 24, max: 150, inside: 0.375 },
  { min: 151, max: 300, inside: 0.5 },
  { min: 301, max: 500, inside: 0.625 },
  { min: 501, max: 700, inside: 0.75 },
  { min: 701, max: 828, inside: 0.875 },
]);

export function requiredInsideMargin(pageCount) {
  const count = Number(pageCount) || 0;
  return KDP_MARGIN_BANDS.find((band) => count >= band.min && count <= band.max)?.inside ?? null;
}

function check(id, label, status, message, meta = {}) {
  return { id, label, status, message, ...meta };
}

export function runKdpPreflight({ project, preview, storyLockOk = true } = {}) {
  const design = normalizePrintDesign(project?.design?.print || preview?.design || {});
  const pages = preview?.pages || [];
  const pageCount = pages.length;
  const requiredInside = requiredInsideMargin(pageCount);
  const imageCount = Number(project?.manuscript?.metadata?.imageCount || 0);
  const checks = [];

  checks.push(check(
    'story-lock',
    'Story Lock integrity',
    storyLockOk && preview?.integrity?.ok ? 'pass' : 'error',
    storyLockOk && preview?.integrity?.ok
      ? `Verified across ${preview.integrity.checkedBlocks || project?.manuscript?.blocks?.length || 0} source paragraphs.`
      : 'Source integrity is not verified. Export must remain blocked.',
  ));

  checks.push(check(
    'page-model',
    'Single-page interior model',
    pageCount ? 'pass' : 'error',
    pageCount ? `${pageCount} individual physical pages will export; no 2-up spreads.` : 'Build Print Preview before export.',
  ));

  checks.push(check(
    'trim',
    'Trim size',
    design.trimWidth === 6 && design.trimHeight === 9 ? 'pass' : 'warning',
    design.trimWidth === 6 && design.trimHeight === 9
      ? '6 × 9 in trim is ready for the standard KDP paperback selection.'
      : `${design.trimWidth} × ${design.trimHeight} in is custom in this build. Confirm the same trim size in KDP.`,
  ));

  checks.push(check(
    'page-count',
    'Paperback page count',
    pageCount >= 24 && pageCount <= 828 ? 'pass' : 'error',
    pageCount >= 24 && pageCount <= 828
      ? `${pageCount} pages is inside the 24–828 working range used by this KDP preflight.`
      : `${pageCount || 0} pages is outside the 24–828 working range used by this KDP preflight.`,
  ));

  checks.push(check(
    'inside-margin',
    'Inside binding margin',
    requiredInside == null ? 'error' : design.insideMargin + 1e-9 >= requiredInside ? 'pass' : 'error',
    requiredInside == null
      ? 'Required inside margin could not be determined for this page count.'
      : `${design.insideMargin.toFixed(3)} in set; KDP minimum for ${pageCount} pages is ${requiredInside.toFixed(3)} in.`,
    { required: requiredInside, actual: design.insideMargin },
  ));

  checks.push(check(
    'outside-margin',
    'Outside margin (no bleed)',
    design.outsideMargin + 1e-9 >= 0.25 ? 'pass' : 'error',
    `${design.outsideMargin.toFixed(3)} in set; KDP no-bleed minimum is 0.250 in.`,
  ));

  const smallestFont = Math.min(
    design.bodyFontSize,
    design.chapterTitleSize,
    design.pageNumbers === 'none' ? Infinity : design.pageNumberFontSize,
    design.runningHeaders ? design.runningHeaderFontSize : Infinity,
  );
  checks.push(check(
    'font-size',
    'Minimum text size',
    smallestFont >= 7 ? 'pass' : 'error',
    `Smallest active text style is ${Number.isFinite(smallestFont) ? smallestFont : design.bodyFontSize} pt; KDP minimum is 7 pt.`,
  ));

  checks.push(check(
    'images',
    'Interior images / bleed',
    imageCount === 0 ? 'pass' : 'error',
    imageCount === 0
      ? 'No DOCX image assets detected. The current print exporter produces a no-bleed text interior.'
      : `${imageCount} DOCX image asset(s) detected. Image/bleed production is intentionally blocked in the current print exporter.`,
  ));

  const chapterPages = pages.filter((page) => page.hasChapterTitle);
  const allRight = chapterPages.every((page) => page.side === 'right');
  checks.push(check(
    'chapter-parity',
    'Right-hand chapter starts',
    design.chapterStarts !== 'right' ? 'warning' : allRight ? 'pass' : 'error',
    design.chapterStarts !== 'right'
      ? 'Theme is configured to start chapters on the next available page.'
      : allRight
        ? `${chapterPages.length} chapter openings are on right-hand odd pages.`
        : 'One or more chapter openings are not on a right-hand odd page.',
  ));

  const blankLeaks = pages.filter((page) => page.intentionalBlank && (page.showRunningHeader || page.showFolio));
  checks.push(check(
    'blank-pages',
    'Intentional blank versos',
    blankLeaks.length ? 'error' : 'pass',
    blankLeaks.length
      ? `${blankLeaks.length} intentional blank page(s) contain header/folio presentation metadata.`
      : `${preview?.blankVersos || 0} intentional blank verso(s) stay truly blank in export.`,
  ));

  checks.push(check(
    'font-embedding',
    'Font embedding',
    'warning',
    'Browser PDF generation must embed the selected fonts. Confirm embedding in the exported PDF before KDP upload.',
  ));

  const errors = checks.filter((item) => item.status === 'error').length;
  const warnings = checks.filter((item) => item.status === 'warning').length;
  const passes = checks.filter((item) => item.status === 'pass').length;
  return {
    ready: errors === 0,
    checks,
    summary: { errors, warnings, passes, total: checks.length },
    pageCount,
    requiredInsideMargin: requiredInside,
    design,
    generatedAt: new Date().toISOString(),
  };
}
