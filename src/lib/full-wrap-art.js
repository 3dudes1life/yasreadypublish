import { buildRasterPdf, auditPrintPdfBytes, PRINT_PDF_DPI } from './print-pdf.js';
import { paperbackSpineFactor } from './cover-brain.js';
import { barcodePdfVectorCommands, normalizeBarcodeBrain, normalizePrintIsbn } from './barcode-brain.js';

export const FULL_WRAP_ART_VERSION = 1;

function clamp(n, min, max) { return Math.min(max, Math.max(min, Number(n) || 0)); }

export function normalizeFullWrapArtwork(input = null) {
  if (!input || typeof input !== 'object' || !input.dataUrl) return null;
  const mimeType = ['image/jpeg','image/png'].includes(String(input.mimeType || '')) ? String(input.mimeType) : '';
  if (!mimeType) return null;
  return {
    fileName:String(input.fileName || 'full-wrap-art').slice(0,220),
    mimeType,
    fileSize:Number(input.fileSize) || 0,
    width:Number(input.width) || 0,
    height:Number(input.height) || 0,
    dataUrl:String(input.dataUrl),
    sha256:String(input.sha256 || ''),
    updatedAt:input.updatedAt || null,
  };
}

export function analyzeFullWrapArtwork({ asset, geometry, production = {}, pageCount = 0 } = {}) {
  const a = normalizeFullWrapArtwork(asset);
  const checks = [];
  if (!a || !(a.width > 0) || !(a.height > 0)) {
    checks.push({ id:'wrap-art-file', status:'error', label:'Finished full-wrap artwork', message:'Attach the original full-wrap JPG or PNG, not a screenshot or a letter-size PDF wrapper.' });
    return { ready:false, checks, asset:a, inferred:null, version:FULL_WRAP_ART_VERSION };
  }
  const targetHeight = Number(geometry?.height) || 0;
  const trimWidth = Number(geometry?.trimWidth) || 0;
  if (geometry?.type && geometry.type !== 'paperback') {
    checks.push({ id:'wrap-art-format', status:'error', label:'Flattened-wrap adapter', message:'Automatic finished-artwork spine adaptation is currently limited to paperback. Hardcover case-laminate geometry must use a final KDP PDF or YasReady Cover Brain.' });
    return { ready:false, checks, asset:a, inferred:null, version:FULL_WRAP_ART_VERSION };
  }
  const bleed = Number(geometry?.bleed) || 0;
  const targetWidth = Number(geometry?.width) || 0;
  const targetSpine = Number(geometry?.spineWidth) || 0;
  const panelWithOuterBleed = trimWidth + bleed;
  const ratio = a.width / a.height;
  const sourceWidthIn = targetHeight > 0 ? targetHeight * ratio : 0;
  const sourceSpineIn = sourceWidthIn - 2 * panelWithOuterBleed;
  const ppiX = sourceWidthIn > 0 ? a.width / sourceWidthIn : 0;
  const ppiY = targetHeight > 0 ? a.height / targetHeight : 0;
  const effectivePpi = Math.min(ppiX || Infinity, ppiY || Infinity);
  const factor = paperbackSpineFactor(production || {});
  const inferredPages = sourceSpineIn > 0 && factor > 0 ? Math.round(sourceSpineIn / factor) : 0;
  const sameHeightAssumption = targetHeight > 0;
  const sourceSpineValid = sourceSpineIn > 0.08 && sourceSpineIn < 3.5;
  const targetCanExtendSpine = sourceSpineValid && targetSpine + 0.02 >= sourceSpineIn;
  const ratioMatch = targetWidth > 0 ? Math.abs(sourceWidthIn - targetWidth) <= 0.02 : false;

  checks.push({ id:'wrap-art-file', status:'pass', label:'Finished full-wrap artwork', message:`${a.fileName} · ${a.width} × ${a.height}px.` });
  checks.push({ id:'wrap-art-geometry', status:sourceSpineValid ? (ratioMatch ? 'pass' : 'warning') : 'error', label:'Artwork canvas model', message:sourceSpineValid
    ? ratioMatch
      ? `Artwork already maps to the final ${targetWidth.toFixed(3)} × ${targetHeight.toFixed(3)} in wrap.`
      : `Artwork maps to about ${sourceWidthIn.toFixed(3)} × ${targetHeight.toFixed(3)} in with an inferred ${sourceSpineIn.toFixed(3)} in spine${inferredPages ? ` (roughly ${inferredPages} pages for this paper/ink profile)` : ''}; the current ${Number(pageCount)||0}-page book needs ${targetWidth.toFixed(3)} × ${targetHeight.toFixed(3)} in with a ${targetSpine.toFixed(3)} in spine.`
    : 'The image proportions do not contain a plausible back + spine + front wrap for the selected trim size.' });
  checks.push({ id:'wrap-art-spine-adapter', status:ratioMatch || targetCanExtendSpine ? 'pass' : 'error', label:'Preserve front/back while adapting spine', message:ratioMatch
    ? 'No spine adaptation is needed.'
    : targetCanExtendSpine
      ? `YasReady can preserve the back and front panels at their original physical size and extend only the spine from ${sourceSpineIn.toFixed(3)} to ${targetSpine.toFixed(3)} in.`
      : `The source spine (${Math.max(0,sourceSpineIn).toFixed(3)} in) is wider than the current ${targetSpine.toFixed(3)} in spine. Automatic cropping could damage spine text, so YasReady will not guess.` });
  const resolutionStatus = effectivePpi >= 295 ? 'pass' : effectivePpi >= 250 ? 'warning' : 'error';
  checks.push({ id:'wrap-art-resolution', status:resolutionStatus, label:'Full-wrap artwork resolution', message:`Effective source resolution is about ${Math.round(Number.isFinite(effectivePpi) ? effectivePpi : 0)} PPI at its inferred physical size.${effectivePpi >= 295 ? ' Production artwork meets the 300-PPI target.' : ` Use the original high-resolution export; about ${Math.ceil(sourceWidthIn*300)} × ${Math.ceil(targetHeight*300)}px would provide 300 PPI at this source geometry.`}` });
  checks.push({ id:'wrap-art-final-canvas', status:targetWidth > 0 && targetHeight > 0 ? 'pass' : 'error', label:'Final KDP canvas', message:targetWidth > 0 && targetHeight > 0 ? `YasReady will manufacture the final one-page PDF at exactly ${targetWidth.toFixed(3)} × ${targetHeight.toFixed(3)} in after page count is frozen.` : 'Final cover geometry is not available yet.' });

  const errors = checks.filter((item)=>item.status === 'error').length;
  const warnings = checks.filter((item)=>item.status === 'warning').length;
  return {
    ready:errors === 0,
    checks,
    summary:{ errors, warnings, passes:checks.length-errors-warnings, total:checks.length },
    asset:a,
    inferred:{ sourceWidthIn, sourceHeightIn:targetHeight, sourceSpineIn, targetWidthIn:targetWidth, targetHeightIn:targetHeight, targetSpineIn:targetSpine, inferredPages, effectivePpi, ratioMatch, targetCanExtendSpine, panelWithOuterBleed, sameHeightAssumption },
    version:FULL_WRAP_ART_VERSION,
  };
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Full-wrap artwork could not be decoded.'));
    image.src = dataUrl;
  });
}

