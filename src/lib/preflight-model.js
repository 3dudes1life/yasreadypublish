import { normalizePrintDesign } from './print-model.js';
import { shouldGeneratePrintToc, verifyGeneratedPrintToc } from './print-toc.js';
import { effectiveStats } from './structure-overrides.js';
import { verifyPreviewProof } from './proof-integrity.js';
import { printEligibility } from './print-brain.js';

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

export function isExpectedStructuralEmptyPage(page = {}) {
  return Boolean(
    page?.intentionalBlank ||
    page?.barcodeSpacer === true ||
    page?.blankReason === 'barcode-left-alignment'
  );
}

export function runKdpPreflight({ project, preview, storyLockOk = true, editionType = 'paperback' } = {}) {
  // Validate the frozen proof design first. Current project settings are checked separately
  // by the proof-ownership gate so a stale preview can never pass export.
  const design = normalizePrintDesign(preview?.design || project?.design?.print || {});
  const pages = preview?.pages || [];
  const pageCount = pages.length;
  const requiredInside = requiredInsideMargin(pageCount);
  const imageCount = Number(project?.manuscript?.metadata?.imageCount || 0);
  const stats = effectiveStats(project);
  const tocMode = shouldGeneratePrintToc(project, design);
  const tocIntegrity = verifyGeneratedPrintToc({ project, preview, design });
  const checks = [];
  const isHardcover = editionType === 'hardcover';
  const editionLabel = isHardcover ? 'Hardcover' : 'Paperback';
  const minPages = isHardcover ? 75 : 24;
  const maxPages = isHardcover ? 550 : 828;
  const proofOwnership = verifyPreviewProof({ project, preview, editionType });
  const storedProduction = project?.editions?.[editionType]?.production || {};
  const production = storedProduction?.configured
    ? storedProduction
    : { ...storedProduction, trimId:'custom', trimWidth:design.trimWidth, trimHeight:design.trimHeight };
  const printBrain = printEligibility({ type:editionType, production, pageCount });

  checks.push(check(
    'proof-ownership',
    'Frozen proof belongs to this edition',
    proofOwnership.ok ? 'pass' : 'error',
    proofOwnership.ok
      ? `This preview is signed to the current ${editionLabel.toLowerCase()} settings and Story-Locked manuscript.`
      : proofOwnership.reason === 'wrong-edition'
        ? `This preview belongs to ${proofOwnership.actual || 'another edition'}, not ${editionType}. Rebuild this edition before export.`
        : 'The manuscript, structure, metadata, or design changed after this proof was built. Rebuild before export.',
  ));

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

  const trimSupported = printBrain.range.available;
  checks.push(check(
    'trim',
    'KDP trim / manufacturing option',
    trimSupported ? 'pass' : 'error',
    trimSupported
      ? `${printBrain.production.trimWidth} × ${printBrain.production.trimHeight} in · ${printBrain.production.ink} ink · ${printBrain.production.paper} paper is available for this ${editionLabel.toLowerCase()} profile.`
      : printBrain.range.reason,
  ));

  checks.push(check(
    'page-count',
    `${editionLabel} page count`,
    printBrain.pageCountOk ? 'pass' : 'error',
    printBrain.pageCountOk
      ? pageCount ? `${pageCount} pages is inside the ${printBrain.range.min}–${printBrain.range.max} KDP range for this exact print profile.` : printBrain.range.reason
      : `${pageCount || 0} pages is outside the ${printBrain.range.min}–${printBrain.range.max} KDP range for this exact print profile.`,
  ));

  checks.push(check(
    'even-page-count',
    'Even physical page count',
    pageCount > 0 && pageCount % 2 === 0 ? 'pass' : 'error',
    pageCount > 0 && pageCount % 2 === 0
      ? `${pageCount} physical pages form complete front/back sheets.`
      : 'Print books require an even physical page count. Rebuild the proof so YasReady can add a controlled terminal blank page.',
  ));

  checks.push(check(
    'inside-margin',
    'Inside binding margin',
    printBrain.requiredInside == null ? 'error' : design.insideMargin + 1e-9 >= printBrain.requiredInside ? 'pass' : 'error',
    printBrain.requiredInside == null
      ? 'Required inside margin could not be determined for this page count.'
      : `${design.insideMargin.toFixed(3)} in set; KDP minimum for ${pageCount} pages is ${printBrain.requiredInside.toFixed(3)} in.`,
    { required: printBrain.requiredInside, actual: design.insideMargin },
  ));

  checks.push(check(
    'outside-margin',
    `Outside margin (${printBrain.production.bleed ? 'bleed' : 'no bleed'})`,
    design.outsideMargin + 1e-9 >= printBrain.requiredOutside ? 'pass' : 'error',
    `${design.outsideMargin.toFixed(3)} in set; KDP minimum for this bleed setting is ${printBrain.requiredOutside.toFixed(3)} in.`,
  ));

  checks.push(check(
    'top-bottom-margins',
    'Top / bottom margins',
    design.topMargin + 1e-9 >= printBrain.requiredTopBottom && design.bottomMargin + 1e-9 >= printBrain.requiredTopBottom ? 'pass' : 'error',
    `${design.topMargin.toFixed(3)} in top / ${design.bottomMargin.toFixed(3)} in bottom; KDP minimum for this bleed setting is ${printBrain.requiredTopBottom.toFixed(3)} in.`,
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



  const blankContentConflicts = pages.filter((page) =>
    page?.intentionalBlank &&
    (page?.fragments || []).some((fragment) =>
      fragment?.kind !== 'blank' &&
      String(fragment?.displayText ?? fragment?.text ?? '').trim()
    )
  );

  checks.push(check(
    'intentional-blank-content',
    'Blank pages contain no book content',
    blankContentConflicts.length ? 'error' : 'pass',
    blankContentConflicts.length
      ? `${blankContentConflicts.length} page(s) are marked intentional blank but still contain visible layout fragments.`
      : 'Every intentionally blank page is genuinely content-free.',
  ));

  const matterPhysicalPage = (role) => {
    const index = pages.findIndex((page) =>
      (page?.fragments || []).some((fragment) => fragment?.matterRole === role)
    );
    return index >= 0 ? index + 1 : null;
  };

  const semanticFrontMatterPages = {
    title:matterPhysicalPage('title'),
    copyright:matterPhysicalPage('copyright'),
    dedication:matterPhysicalPage('dedication'),
  };

  const hasCompleteSemanticFrontMatter = Object.values(
    semanticFrontMatterPages
  ).every(Number.isFinite);

  const semanticFrontMatterExact =
    !hasCompleteSemanticFrontMatter ||
    (
      semanticFrontMatterPages.title === 1 &&
      semanticFrontMatterPages.copyright === 2 &&
      semanticFrontMatterPages.dedication === 3
    );

  checks.push(check(
    'front-matter-sequence',
    'Title · Copyright · Dedication physical order',
    semanticFrontMatterExact ? 'pass' : 'error',
    hasCompleteSemanticFrontMatter
      ? semanticFrontMatterExact
        ? 'Physical 1 = Title · Physical 2 = Copyright · Physical 3 = Dedication.'
        : `Expected physical 1/2/3; found ${semanticFrontMatterPages.title}/${semanticFrontMatterPages.copyright}/${semanticFrontMatterPages.dedication}.`
      : 'Exact 1/2/3 enforcement activates when all three semantic front-matter pages are present.',
  ));

  checks.push(check(
    'print-toc',
    'Automatic print Table of Contents',
    tocMode.reason === 'source-toc-detected' ? 'warning' : tocIntegrity.ok ? 'pass' : 'error',
    tocMode.reason === 'disabled'
      ? 'Generated print TOC is turned off.'
      : tocMode.reason === 'source-toc-detected'
        ? 'A source Table of Contents is already present in the DOCX. YasReady will not add a second one or remove source text; remove the manual TOC from the master DOCX if you want generated page numbers.'
        : tocIntegrity.ok
          ? `${tocIntegrity.entries} generated TOC entries match the final printed page map.`
          : 'Generated TOC page numbers do not match final pagination. Rebuild Print Preview before export.',
  ));

  checks.push(check(
    'structure-repair',
    'Structure repair metadata',
    'pass',
    `${stats.structureOverrides || 0} paragraph classification override(s) are applied as metadata only. Story text remains unchanged.`,
  ));

  const structuralEmpty = pages.filter((page) => isExpectedStructuralEmptyPage(page) && !(page.fragments || []).length);
  const unexpectedEmpty = pages.filter((page) => !isExpectedStructuralEmptyPage(page) && !(page.fragments || []).length);
  checks.push(check(
    'unexpected-empty-pages',
    'Unexpected empty pages',
    unexpectedEmpty.length ? 'error' : 'pass',
    unexpectedEmpty.length
      ? `${unexpectedEmpty.length} unexplained physical page(s) contain no layout fragments.`
      : structuralEmpty.length
        ? `No unexplained empty pages. ${structuralEmpty.length} generated structural spacer page(s) are intentionally content-free for final-page parity.`
        : 'No unexplained empty physical pages were found.',
    { structuralEmptyPages:structuralEmpty.map((page) => page.number) },
  ));

  const tableCount = Number(project?.manuscript?.metadata?.tableCount || 0);
  checks.push(check(
    'word-tables',
    'Word tables',
    tableCount ? 'warning' : 'pass',
    tableCount ? `${tableCount} Word table(s) were detected. Paragraph text is preserved, but table grid layout is not reproduced by the v1.0 fiction formatter.` : 'No Word table structures detected.',
  ));

  const manualBreaks = Number(project?.manuscript?.metadata?.manualPageBreakCount || 0);
  checks.push(check(
    'manual-page-breaks',
    'Manual Word page breaks',
    manualBreaks ? 'warning' : 'pass',
    manualBreaks ? `${manualBreaks} manual Word page break(s) were detected. YasReady repaginates from book rules instead of honoring Word page positions.` : 'No manual Word page breaks detected.',
  ));

  const fieldCount = Number(project?.manuscript?.metadata?.fieldCount || 0);
  checks.push(check(
    'word-fields',
    'Word fields',
    fieldCount ? 'warning' : 'pass',
    fieldCount ? `${fieldCount} Word field instruction(s) were detected. Review Source/Print Preview because dynamic Word fields are flattened to their visible text.` : 'No Word field instructions detected.',
  ));

  checks.push(check(
    'font-embedding',
    'Font substitution protection',
    'pass',
    'Print PDF Hard Mode rasterizes each finished page at 300 DPI, so the KDP interior contains no live font objects that can be substituted or left unembedded.',
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
    editionType,
    generatedAt: new Date().toISOString(),
  };
}
