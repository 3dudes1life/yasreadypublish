import { normalizeBarcodeBrain, KDP_BARCODE_MIN_HEIGHT_IN, KDP_BARCODE_MIN_WIDTH_IN, KDP_BARCODE_SAFE_IN } from './barcode-brain.js';
import { coverGeometry } from './cover-brain.js';
import { normalizePrintProduction, printEligibility } from './print-brain.js';
import { normalizePrintDesign } from './print-model.js';

export const AMAZON_PRINT_HARD_MODE_VERSION = 1;

function check(id, label, status, message, meta = {}) { return { id, label, status, message, ...meta }; }
function findAuditCheck(audit, id) { return audit?.checks?.find((item) => item.id === id) || null; }

function maxBlankRun(pages = []) {
  let best = 0; let current = 0; let start = null; let bestStart = null;
  pages.forEach((page, index) => {
    const blank = Boolean(page?.intentionalBlank || page?.barcodeSpacer);
    if (blank) {
      if (!current) start = index + 1;
      current += 1;
      if (current > best) { best = current; bestStart = start; }
    } else { current = 0; start = null; }
  });
  return { count:best, start:bestStart, end:bestStart ? bestStart + best - 1 : null };
}

function pageParityReport(pages = []) {
  const physical = [];
  const folios = [];
  pages.forEach((page, index) => {
    const physicalNumber = index + 1;
    const expectedSide = physicalNumber % 2 ? 'right' : 'left';
    if (Number(page?.number) !== physicalNumber || page?.side !== expectedSide) physical.push({ physicalNumber, actualNumber:page?.number, expectedSide, actualSide:page?.side });
    if (Number.isFinite(Number(page?.bookPageNumber))) {
      const folio = Number(page.bookPageNumber);
      const folioSide = folio % 2 ? 'right' : 'left';
      if (page.side !== folioSide) folios.push({ physicalNumber, folio, side:page.side, expectedSide:folioSide });
    }
  });
  return { physical, folios };
}

function barcodeGeometryCheck(geometry, placement = 'amazon') {
  if (placement !== 'yasready') return { ok:true, message:placement === 'amazon' ? 'Amazon barcode mode reserves the back-cover barcode region.' : 'YasReady is not placing a cover barcode.' };
  const box = geometry?.barcode;
  const back = geometry?.panels?.back;
  const spine = geometry?.panels?.spine;
  if (!box || !back || !spine) return { ok:false, message:'Barcode geometry is unavailable.' };
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const backRight = back.x + back.width;
  const backBottom = back.y + back.height;
  const spineDistance = spine.x - right;
  const outerTrimDistance = box.x - back.x;
  const bottomDistance = backBottom - bottom;
  const topDistance = box.y - back.y;
  const sizeOk = box.width + 1e-9 >= KDP_BARCODE_MIN_WIDTH_IN && box.height + 1e-9 >= KDP_BARCODE_MIN_HEIGHT_IN;
  const safeOk = [spineDistance, outerTrimDistance, bottomDistance, topDistance].every((distance) => distance + 1e-9 >= KDP_BARCODE_SAFE_IN);
  return {
    ok:sizeOk && safeOk,
    message:sizeOk && safeOk
      ? `${box.width.toFixed(2)} × ${box.height.toFixed(2)} in barcode is ≥0.25 in from spine/trim (${spineDistance.toFixed(3)} in spine, ${outerTrimDistance.toFixed(3)} in outer, ${bottomDistance.toFixed(3)} in bottom).`
      : `Barcode safe-zone failure: size ${box.width.toFixed(2)} × ${box.height.toFixed(2)} in; spine ${spineDistance.toFixed(3)} in, outer ${outerTrimDistance.toFixed(3)} in, bottom ${bottomDistance.toFixed(3)} in, top ${topDistance.toFixed(3)} in.`,
    sizeOk, safeOk, spineDistance, outerTrimDistance, bottomDistance, topDistance,
  };
}