function dataUrlToJpegBytes(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/jpeg;base64,(.+)$/s);
  if (!match) throw new Error('Cover canvas did not produce JPEG data.');
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function drawPanel(ctx, image, sx, sw, dx, dw, targetHeightPx) {
  ctx.drawImage(image, sx, 0, Math.max(1, sw), image.height, dx, 0, Math.max(1, dw), targetHeightPx);
}

function extendSpinePreservingArt(ctx, image, { sourceLeftPx, sourceSpinePx, targetLeftPx, targetSpinePx, targetHeightPx }) {
  if (Math.abs(targetSpinePx - sourceSpinePx) <= 1) {
    drawPanel(ctx, image, sourceLeftPx, sourceSpinePx, targetLeftPx, targetSpinePx, targetHeightPx);
    return;
  }
  if (targetSpinePx < sourceSpinePx) throw new Error('Automatic spine adaptation would crop the existing spine artwork. Rebuild the source cover or choose a larger page-count geometry.');
  const extra = targetSpinePx - sourceSpinePx;
  const leftExtra = extra / 2;
  const rightExtra = extra - leftExtra;
  const edgeSlice = clamp(sourceSpinePx * 0.08, 4, Math.max(4, sourceSpinePx * 0.2));
  // Extend only edge texture/color; keep the original spine artwork centered at its
  // original physical width so text/logos are not stretched horizontally.
  drawPanel(ctx, image, sourceLeftPx, edgeSlice, targetLeftPx, leftExtra + 1, targetHeightPx);
  drawPanel(ctx, image, sourceLeftPx + sourceSpinePx - edgeSlice, edgeSlice, targetLeftPx + leftExtra + sourceSpinePx - 1, rightExtra + 1, targetHeightPx);
  drawPanel(ctx, image, sourceLeftPx, sourceSpinePx, targetLeftPx + leftExtra, sourceSpinePx, targetHeightPx);
}

