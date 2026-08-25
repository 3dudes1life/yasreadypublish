import { fontStack, normalizePrintDesign } from './print-model.js';
import { normalizePrintProduction } from './print-brain.js';
import { runningHeaderText } from './structure-model.js';
import { printMatterStyleSpec } from './print-matter.js';
import { drawBarcodeToCanvas } from './barcode-brain.js';

export const PRINT_PDF_VERSION = 4;
export const PRINT_PDF_DPI = 300;
export const KDP_PRINT_FILE_LIMIT_BYTES = 650 * 1024 * 1024;

const enc = new TextEncoder();

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function ascii(text) { return enc.encode(String(text)); }

function formatPdfNumber(value) {
  const n = Number(value) || 0;
  return Number(n.toFixed(3)).toString();
}

function pageSizeInches(designInput, productionInput = {}) {
  const design = normalizePrintDesign(designInput);
  const production = normalizePrintProduction(productionInput, productionInput?.type || 'paperback');
  return {
    trimWidth: design.trimWidth,
    trimHeight: design.trimHeight,
    width: design.trimWidth + (production.bleed ? 0.125 : 0),
    height: design.trimHeight + (production.bleed ? 0.25 : 0),
    bleed: Boolean(production.bleed),
  };
}

function pdfImageObject(id, jpegBytes, widthPx, heightPx) {
  return [
    ascii(`${id} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`),
    jpegBytes,
    ascii(`\nendstream\nendobj\n`),
  ];
}

function pdfContentObject(id, imageId, widthPt, heightPt, overlayPdf = '') {
  const overlay = String(overlayPdf || '').trim();
  const content = `q\n${formatPdfNumber(widthPt)} 0 0 ${formatPdfNumber(heightPt)} 0 0 cm\n/Im0 Do\nQ\n${overlay ? `${overlay}\n` : ''}`;
  const bytes = ascii(content);
  return [ascii(`${id} 0 obj\n<< /Length ${bytes.length} >>\nstream\n`), bytes, ascii(`endstream\nendobj\n`)];
}