export function runAmazonPrintHardMode({ project, type = 'paperback', preview = null, interiorAudit = null, coverAudit = null } = {}) {
  const edition = project?.editions?.[type] || {};
  const pages = preview?.pages || [];
  const pageCount = pages.length || Number(edition.lastPageCount) || 0;
  const design = normalizePrintDesign(preview?.design || edition.design || project?.design?.print || {});
  const production = normalizePrintProduction(edition.production || {}, type);
  const eligibility = printEligibility({ type, production, pageCount });
  const cover = coverGeometry({ type, production, pageCount, cover:edition.coverBrain || {} });
  const barcode = normalizeBarcodeBrain(edition.barcodeBrain || {});
  const parity = pageParityReport(pages);
  const blankRun = maxBlankRun(pages);
  const checks = [];

  checks.push(check('amazon-single-pages','Single-page interior PDF model',pages.length > 0 ? 'pass' : 'error',pages.length ? `${pages.length} individual physical pages; no 2-up/spread export.` : 'Build the final print pagination first.'));
  checks.push(check('amazon-physical-parity','Physical odd/right · even/left parity',parity.physical.length ? 'error' : 'pass',parity.physical.length ? `${parity.physical.length} physical page(s) have incorrect page number/side mapping.` : 'Every odd physical page is right/recto and every even physical page is left/verso.'));
  checks.push(check('amazon-folio-parity','Printed folio parity',parity.folios.length ? 'error' : 'pass',parity.folios.length ? `${parity.folios.length} printed page number(s) land on the wrong side for their odd/even value.` : 'Printed odd page numbers land on right pages and even page numbers on left pages.'));
  checks.push(check('amazon-blank-runs','Blank-page sanity',blankRun.count >= 3 ? 'warning' : 'pass',blankRun.count >= 3 ? `A run of ${blankRun.count} blank/spacer pages appears at physical ${blankRun.start}–${blankRun.end}. KDP rejects excessive blank pages; review this run before upload.` : blankRun.count ? `Longest blank/spacer run is ${blankRun.count} page(s).` : 'No consecutive blank-page run detected.'));

  const minFont = Math.min(design.bodyFontSize, design.chapterTitleSize, design.pageNumbers === 'none' ? Infinity : design.pageNumberFontSize, design.runningHeaders ? design.runningHeaderFontSize : Infinity);
  checks.push(check('amazon-min-font','Minimum 7 pt print text',minFont >= 7 ? 'pass' : 'error',`Smallest active print style is ${Number.isFinite(minFont) ? minFont : design.bodyFontSize} pt; KDP minimum is 7 pt.`));
  checks.push(check('amazon-page-range','KDP page-count eligibility',eligibility.pageCountOk ? 'pass' : 'error',eligibility.pageCountOk ? `${pageCount} pages are inside the modeled ${eligibility.range.min}–${eligibility.range.max} page range for this trim/ink/paper combination.` : `${pageCount} pages are outside the modeled KDP range. ${eligibility.range.reason}`));
  const insideOk = eligibility.requiredInside != null && design.insideMargin + 1e-9 >= eligibility.requiredInside;
  checks.push(check('amazon-inside-margin','Page-count-aware inside margin',insideOk ? 'pass' : 'error',eligibility.requiredInside == null ? 'KDP inside-margin requirement is unavailable until final page count is known.' : `${design.insideMargin.toFixed(3)} in set; modeled KDP minimum for ${pageCount} pages is ${eligibility.requiredInside.toFixed(3)} in.`));
  const outsideOk = design.outsideMargin + 1e-9 >= eligibility.requiredOutside;
  const topBottomOk = design.topMargin + 1e-9 >= eligibility.requiredTopBottom && design.bottomMargin + 1e-9 >= eligibility.requiredTopBottom;
  checks.push(check('amazon-outside-margins','Outside/top/bottom margins',outsideOk && topBottomOk ? 'pass' : 'error',`${production.bleed ? 'Bleed' : 'No-bleed'} interior requires at least ${eligibility.requiredOutside.toFixed(3)} in outside/top/bottom; current outside ${design.outsideMargin.toFixed(3)}, top ${design.topMargin.toFixed(3)}, bottom ${design.bottomMargin.toFixed(3)} in.`));

  const pdfHeader = findAuditCheck(interiorAudit,'pdf-header');
  const pdfPageCount = findAuditCheck(interiorAudit,'page-count');
  const pdfSize = findAuditCheck(interiorAudit,'page-size');
  const pdfImages = findAuditCheck(interiorAudit,'page-images');
  const pdfFonts = findAuditCheck(interiorAudit,'fonts');
  const pdfSecurity = findAuditCheck(interiorAudit,'encryption');
  const pdfAnnotations = findAuditCheck(interiorAudit,'annotations');
  const pdfInteractive = findAuditCheck(interiorAudit,'interactive');
  const pdfMarks = findAuditCheck(interiorAudit,'trim-marks');
  const pdfFileSize = findAuditCheck(interiorAudit,'file-size');
  checks.push(check('amazon-interior-container','Finished interior PDF container',interiorAudit?.ready && pdfHeader?.status === 'pass' && pdfPageCount?.status === 'pass' ? 'pass' : 'error',interiorAudit?.ready ? `${pageCount} finished PDF page objects are present.` : 'Build and audit the finished interior PDF.'));
  checks.push(check('amazon-trim-bleed','Exact trim / bleed page size',pdfSize?.status === 'pass' ? 'pass' : 'error',pdfSize?.status === 'pass' ? pdfSize.message : 'Finished PDF MediaBoxes must exactly match the selected trim/bleed dimensions.'));
  checks.push(check('amazon-300dpi','Interior raster resolution',pdfImages?.status === 'pass' ? 'pass' : 'error',pdfImages?.status === 'pass' ? pdfImages.message : 'Every rendered interior page must be 300 DPI.'));
  checks.push(check('amazon-interior-fonts','Interior font embedding/substitution risk',pdfFonts?.status === 'error' ? 'error' : pdfFonts?.status === 'warning' ? 'warning' : pdfFonts?.status === 'pass' ? 'pass' : 'error',pdfFonts?.message || 'Finished PDF font audit is unavailable.'));
  checks.push(check('amazon-interior-security','Interior PDF security / interaction',pdfSecurity?.status === 'pass' && pdfAnnotations?.status === 'pass' && pdfInteractive?.status === 'pass' ? 'pass' : 'error',pdfSecurity?.status === 'pass' && pdfAnnotations?.status === 'pass' && pdfInteractive?.status === 'pass' ? 'No encryption, annotations/comments, forms, scripts, open actions, or bookmarks detected in the finished interior PDF.' : 'Remove encryption, annotations/comments, forms, scripts, open actions, or bookmarks before KDP upload.'));
  checks.push(check('amazon-interior-marks','Crop/trim/template mark risk',pdfMarks?.status === 'warning' ? 'warning' : pdfMarks?.status === 'pass' ? 'pass' : 'error',pdfMarks?.message || 'Finished PDF mark audit is unavailable.'));
  checks.push(check('amazon-interior-filesize','Interior upload size',pdfFileSize?.status === 'pass' ? 'pass' : 'error',pdfFileSize?.message || 'Finished interior PDF size audit is unavailable.'));

  const coverGeometryCheck = coverAudit?.checks?.find((item) => ['uploaded-cover-geometry','page-size'].includes(item.id) && item.status === 'pass');
  checks.push(check('amazon-cover-one-page','Single-page cover wrap',coverAudit?.checks?.some((item) => item.id === 'uploaded-cover-one-page' && item.status === 'error') ? 'error' : coverAudit?.ready ? 'pass' : 'error',coverAudit?.ready ? 'One continuous cover PDF contains back + spine + front.' : 'Build/audit the final one-page cover PDF.'));
  checks.push(check('amazon-cover-geometry','Exact full-wrap cover geometry',coverAudit?.ready && (coverGeometryCheck || edition.coverMode !== 'upload-pdf') ? 'pass' : 'error',coverAudit?.ready ? `${cover.width.toFixed(4)} × ${cover.height.toFixed(4)} in final wrap is bound to ${pageCount} pages.` : 'Cover PDF must match the final page count, trim, paper, ink, and bleed geometry.'));
  checks.push(check('amazon-cover-bleed','0.125 in cover bleed',cover.exact && Math.abs(Number(cover.bleed || 0) - 0.125) < 0.0001 ? 'pass' : type === 'hardcover' ? 'pass' : 'error',type === 'paperback' ? `Paperback wrap includes ${Number(cover.bleed || 0).toFixed(3)} in bleed on the outer cover edges.` : 'Hardcover uses KDP case-laminate wrap geometry.'));
  const hasSpineText = Boolean(String(edition.coverBrain?.spineTitle || '').trim() || String(edition.coverBrain?.spineAuthor || '').trim());
  checks.push(check('amazon-spine-text','Spine text eligibility + safety',!hasSpineText || cover.spineTextAllowed ? 'pass' : 'error',!hasSpineText ? 'No spine text is configured.' : cover.spineTextAllowed ? `Spine text is allowed at ${pageCount} pages; Cover Brain reserves at least ${Number(cover.spineSafeInset || 0.0625).toFixed(4)} in from each spine edge.` : `Spine text is not allowed at ${pageCount} pages for this cover geometry.`));

  const securityErrors = coverAudit?.checks?.filter((item) => ['uploaded-cover-security','uploaded-cover-interactive','uploaded-cover-transparency','uploaded-cover-fonts'].includes(item.id) && item.status === 'error') || [];
  checks.push(check('amazon-cover-pdf-safety','Cover PDF safety / flattening',securityErrors.length ? 'error' : coverAudit?.ready ? 'pass' : 'error',securityErrors.length ? securityErrors.map((item)=>item.label).join(', ') : coverAudit?.ready ? 'Cover audit found no blocking security, annotation/form, transparency, or font-embedding issue.' : 'Final cover technical audit is incomplete.'));
  const coverImageCheck = findAuditCheck(coverAudit,'uploaded-cover-images') || findAuditCheck(coverAudit,'page-images') || findAuditCheck(coverAudit,'front-resolution');
  checks.push(check('amazon-cover-images','Cover raster resolution',coverImageCheck?.status === 'error' ? 'error' : coverImageCheck?.status === 'warning' ? 'warning' : coverImageCheck?.status === 'pass' ? 'pass' : 'warning',coverImageCheck?.message || 'Cover raster-image effective resolution could not be proven automatically; confirm image quality in KDP Print Previewer.'));

  const barcodeGeometry = barcodeGeometryCheck(cover, barcode.coverPlacement);
  checks.push(check('amazon-barcode-geometry','Barcode size + KDP safe distance',barcodeGeometry.ok ? 'pass' : 'error',barcodeGeometry.message));
  if (barcode.coverPlacement === 'yasready') {
    const vector = Boolean(coverAudit?.barcode?.vector || coverAudit?.checks?.some((item)=>item.id === 'barcode' && item.status === 'pass'));
    checks.push(check('amazon-barcode-rendering','Black-on-white vector barcode',vector ? 'pass' : 'error',vector ? 'YasReady barcode is a separate vector overlay on a solid white knockout, not flattened into the cover artwork.' : 'Build/stamp the final cover so the YasReady barcode can be certified as vector black-on-white output.'));
  } else if (barcode.coverPlacement === 'amazon') {
    checks.push(check('amazon-barcode-rendering','Amazon barcode reserve', 'pass','YasReady reserves the back-cover barcode area for Amazon.'));
  } else {
    checks.push(check('amazon-barcode-rendering','Cover barcode presence','warning','No back-cover barcode is configured. Confirm this is intentional before KDP upload.'));
  }

  const generatedCover = edition.coverMode !== 'upload-pdf';
  checks.push(check('amazon-cover-title','Front-cover title',String(project?.title || '').trim() && generatedCover ? 'pass' : generatedCover ? 'error' : 'warning',generatedCover ? (String(project?.title || '').trim() ? 'Generated Cover Brain front includes the project title.' : 'Project title is missing from the generated front cover.') : 'Uploaded cover artwork cannot be text-read safely in-browser; verify the visible title in YasReady/KDP Print Previewer.'));
  checks.push(check('amazon-cover-safe-content','Cover trim/safe-zone visual check',generatedCover ? 'pass' : 'warning',generatedCover ? 'Cover Brain positions generated critical text inside the modeled KDP safe zones.' : 'Uploaded artwork geometry is machine-checked, but visual text/graphic safe-zone placement must be confirmed in KDP Print Previewer.'));
  checks.push(check('amazon-no-physical-proof','Physical proof responsibility','pass','Physical proof inspection is intentionally outside YasReady’s release gate; the author owns that final physical-copy decision.'));

  const errors = checks.filter((item) => item.status === 'error').length;
  const warnings = checks.filter((item) => item.status === 'warning').length;
  return { ready:errors === 0, checks, summary:{errors,warnings,passes:checks.length-errors-warnings,total:checks.length}, pageCount, parity, blankRun, geometry:cover, version:AMAZON_PRINT_HARD_MODE_VERSION };
}