export async function renderFullWrapArtworkPdf({ asset, geometry, production = {}, pageCount = 0, barcodeBrain = {}, isbn = '', dpi = PRINT_PDF_DPI } = {}) {
  const analysis = analyzeFullWrapArtwork({ asset, geometry, production, pageCount });
  if (!analysis.ready) throw new Error('Full-wrap artwork is not production-ready. Resolve the artwork checks first.');
  const a = analysis.asset;
  const inferred = analysis.inferred;
  const image = await loadImage(a.dataUrl);
  const widthPx = Math.round(Number(geometry.width) * dpi);
  const heightPx = Math.round(Number(geometry.height) * dpi);
  const canvas = document.createElement('canvas');
  canvas.width = widthPx; canvas.height = heightPx;
  const ctx = canvas.getContext('2d', { alpha:false });
  if (!ctx) throw new Error('Canvas rendering is unavailable in this browser.');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,widthPx,heightPx);

  const sourcePpi = image.height / inferred.sourceHeightIn;
  const sourceLeftPx = inferred.panelWithOuterBleed * sourcePpi;
  const sourceSpinePx = inferred.sourceSpineIn * sourcePpi;
  const sourceRightX = sourceLeftPx + sourceSpinePx;
  const sourceRightPx = image.width - sourceRightX;
  const targetLeftPx = inferred.panelWithOuterBleed * dpi;
  const targetSpinePx = Number(geometry.spineWidth) * dpi;
  const targetRightX = targetLeftPx + targetSpinePx;
  const targetRightPx = widthPx - targetRightX;

  drawPanel(ctx, image, 0, sourceLeftPx, 0, targetLeftPx, heightPx);
  extendSpinePreservingArt(ctx, image, { sourceLeftPx, sourceSpinePx, targetLeftPx, targetSpinePx, targetHeightPx:heightPx });
  drawPanel(ctx, image, sourceRightX, sourceRightPx, targetRightX, targetRightPx, heightPx);

  const barcode = normalizeBarcodeBrain(barcodeBrain || {});
  let overlayPdf = '';
  let barcodeInfo = { placement:barcode.coverPlacement, isbn:'', vector:false };
  if (barcode.coverPlacement !== 'none') {
    const b = geometry.barcode;
    const knockout = b.knockout || b;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(knockout.x*dpi, knockout.y*dpi, knockout.width*dpi, knockout.height*dpi);
    ctx.restore();
    if (barcode.coverPlacement === 'amazon') {
      ctx.save(); ctx.fillStyle='#777'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font=`${Math.max(12,Math.round(0.055*dpi))}px Arial, sans-serif`;
      ctx.fillText('AMAZON BARCODE RESERVED', (b.x+b.width/2)*dpi, (b.y+b.height/2)*dpi, (b.width-0.12)*dpi); ctx.restore();
    } else {
      const normalized = normalizePrintIsbn(isbn);
      if (!normalized.valid) throw new Error('A valid owned print ISBN is required before YasReady can place the cover barcode.');
      overlayPdf = barcodePdfVectorCommands(normalized.digits, { xIn:b.x, yTopIn:b.y, widthIn:b.width, heightIn:b.height, pageHeightIn:geometry.height });
      barcodeInfo = { placement:'yasready', isbn:normalized.digits, vector:true };
    }
  }

  const jpegBytes = dataUrlToJpegBytes(canvas.toDataURL('image/jpeg', 0.96));
  const pdf = buildRasterPdf({ pages:[{ jpegBytes, widthPx, heightPx, overlayPdf }], pageWidthIn:geometry.width, pageHeightIn:geometry.height, dpi });
  const baseAudit = auditPrintPdfBytes(pdf.bytes, { pageCount:1, pageWidthIn:geometry.width, pageHeightIn:geometry.height, dpi });
  const checks = [...analysis.checks, ...baseAudit.checks];
  const errors = checks.filter((item)=>item.status === 'error').length;
  const warnings = checks.filter((item)=>item.status === 'warning').length;
  return {
    bytes:pdf.bytes,
    blob:new Blob([pdf.bytes], { type:'application/pdf' }),
    analysis,
    barcode:barcodeInfo,
    audit:{ ready:errors===0, checks, summary:{errors,warnings,passes:checks.length-errors-warnings,total:checks.length}, fileSize:pdf.bytes.length },
    geometry,
  };
}