function pdfPageObject(id, parentId, imageId, contentId, widthPt, heightPt) {
  return ascii(`${id} 0 obj\n<< /Type /Page /Parent ${parentId} 0 R /MediaBox [0 0 ${formatPdfNumber(widthPt)} ${formatPdfNumber(heightPt)}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);
}

export function buildRasterPdf({ pages = [], pageWidthIn, pageHeightIn, dpi = PRINT_PDF_DPI } = {}) {
  if (!pages.length) throw new Error('At least one raster page is required to build a PDF.');
  const widthIn = Number(pageWidthIn);
  const heightIn = Number(pageHeightIn);
  if (!(widthIn > 0) || !(heightIn > 0)) throw new Error('A valid physical page size is required.');
  const widthPt = widthIn * 72;
  const heightPt = heightIn * 72;
  const catalogId = 1;
  const pagesId = 2;
  const objectCount = 2 + pages.length * 3;
  const offsets = new Array(objectCount + 1).fill(0);
  const parts = [];
  let byteOffset = 0;
  const push = (bytes) => { parts.push(bytes); byteOffset += bytes.length; };
  const pushObjectParts = (id, objectParts) => {
    offsets[id] = byteOffset;
    for (const part of objectParts) push(part);
  };

  push(ascii('%PDF-1.4\n%YasReadyPublish Print PDF Hard Mode\n'));
  pushObjectParts(catalogId, [ascii(`${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`)]);
  const pageIds = pages.map((_, index) => 5 + index * 3);
  pushObjectParts(pagesId, [ascii(`${pagesId} 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>\nendobj\n`)]);

  pages.forEach((page, index) => {
    const imageId = 3 + index * 3;
    const contentId = 4 + index * 3;
    const pageId = 5 + index * 3;
    if (!(page?.jpegBytes instanceof Uint8Array) || !page.jpegBytes.length) throw new Error(`Raster page ${index + 1} has no JPEG data.`);
    pushObjectParts(imageId, pdfImageObject(imageId, page.jpegBytes, page.widthPx, page.heightPx));
    pushObjectParts(contentId, pdfContentObject(contentId, imageId, widthPt, heightPt, page.overlayPdf || ''));
    pushObjectParts(pageId, [pdfPageObject(pageId, pagesId, imageId, contentId, widthPt, heightPt)]);
  });

  const xrefOffset = byteOffset;
  push(ascii(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`));
  for (let id = 1; id <= objectCount; id += 1) push(ascii(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`));
  push(ascii(`trailer\n<< /Size ${objectCount + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));
  const bytes = concatBytes(parts);
  return {
    bytes,
    metadata: {
      version: PRINT_PDF_VERSION,
      pageCount: pages.length,
      pageWidthIn: widthIn,
      pageHeightIn: heightIn,
      pageWidthPt: widthPt,
      pageHeightPt: heightPt,
      dpi,
      imageWidthPx: pages[0]?.widthPx || 0,
      imageHeightPx: pages[0]?.heightPx || 0,
      fileSize: bytes.length,
      rendering: '300-dpi-raster-page',
    },
  };
}

function containsAscii(bytes, needle) {
  const target = ascii(needle);
  if (!target.length || target.length > bytes.length) return false;
  outer: for (let i = 0; i <= bytes.length - target.length; i += 1) {
    for (let j = 0; j < target.length; j += 1) if (bytes[i + j] !== target[j]) continue outer;
    return true;
  }
  return false;
}

function countAscii(bytes, needle) {
  const target = ascii(needle);
  if (!target.length || target.length > bytes.length) return 0;
  let count = 0;
  outer: for (let i = 0; i <= bytes.length - target.length; i += 1) {
    for (let j = 0; j < target.length; j += 1) if (bytes[i + j] !== target[j]) continue outer;
    count += 1;
    i += target.length - 1;
  }
  return count;
}

function check(id, label, status, message) { return { id, label, status, message }; }

export function auditPrintPdfBytes(bytesInput, expected = {}) {
  const bytes = bytesInput instanceof Uint8Array ? bytesInput : new Uint8Array(bytesInput || []);
  const pageCount = Number(expected.pageCount) || 0;
  const pageWidthIn = Number(expected.pageWidthIn) || 0;
  const pageHeightIn = Number(expected.pageHeightIn) || 0;
  const dpi = Number(expected.dpi) || PRINT_PDF_DPI;
  const widthPt = formatPdfNumber(pageWidthIn * 72);
  const heightPt = formatPdfNumber(pageHeightIn * 72);
  const mediaBox = `/MediaBox [0 0 ${widthPt} ${heightPt}]`;
  const checks = [];
  checks.push(check('pdf-header', 'PDF file signature', containsAscii(bytes, '%PDF-1.4') ? 'pass' : 'error', containsAscii(bytes, '%PDF-1.4') ? 'PDF 1.4 production container detected.' : 'PDF signature is missing.'));
  checks.push(check('page-count', 'Physical page count', countAscii(bytes, '/Type /Page ') === pageCount ? 'pass' : 'error', `${countAscii(bytes, '/Type /Page ')} PDF page object(s) found; expected ${pageCount}.`));
  checks.push(check('page-size', 'Exact physical page size', countAscii(bytes, mediaBox) === pageCount ? 'pass' : 'error', `${pageWidthIn} × ${pageHeightIn} in MediaBox expected on all ${pageCount} pages.`));
  const expectedWidthPx = Math.round(pageWidthIn * dpi);
  const expectedHeightPx = Math.round(pageHeightIn * dpi);
  const imageGeometry = `/Width ${expectedWidthPx} /Height ${expectedHeightPx}`;
  const imageCount = countAscii(bytes, '/Filter /DCTDecode');
  const geometryCount = countAscii(bytes, imageGeometry);
  checks.push(check('page-images', '300 DPI page rendering', imageCount === pageCount && geometryCount === pageCount ? 'pass' : 'error', `${imageCount} raster page image(s), ${geometryCount} at ${expectedWidthPx} × ${expectedHeightPx}px; expected ${pageCount} page image(s) at ${dpi} DPI.`));
  checks.push(check('fonts', 'Font embedding risk', containsAscii(bytes, '/Font') ? 'warning' : 'pass', containsAscii(bytes, '/Font') ? 'Font objects were found and require embedding review.' : 'No PDF font objects exist: text is baked into 300 DPI page images, so font substitution cannot occur at KDP.'));
  checks.push(check('encryption', 'No PDF security / encryption', containsAscii(bytes, '/Encrypt') ? 'error' : 'pass', containsAscii(bytes, '/Encrypt') ? 'PDF encryption metadata was found.' : 'No encryption dictionary found.'));
  checks.push(check('annotations', 'No annotations / comments', containsAscii(bytes, '/Annots') ? 'error' : 'pass', containsAscii(bytes, '/Annots') ? 'PDF annotations were found.' : 'No annotation arrays found.'));
  const interactive = containsAscii(bytes, '/AcroForm') || containsAscii(bytes, '/JavaScript') || containsAscii(bytes, '/OpenAction') || containsAscii(bytes, '/Outlines');
  checks.push(check('interactive', 'No forms / scripts / bookmarks', interactive ? 'error' : 'pass', interactive ? 'Interactive/bookmark PDF structures were found and must be removed before KDP upload.' : 'No AcroForm, JavaScript, OpenAction, or bookmark-outline structures found.'));
  checks.push(check('trim-marks', 'No crop / trim mark objects', containsAscii(bytes, '/CropBox') || containsAscii(bytes, '/TrimBox') || containsAscii(bytes, '/BleedBox') ? 'warning' : 'pass', containsAscii(bytes, '/CropBox') || containsAscii(bytes, '/TrimBox') || containsAscii(bytes, '/BleedBox') ? 'Additional page boxes were found and should be reviewed.' : 'Only the production MediaBox is emitted; YasReady adds no crop or trim marks.'));
  checks.push(check('file-size', 'KDP file-size ceiling', bytes.length <= KDP_PRINT_FILE_LIMIT_BYTES ? 'pass' : 'error', `${(bytes.length / 1024 / 1024).toFixed(1)} MB · KDP print upload ceiling modeled at 650 MB.`));
  checks.push(check('eof', 'Complete PDF trailer', containsAscii(bytes.slice(Math.max(0, bytes.length - 64)), '%%EOF') ? 'pass' : 'error', containsAscii(bytes.slice(Math.max(0, bytes.length - 64)), '%%EOF') ? 'PDF cross-reference/trailer is closed.' : 'PDF end-of-file marker is missing.'));
  const errors = checks.filter((item) => item.status === 'error').length;
  const warnings = checks.filter((item) => item.status === 'warning').length;
  const passes = checks.filter((item) => item.status === 'pass').length;
  return { ready: errors === 0, checks, summary:{ errors, warnings, passes, total:checks.length }, fileSize:bytes.length, pageCount, pageWidthIn, pageHeightIn, dpi };
}

function sliceRuns(block, startOffset = 0, endOffset = null) {
  if (!block?.runs?.length) return [];
  const end = endOffset == null ? String(block.text || '').length : endOffset;
  let cursor = 0;
  const out = [];
  for (const run of block.runs) {
    const runText = String(run.text || '');
    const runStart = cursor;
    const runEnd = cursor + runText.length;
    cursor = runEnd;
    const overlapStart = Math.max(startOffset, runStart);
    const overlapEnd = Math.min(end, runEnd);
    if (overlapStart >= overlapEnd) continue;
    out.push({ ...run, text:runText.slice(overlapStart - runStart, overlapEnd - runStart), sourceStart:overlapStart - startOffset, sourceEnd:overlapEnd - startOffset });
  }
  return out;
}

function canvasFont(design, sizePt, { bold = false, italic = false, smallCaps = false } = {}) {
  const pieces = [];
  if (italic) pieces.push('italic');
  if (smallCaps) pieces.push('small-caps');
  pieces.push(bold ? '700' : '400');
  pieces.push(`${Math.max(1, sizePt) * (PRINT_PDF_DPI / 72)}px`);
  pieces.push(fontStack(design.bodyFont));
  return pieces.join(' ');
}

function plainCanvasFont(design, sizePt, options = {}) {
  const pieces = [];
  if (options.italic) pieces.push('italic');
  pieces.push(options.bold ? '700' : '400');
  pieces.push(`${Math.max(1, sizePt) * (PRINT_PDF_DPI / 72)}px`);
  pieces.push(fontStack(design.bodyFont));
  return pieces.join(' ');
}

function wrapOffsets(ctx, textInput, maxWidthPx, firstIndentPx = 0) {
  const text = String(textInput || '');
  if (!text) return [{ start:0, end:0, hardBreak:false }];
  const lines = [];
  let lineStart = 0;
  let cursor = 0;
  let lastBreak = -1;
  let lineWidth = 0;
  let first = true;
  const widthFor = (s) => ctx.measureText(s).width;
  while (cursor < text.length) {
    const ch = text[cursor];
    if (ch === '\n') {
      lines.push({ start:lineStart, end:cursor, hardBreak:true });
      cursor += 1;
      lineStart = cursor;
      lastBreak = -1;
      lineWidth = 0;
      first = false;
      continue;
    }
    if (/\s/.test(ch)) lastBreak = cursor;
    const segment = text.slice(lineStart, cursor + 1);
    const indent = first ? firstIndentPx : 0;
    lineWidth = widthFor(segment);
    if (lineWidth + indent > maxWidthPx && cursor > lineStart) {
      const cut = lastBreak >= lineStart ? lastBreak + 1 : cursor;
      const end = Math.max(lineStart + 1, cut);
      lines.push({ start:lineStart, end, hardBreak:false });
      lineStart = end;
      while (lineStart < text.length && text[lineStart] === ' ') lineStart += 1;
      cursor = lineStart;
      lastBreak = -1;
      lineWidth = 0;
      first = false;
      continue;
    }
    cursor += 1;
  }
  if (lineStart <= text.length) lines.push({ start:lineStart, end:text.length, hardBreak:false });
  return lines.filter((line, index) => line.end > line.start || index === 0);
}

export function runsForLocalRange(runs, start, end) {
  // IMPORTANT: no source runs means "draw the supplied visible line using the
  // fallback style". v1.0.37 returned a fake EMPTY run here. Title/copyright/
  // dedication intentionally flatten source styling and pass block=null, so that
  // fake run caused drawStyledLine() to paint absolutely nothing.
  if (!runs?.length) return [];
  const out = [];
  for (const run of runs) {
    const a = Math.max(start, run.sourceStart ?? 0);
    const b = Math.min(end, run.sourceEnd ?? 0);
    if (a >= b) continue;
    out.push({ ...run, text:String(run.text || '').slice(a - (run.sourceStart ?? 0), b - (run.sourceStart ?? 0)) });
  }
  return out;
}

function drawDecoratedSegment(ctx, text, x, baseline, style, sizePx) {
  if (!text) return 0;
  ctx.font = style.font;
  ctx.fillStyle = '#000';
  ctx.fillText(text, x, baseline);
  const width = ctx.measureText(text).width;
  if (style.underline) {
    ctx.beginPath(); ctx.lineWidth = Math.max(1, sizePx * 0.045); ctx.moveTo(x, baseline + sizePx * 0.08); ctx.lineTo(x + width, baseline + sizePx * 0.08); ctx.strokeStyle = '#000'; ctx.stroke();
  }
  if (style.strike) {
    ctx.beginPath(); ctx.lineWidth = Math.max(1, sizePx * 0.045); ctx.moveTo(x, baseline - sizePx * 0.3); ctx.lineTo(x + width, baseline - sizePx * 0.3); ctx.strokeStyle = '#000'; ctx.stroke();
  }
  return width;
}

function drawStyledLine(ctx, lineText, lineRuns, { x, baseline, maxWidth, alignment = 'left', justify = false, fontSizePt, design }) {
  const sizePx = fontSizePt * (PRINT_PDF_DPI / 72);
  const segments = [];
  for (const run of lineRuns?.length ? lineRuns : [{ text:lineText }]) {
    const bits = String(run.text || '').split(/(\s+)/).filter(Boolean);
    for (const bit of bits) {
      const font = canvasFont(design, fontSizePt, { bold:Boolean(run.bold), italic:Boolean(run.italic), smallCaps:Boolean(run.smallCaps) });
      ctx.font = font;
      segments.push({ text:bit, font, underline:Boolean(run.underline), strike:Boolean(run.strike), width:ctx.measureText(bit).width, isSpace:/^\s+$/.test(bit) });
    }
  }
  let total = segments.reduce((sum, segment) => sum + segment.width, 0);
  const spaces = segments.filter((segment) => segment.isSpace).length;
  let extra = justify && spaces && total < maxWidth ? (maxWidth - total) / spaces : 0;
  let startX = x;
  if (!justify && alignment === 'center') startX += Math.max(0, (maxWidth - total) / 2);
  if (!justify && alignment === 'right') startX += Math.max(0, maxWidth - total);
  let cursor = startX;
  for (const segment of segments) {
    if (!segment.isSpace) drawDecoratedSegment(ctx, segment.text, cursor, baseline, segment, sizePx);
    cursor += segment.width + (segment.isSpace ? extra : 0);
  }
  return cursor - startX;
}

function lineRunsForFragment(block, fragment, line) {
  const runs = sliceRuns(block, fragment.startOffset || 0, fragment.endOffset ?? String(block?.text || '').length);
  return runsForLocalRange(runs, line.start, line.end);
}

function fragmentInches(fragment) {
  return Math.max(0, Number(fragment?.measuredHeight || 0) / 96);
}

function visibleFragmentText(fragment = {}) {
  return String(fragment?.displayText ?? fragment?.text ?? '').trim();
}

function visiblePageFragments(page = {}) {
  return (page?.fragments || []).filter((fragment) =>
    fragment?.kind !== 'blank' && visibleFragmentText(fragment)
  );
}

function matterRolePhysicalPage(pages = [], role = '') {
  const index = pages.findIndex((page) =>
    (page?.fragments || []).some((fragment) => fragment?.matterRole === role)
  );
  return index >= 0 ? index + 1 : null;
}

export function auditPrintFrontMatterManifest(preview = {}) {
  const pages = preview?.pages || [];

  const rolePages = {
    title: matterRolePhysicalPage(pages, 'title'),
    copyright: matterRolePhysicalPage(pages, 'copyright'),
    dedication: matterRolePhysicalPage(pages, 'dedication'),
  };

  const completeTresAmigosFrontMatter = Object.values(rolePages).every(
    (page) => Number.isFinite(page)
  );

  // When all three semantic pages exist, this house style is not negotiable:
  // physical 1 title, physical 2 copyright, physical 3 dedication.
  const exactFrontSequence =
    !completeTresAmigosFrontMatter ||
    (
      rolePages.title === 1 &&
      rolePages.copyright === 2 &&
      rolePages.dedication === 3
    );

  const blankContentConflicts = pages
    .map((page, index) => ({ page, physical:index + 1 }))
    .filter(({ page }) =>
      page?.intentionalBlank && visiblePageFragments(page).length > 0
    );

  const tocIndex = pages.findIndex((page) =>
    (page?.fragments || []).some((fragment) =>
      fragment?.kind === 'generated-toc-title' ||
      fragment?.kind === 'generated-toc-entry'
    )
  );

  const tocPage = tocIndex >= 0 ? tocIndex + 1 : null;
  const configuredMatterPages = Object.values(rolePages).filter(Number.isFinite);
  const lastFrontMatterPage = configuredMatterPages.length
    ? Math.max(...configuredMatterPages)
    : null;

  const tocOrderOk =
    tocPage == null ||
    lastFrontMatterPage == null ||
    tocPage > lastFrontMatterPage;

  const checks = [
    check(
      'front-matter-sequence',
      'Semantic front-matter physical sequence',
      exactFrontSequence ? 'pass' : 'error',
      completeTresAmigosFrontMatter
        ? exactFrontSequence
          ? 'Title = physical 1, Copyright = physical 2, Dedication = physical 3.'
          : `Expected Title/Copyright/Dedication on physical 1/2/3; found ${rolePages.title ?? '—'}/${rolePages.copyright ?? '—'}/${rolePages.dedication ?? '—'}.`
        : 'The source does not contain all three semantic front-matter roles; exact Tres Amigos 1/2/3 enforcement is not required.'
    ),
    check(
      'intentional-blank-content',
      'Blank-page/content conflict',
      blankContentConflicts.length ? 'error' : 'pass',
      blankContentConflicts.length
        ? `${blankContentConflicts.length} page(s) are marked intentional blank while still containing visible book content: ${blankContentConflicts.map((item) => item.physical).join(', ')}.`
        : 'No content-bearing page is mislabeled as intentionally blank.'
    ),
    check(
      'front-matter-before-toc',
      'Front matter precedes Contents',
      tocOrderOk ? 'pass' : 'error',
      tocOrderOk
        ? tocPage == null
          ? 'No generated print Contents page is present.'
          : `Generated Contents begins on physical page ${tocPage}, after configured front matter.`
        : `Generated Contents begins on physical page ${tocPage} before front matter is complete.`
    ),
  ];

  const errors = checks.filter((item) => item.status === 'error').length;
  const warnings = checks.filter((item) => item.status === 'warning').length;

  return {
    ready: errors === 0,
    checks,
    summary:{
      errors,
      warnings,
      passes:checks.length - errors - warnings,
      total:checks.length,
    },
    rolePages,
    tocPage,
    blankContentConflicts:blankContentConflicts.map((item) => item.physical),
  };
}

function criticalContentLabel(page = {}) {
  const fragments = page?.fragments || [];
  const roles = new Set(fragments.map((fragment) => fragment?.matterRole).filter(Boolean));

  for (const role of ['title','copyright','dedication','about-authors','join-journey']) {
    if (roles.has(role)) return role;
  }

  if (fragments.some((fragment) =>
    fragment?.kind === 'generated-toc-title' ||
    fragment?.kind === 'generated-toc-entry'
  )) return 'Table of Contents';

  return '';
}

function rasterContentInkEvidence(ctx, canvas, { page, design, production } = {}) {
  const dpi = PRINT_PDF_DPI;
  const bleed = Boolean(production?.bleed);
  const isLeft = page?.side === 'left';

  const trimOffsetX = bleed && isLeft ? 0.125 * dpi : 0;
  const trimOffsetY = bleed ? 0.125 * dpi : 0;

  const leftMargin = (isLeft ? design.outsideMargin : design.insideMargin) * dpi;
  const x = Math.max(0, Math.floor(trimOffsetX + leftMargin));
  const y = Math.max(0, Math.floor(trimOffsetY + design.topMargin * dpi));

  const width = Math.max(
    1,
    Math.min(
      canvas.width - x,
      Math.floor(
        (design.trimWidth - design.insideMargin - design.outsideMargin) * dpi
      )
    )
  );

  const height = Math.max(
    1,
    Math.min(
      canvas.height - y,
      Math.floor(
        (design.trimHeight - design.topMargin - design.bottomMargin) * dpi
      )
    )
  );

  const image = ctx.getImageData(x, y, width, height);
  const step = 4;
  let darkSamples = 0;

  for (let py = 0; py < image.height; py += step) {
    for (let px = 0; px < image.width; px += step) {
      const i = (py * image.width + px) * 4;
      const r = image.data[i];
      const g = image.data[i + 1];
      const b = image.data[i + 2];

      if (r < 245 || g < 245 || b < 245) {
        darkSamples += 1;
        if (darkSamples >= 12) {
          return { ok:true, darkSamples };
        }
      }
    }
  }

  return { ok:false, darkSamples };
}


function rasterBottomMarginOverflowEvidence(ctx, canvas, { page, design, production, contentX=0, contentWidth=0, contentBottom=0, cursorOverflowPx=0, toleranceIn=0.02 } = {}) {
  const cursorOverflow=Math.max(0,Number(cursorOverflowPx)||0);
  if(cursorOverflow<=1 || page?.intentionalBlank || page?.barcodePage) return {ok:true,cursorOverflowPx:cursorOverflow,darkSamples:0,scanned:false};
  const dpi=PRINT_PDF_DPI;
  const bleed=Boolean(production?.bleed);
  const trimOffsetY=bleed ? 0.125*dpi : 0;
  const trimBottom=Math.min(canvas.height,Math.floor(trimOffsetY+design.trimHeight*dpi));
  const tolerancePx=Math.max(1,Math.round(Math.max(0,Number(toleranceIn)||0)*dpi));
  const y=Math.max(0,Math.min(trimBottom,Math.floor(contentBottom+tolerancePx)));
  const x=Math.max(0,Math.floor(contentX));
  const width=Math.max(1,Math.min(canvas.width-x,Math.floor(contentWidth)));
  const height=Math.max(0,trimBottom-y);
  if(!height) return {ok:true,cursorOverflowPx:cursorOverflow,darkSamples:0,scanned:false,tolerancePx};
  const image=ctx.getImageData(x,y,width,height);
  const step=2;
  let darkSamples=0;
  for(let py=0;py<image.height;py+=step){
    for(let px=0;px<image.width;px+=step){
      const i=(py*image.width+px)*4;
      const r=image.data[i],g=image.data[i+1],b=image.data[i+2];
      if(r<235||g<235||b<235){
        darkSamples+=1;
        if(visibleOverflowDecision({cursorOverflowPx:cursorOverflow,darkSamples})) return {ok:false,cursorOverflowPx:cursorOverflow,darkSamples,scanned:true,tolerancePx};
      }
    }
  }
  return {ok:true,cursorOverflowPx:cursorOverflow,darkSamples,scanned:true,tolerancePx};
}

export function matterPostDrawAdvance({ measuredHeightPx=0, topPx=0, bottomPx=0, drawnHeightPx=0 } = {}) {
  const allocatedInner=Math.max(0,Number(measuredHeightPx||0)-Number(topPx||0)-Number(bottomPx||0));
  return Math.max(allocatedInner,Number(drawnHeightPx||0))+Math.max(0,Number(bottomPx||0));
}

export function reconcileBodyAdvance({ measuredHeightPx=0, drawnHeightPx=0, tolerancePx=PRINT_PDF_DPI*0.02 } = {}) {
  const measured=Math.max(0,Number(measuredHeightPx)||0);
  const drawn=Math.max(0,Number(drawnHeightPx)||0);
  const tolerance=Math.max(0,Number(tolerancePx)||0);
  return drawn > measured + tolerance ? drawn : measured;
}

export function visibleOverflowDecision({ cursorOverflowPx=0, darkSamples=0 } = {}) {
  return Number(cursorOverflowPx||0)>1 && Number(darkSamples||0)>=3;
}

function drawWrappedFragment(ctx, fragment, block, design, { x, y, width, fontSizePt, lineHeight, alignment = 'left', firstIndentIn = 0, bold = false, italic = false, runsOverride = null } = {}) {
  const fontSize = Number(fontSizePt) || design.bodyFontSize;
  ctx.font = plainCanvasFont(design, fontSize, { bold, italic });
  const firstIndent = Math.max(0, Number(firstIndentIn) || 0) * PRINT_PDF_DPI;
  const lines = wrapOffsets(ctx, fragment.text || '', width, firstIndent);
  const lineHeightPx = fontSize * (PRINT_PDF_DPI / 72) * (Number(lineHeight) || design.lineHeight);
  const baselineOffset = fontSize * (PRINT_PDF_DPI / 72) * 0.82;
  lines.forEach((line, index) => {
    const localText = String(fragment.text || '').slice(line.start, line.end).replace(/\n/g, '');
    const indent = index === 0 ? firstIndent : 0;
    let lineRuns = runsOverride ? runsForLocalRange(runsOverride, line.start, line.end) : lineRunsForFragment(block, fragment, line);
    if (!lineRuns.length) lineRuns = [{ text:localText, bold, italic }];
    else if (bold || italic) lineRuns = lineRuns.map((run) => ({ ...run, bold:bold || Boolean(run.bold), italic:italic || Boolean(run.italic) }));
    const isLast = index === lines.length - 1;
    drawStyledLine(ctx, localText, lineRuns, {
      x:x + indent,
      baseline:y + baselineOffset + index * lineHeightPx,
      maxWidth:Math.max(1, width - indent),
      alignment,
      justify:alignment === 'justify' && !isLast && !line.hardBreak,
      fontSizePt:fontSize,
      design,
    });
  });
  return lines.length * lineHeightPx;
}

function drawTocEntry(ctx, fragment, design, x, y, width) {
  const sizePx = design.tocEntryFontSize * (PRINT_PDF_DPI / 72);
  const lineHeightPx = sizePx * design.tocLineHeight;
  ctx.font = plainCanvasFont(design, design.tocEntryFontSize);
  ctx.fillStyle = '#000';
  const pageText = String(fragment.tocPageNumber ?? '');
  const pageWidth = ctx.measureText(pageText).width;
  const label = String(fragment.tocTitle || fragment.text || '');
  const maxLabel = Math.max(10, width - pageWidth - 30);
  const lines = wrapOffsets(ctx, label, maxLabel, 0);
  const labelText = label.slice(lines[0]?.start || 0, lines[0]?.end ?? label.length).trimEnd();
  const baseline = y + sizePx * 0.82;
  ctx.fillText(labelText, x, baseline);
  ctx.fillText(pageText, x + width - pageWidth, baseline);
  const labelWidth = ctx.measureText(labelText).width;
  const dotStart = x + labelWidth + 12;
  const dotEnd = x + width - pageWidth - 12;
  if (dotEnd > dotStart) {
    ctx.save();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = Math.max(1, PRINT_PDF_DPI / 300);
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(dotStart, baseline - sizePx * 0.12);
    ctx.lineTo(dotEnd, baseline - sizePx * 0.12);
    ctx.stroke();
    ctx.restore();
  }
  return Math.max(lineHeightPx, fragmentInches(fragment) * PRINT_PDF_DPI);
}

function renderPreviewPageToCanvas(ctx, canvas, { page, design, project, production, blocksById }) {
  const dpi = PRINT_PDF_DPI;
  const bleed = Boolean(production?.bleed);
  const trimOffsetX = bleed && page.side === 'left' ? 0.125 * dpi : 0;
  const trimOffsetY = bleed ? 0.125 * dpi : 0;
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'alphabetic';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const isLeft = page.side === 'left';
  const leftMargin = (isLeft ? design.outsideMargin : design.insideMargin) * dpi;
  const contentX = trimOffsetX + leftMargin;
  const contentY = trimOffsetY + design.topMargin * dpi;
  const contentWidth = Math.max(1, (design.trimWidth - design.insideMargin - design.outsideMargin) * dpi);
  const contentBottom = trimOffsetY + (design.trimHeight - design.bottomMargin) * dpi;
  let y = contentY;

  if (!page.intentionalBlank && page.barcodePage && page.isbn) {
    // Match the established Tres Amigos print convention: the ISBN barcode is
    // the final left/even interior page, low on the outside edge, with the folio
    // continuing normally beneath it. This generated page is presentation-only.
    drawBarcodeToCanvas(ctx, page.isbn, {
      x:trimOffsetX + 0.75*dpi,
      y:trimOffsetY + Math.max(0.5, design.trimHeight - 1.95)*dpi,
      width:1.55*dpi,
      height:0.95*dpi,
      showIsbnLabel:true,
    });
  } else if (!page.intentionalBlank) {
    for (const fragment of page.fragments || []) {
      const heightPx = fragmentInches(fragment) * dpi;
      if (fragment.kind === 'blank') { y += heightPx; continue; }
      if (fragment.kind === 'generated-toc-title') {
        const top = design.tocTopSpace * dpi;
        const bottom = design.tocAfterTitleSpace * dpi;
        y += top;
        const fake = { ...fragment, text:fragment.text || design.tocTitle, startOffset:0, endOffset:String(fragment.text || design.tocTitle).length };
        drawWrappedFragment(ctx, fake, null, design, { x:contentX, y, width:contentWidth, fontSizePt:design.tocTitleSize, lineHeight:1.15, alignment:'center' });
        y += Math.max(0, heightPx - top - bottom) + bottom;
        continue;
      }
      if (fragment.kind === 'generated-toc-entry') {
        drawTocEntry(ctx, fragment, design, contentX, y, contentWidth);
        y += heightPx;
        continue;
      }
      const block = blocksById.get(fragment.sourceBlockId) || null;
      const matterSpec = printMatterStyleSpec(fragment.kind, design);
      if (matterSpec) {
        const top = (matterSpec.paddingTopIn || 0) * dpi;
        const bottom = (matterSpec.paddingBottomIn || 0) * dpi;
        y += top;
        const visible = String(fragment.displayText ?? fragment.text ?? '');
        const preserveMatterRuns = ['matter-back-heading','matter-back-body'].includes(fragment.kind);
        const fake = preserveMatterRuns ? { ...fragment, text:visible } : { ...fragment, text:visible, startOffset:0, endOffset:visible.length };
        const drawnHeight=drawWrappedFragment(ctx, fake, preserveMatterRuns ? block : null, design, { x:contentX, y, width:contentWidth, fontSizePt:matterSpec.fontSizePt, lineHeight:matterSpec.lineHeight, alignment:matterSpec.alignment, bold:matterSpec.bold, italic:matterSpec.italic });
        // DOM pagination and 300-DPI canvas wrapping can differ by a line when
        // back matter contains bold/italic inline runs. Advance by whichever
        // height is larger so the next paragraph can never paint on top of it.
        y += matterPostDrawAdvance({ measuredHeightPx:heightPx, topPx:top, bottomPx:bottom, drawnHeightPx:drawnHeight });
        continue;
      }
      if (fragment.kind === 'chapter-title') {
        const top = design.chapterTopSpace * dpi;
        const bottom = design.chapterAfterSpace * dpi;
        y += top;
        const chapterText = String(fragment.text || '');
        const chapterMatch = chapterText.match(/^(Chapter\s+(?:\d+|[IVXLCDM]+):?)(\s*)(.*)$/i);
        let chapterRuns = null;
        if (chapterMatch) {
          const first = `${chapterMatch[1]}${chapterMatch[2]}`;
          chapterRuns = [
            { text:first, sourceStart:0, sourceEnd:first.length, bold:Number(design.chapterLabelWeight) >= 600 },
            { text:chapterMatch[3], sourceStart:first.length, sourceEnd:chapterText.length, bold:Number(design.chapterNameWeight) >= 600 },
          ];
        }
        drawWrappedFragment(ctx, fragment, block, design, { x:contentX, y, width:contentWidth, fontSizePt:design.chapterTitleSize, lineHeight:design.chapterTitleLineHeight, alignment:design.chapterTitleAlignment, runsOverride:chapterRuns });
        y += Math.max(0, heightPx - top - bottom) + bottom;
        continue;
      }
      if (fragment.kind === 'scene-break') {
        y += 0.12 * dpi;
        drawWrappedFragment(ctx, fragment, block, design, { x:contentX, y, width:contentWidth, fontSizePt:design.bodyFontSize, lineHeight:design.lineHeight, alignment:'center' });
        y += Math.max(0, heightPx - 0.24 * dpi) + 0.12 * dpi;
        continue;
      }
      if (fragment.kind === 'front-back-heading' || fragment.kind === 'heading') {
        y += 0.12 * dpi;
        drawWrappedFragment(ctx, fragment, block, design, { x:contentX, y, width:contentWidth, fontSizePt:design.bodyFontSize * 1.15, lineHeight:design.lineHeight, alignment:'left', bold:true });
        y += Math.max(0, heightPx - 0.20 * dpi) + 0.08 * dpi;
        continue;
      }
      const indent = fragment.kind === 'body' && !fragment.continuation && !fragment.suppressIndent ? design.firstLineIndent : 0;
      const alignment = fragment.kind === 'body' ? design.bodyAlignment : fragment.kind === 'text-message' ? 'left' : 'left';
      const drawnBodyHeight=drawWrappedFragment(ctx, fragment, block, design, { x:contentX, y, width:contentWidth, fontSizePt:design.bodyFontSize, lineHeight:design.lineHeight, alignment, firstIndentIn:indent });
      y += reconcileBodyAdvance({ measuredHeightPx:heightPx, drawnHeightPx:drawnBodyHeight });
    }
  }

  // v1.0.40: cursor math is diagnostic; actual raster ink is the blocker.
  // Audit before running headers/folios so page furniture cannot create a false overflow.
  const cursorOverflowPx=Math.max(0,y-contentBottom);
  const overflowEvidence=rasterBottomMarginOverflowEvidence(ctx,canvas,{page,design,production,contentX,contentWidth,contentBottom,cursorOverflowPx});

  if (!page.intentionalBlank && design.runningHeaders && page.showRunningHeader) {
    const headerText = runningHeaderText({ side:page.side, projectTitle:project.title || '', author:project.author || '', chapterTitle:page.chapterTitle || '', mode:design.runningHeaderMode });
    if (headerText) {
      ctx.font = plainCanvasFont(design, design.runningHeaderFontSize);
      ctx.fillStyle = '#222';
      const baseline = trimOffsetY + design.runningHeaderTop * dpi + design.runningHeaderFontSize * (dpi / 72) * 0.82;
      const widthPx = ctx.measureText(headerText).width;
      const hx = isLeft
        ? trimOffsetX + design.runningHeaderOutsideInset * dpi
        : trimOffsetX + design.trimWidth * dpi - design.runningHeaderOutsideInset * dpi - widthPx;
      ctx.fillText(headerText, hx, baseline);
    }
  }

  if (!page.intentionalBlank && design.pageNumbers !== 'none' && page.bookPageNumber != null) {
    const text = String(page.bookPageNumber);
    ctx.font = plainCanvasFont(design, design.pageNumberFontSize);
    ctx.fillStyle = '#111';
    const widthPx = ctx.measureText(text).width;
    const baseline = trimOffsetY + design.trimHeight * dpi - design.folioBottom * dpi;
    const fx = isLeft
      ? trimOffsetX + design.folioOutsideInset * dpi
      : trimOffsetX + design.trimWidth * dpi - design.folioOutsideInset * dpi - widthPx;
    ctx.fillText(text, fx, baseline);
  }
  ctx.restore();
  return { finalY:y, contentBottom, overflowPx:cursorOverflowPx, overflowEvidence };
}

function canvasToJpegBytes(canvas, quality = 0.98) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error('The browser could not encode a print page as JPEG.')); return; }
      try { resolve(new Uint8Array(await blob.arrayBuffer())); } catch (error) { reject(error); }
    }, 'image/jpeg', quality);
  });
}

export async function renderProductionPrintPdf({ project, preview, editionType = 'paperback', production:productionInput = {}, dpi = PRINT_PDF_DPI, onProgress = null } = {}) {
  if (!project || !preview?.pages?.length) throw new Error('Build the frozen print preview before creating a production PDF.');
  if (typeof document === 'undefined') throw new Error('Production PDF rendering requires a browser canvas.');
  if (dpi !== PRINT_PDF_DPI) throw new Error(`Print PDF Hard Mode requires ${PRINT_PDF_DPI} DPI.`);
  const design = normalizePrintDesign(preview.design || project.design?.print || {});
  const production = normalizePrintProduction({ ...productionInput, type:editionType }, editionType);
  const size = pageSizeInches(design, { ...production, type:editionType });
  const widthPx = Math.round(size.width * dpi);
  const heightPx = Math.round(size.height * dpi);
  if (widthPx < 1 || heightPx < 1 || widthPx > 5000 || heightPx > 5000) throw new Error('The selected trim/bleed size is outside YasReady’s safe 300 DPI canvas range.');
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d', { alpha:false, willReadFrequently:false });
  if (!ctx) throw new Error('Canvas rendering is unavailable in this browser.');
  const blocksById = new Map((project.manuscript?.blocks || []).map((block) => [block.id, block]));

  // Semantic page order is checked BEFORE expensive 300-DPI manufacture.
  const fidelityManifest = auditPrintFrontMatterManifest(preview);
  if (!fidelityManifest.ready) {
    const blockers = fidelityManifest.checks
      .filter((item) => item.status === 'error')
      .map((item) => item.message)
      .join(' ');
    throw new Error(`Print Fidelity blocked PDF manufacture. ${blockers}`);
  }

  const certifiedRasterPages = [];
  const rasterPages = [];
  for (let index = 0; index < preview.pages.length; index += 1) {
    const page = preview.pages[index];
    const pageFlow=renderPreviewPageToCanvas(ctx, canvas, { page, design, project, production, blocksById });
    if (pageFlow?.overflowEvidence?.ok === false) {
      throw new Error(`Print Fidelity blocked export: physical page ${index + 1} painted visible manuscript content below the safe content box after real 300-DPI rendering (cursor drift ${(pageFlow.overflowPx/PRINT_PDF_DPI).toFixed(3)} in).`);
    }

    // Container geometry is not enough. For semantic book-matter pages, prove
    // that the actual canvas contains visible ink BEFORE JPEG/PDF packaging.
    const criticalLabel = criticalContentLabel(page);
    if (criticalLabel) {
      const evidence = rasterContentInkEvidence(ctx, canvas, {
        page,
        design,
        production,
      });

      if (!evidence.ok) {
        throw new Error(
          `Print Fidelity blocked export: physical page ${index + 1} (${criticalLabel}) rendered without visible content.`
        );
      }

      certifiedRasterPages.push({
        physicalPage:index + 1,
        label:criticalLabel,
        darkSamples:evidence.darkSamples,
      });
    }

    const jpegBytes = await canvasToJpegBytes(canvas, 0.98);
    rasterPages.push({ jpegBytes, widthPx, heightPx });
    if (onProgress) onProgress({ page:index + 1, total:preview.pages.length, phase:'render' });
    if (index % 3 === 2) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const built = buildRasterPdf({ pages:rasterPages, pageWidthIn:size.width, pageHeightIn:size.height, dpi });
  const byteAudit = auditPrintPdfBytes(built.bytes, {
    pageCount:preview.pages.length,
    pageWidthIn:size.width,
    pageHeightIn:size.height,
    dpi,
  });

  const contentCheck = check(
    'content-fidelity',
    'Rendered book-content fidelity',
    'pass',
    `Semantic front matter passed physical-order checks and ${certifiedRasterPages.length} critical page(s) were proven to contain visible raster content.`
  );

  const checks = [contentCheck, ...byteAudit.checks];
  const errors = checks.filter((item) => item.status === 'error').length;
  const warnings = checks.filter((item) => item.status === 'warning').length;

  const audit = {
    ...byteAudit,
    ready:errors === 0,
    checks,
    summary:{
      errors,
      warnings,
      passes:checks.length - errors - warnings,
      total:checks.length,
    },
    contentFidelity:{
      ready:true,
      manifest:fidelityManifest,
      certifiedRasterPages,
    },
  };

  return {
    bytes:built.bytes,
    blob:new Blob([built.bytes], { type:'application/pdf' }),
    audit,
    metadata:{ ...built.metadata, editionType, trimWidthIn:design.trimWidth, trimHeightIn:design.trimHeight, bleed:size.bleed },
  };
}
