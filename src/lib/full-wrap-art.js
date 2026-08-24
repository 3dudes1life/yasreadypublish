import { buildRasterPdf, auditPrintPdfBytes, PRINT_PDF_DPI } from './print-pdf.js';
import { paperbackSpineFactor } from './cover-brain.js';
import { barcodePdfVectorCommands, normalizeBarcodeBrain, normalizePrintIsbn } from './barcode-brain.js';

export const FULL_WRAP_ART_VERSION = 3;
// Seamless spine expansion v3: text-safe statistical background reconstruction.

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
  checks.push({ id:'wrap-art-spine-adapter', status:ratioMatch || targetCanExtendSpine ? 'pass' : 'error', label:'Text-safe spine reconstruction', message:ratioMatch
    ? 'No spine adaptation is needed.'
    : targetCanExtendSpine
      ? `YasReady will preserve both covers, reconstruct a clean spine background statistically so lettering cannot be duplicated into the new width, then composite the original spine artwork once at its original proportions while expanding from ${sourceSpineIn.toFixed(3)} to ${targetSpine.toFixed(3)} in.`
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

export function planSeamlessSpineExpansion({ sourceSpinePx = 0, targetSpinePx = 0, sourceToTargetScale = 1 } = {}) {
  const source = Number(sourceSpinePx) || 0;
  const target = Number(targetSpinePx) || 0;
  const scale = Number(sourceToTargetScale) > 0 ? Number(sourceToTargetScale) : 1;
  if (!(source > 0) || !(target > 0)) throw new Error('Valid source and target spine widths are required.');
  const scaledSource = source * scale;
  if (Math.abs(target - scaledSource) <= 1) {
    return {
      mode:'exact', sourceSpinePx:source, targetSpinePx:target, sourceToTargetScale:scale,
      edgeInsetSourcePx:0, coreSourceWidthPx:source, coreTargetWidthPx:target,
      leftExtraPx:0, rightExtraPx:0, featherPx:0,
      backgroundMode:'source-exact', rawArtworkCopiedIntoExtension:false,
    };
  }
  if (target < scaledSource) throw new Error('Automatic spine adaptation would crop the existing spine artwork. Rebuild the source cover or choose a larger page-count geometry.');

  // Remove only the stale fold-edge pixels. Nothing sampled from the old spine is
  // ever tiled into the added width; the added background is reconstructed from
  // robust row statistics so source lettering cannot become "texture."
  const edgeInsetSourcePx = Math.max(2, Math.min(source * 0.055, 18));
  const coreSourceWidthPx = Math.max(1, source - edgeInsetSourcePx * 2);
  const coreTargetWidthPx = coreSourceWidthPx * scale;
  const extraPx = Math.max(0, target - coreTargetWidthPx);
  const leftExtraPx = extraPx / 2;
  const rightExtraPx = extraPx - leftExtraPx;
  const featherPx = Math.max(2, Math.min(8, coreTargetWidthPx * 0.025));
  return {
    mode:'text-safe-expand', sourceSpinePx:source, targetSpinePx:target, sourceToTargetScale:scale,
    edgeInsetSourcePx, coreSourceWidthPx, coreTargetWidthPx, leftExtraPx, rightExtraPx, featherPx,
    backgroundMode:'robust-row-median', rawArtworkCopiedIntoExtension:false,
  };
}

function median(values) {
  if (!values.length) return 0;
  values.sort((a,b)=>a-b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid-1] + values[mid]) / 2;
}

function buildRobustSpineBackground(image, { sourceX, sourceWidth, targetWidthPx, targetHeightPx }) {
  const sourceCanvas = document.createElement('canvas');
  const sw = Math.max(1, Math.round(sourceWidth));
  const sh = Math.max(1, Math.round(targetHeightPx));
  sourceCanvas.width = sw;
  sourceCanvas.height = sh;
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently:true });
  if (!sourceCtx) throw new Error('Canvas rendering is unavailable while reconstructing the spine background.');
  sourceCtx.drawImage(image, sourceX, 0, Math.max(1, sourceWidth), image.height, 0, 0, sw, sh);
  const pixels = sourceCtx.getImageData(0,0,sw,sh).data;

  // One robust background color per source row. Sampling every few columns keeps
  // manufacture fast while the median rejects cream lettering, shadows, logos,
  // hearts, and other foreground marks unless they occupy most of an entire row.
  const rowR = new Float32Array(sh);
  const rowG = new Float32Array(sh);
  const rowB = new Float32Array(sh);
  const rowSpread = new Float32Array(sh);
  const xStep = Math.max(1, Math.floor(sw / 72));
  for (let y=0; y<sh; y+=1) {
    const rs=[]; const gs=[]; const bs=[];
    for (let x=0; x<sw; x+=xStep) {
      const i=(y*sw+x)*4;
      rs.push(pixels[i]); gs.push(pixels[i+1]); bs.push(pixels[i+2]);
    }
    const r=median(rs), g=median(gs), b=median(bs);
    rowR[y]=r; rowG[y]=g; rowB[y]=b;
    const diffs=[];
    for (let n=0; n<rs.length; n+=1) {
      diffs.push((Math.abs(rs[n]-r)+Math.abs(gs[n]-g)+Math.abs(bs[n]-b))/3);
    }
    rowSpread[y]=median(diffs);
  }

  // Smooth vertically enough to remove letter-shaped contamination while
  // retaining the broad mottled/gradient character of the original spine.
  const smoothR=new Float32Array(sh), smoothG=new Float32Array(sh), smoothB=new Float32Array(sh), smoothSpread=new Float32Array(sh);
  const radius=Math.max(4,Math.round(sh/420));
  for (let y=0; y<sh; y+=1) {
    let r=0,g=0,b=0,s=0,count=0;
    const y0=Math.max(0,y-radius), y1=Math.min(sh-1,y+radius);
    for (let yy=y0; yy<=y1; yy+=1) { r+=rowR[yy]; g+=rowG[yy]; b+=rowB[yy]; s+=rowSpread[yy]; count+=1; }
    smoothR[y]=r/count; smoothG[y]=g/count; smoothB[y]=b/count; smoothSpread[y]=s/count;
  }

  const outCanvas=document.createElement('canvas');
  const tw=Math.max(1,Math.round(targetWidthPx));
  outCanvas.width=tw; outCanvas.height=sh;
  const outCtx=outCanvas.getContext('2d');
  if (!outCtx) throw new Error('Canvas rendering is unavailable while painting the reconstructed spine background.');
  const out=outCtx.createImageData(tw,sh);

  // Deterministic low-amplitude grain prevents a plastic flat-fill look without
  // copying any original glyph-shaped pixels. The same source always produces
  // the same manufactured cover.
  for (let y=0; y<sh; y+=1) {
    const baseR=smoothR[y], baseG=smoothG[y], baseB=smoothB[y];
    const amp=clamp(smoothSpread[y]*0.18,1.2,5.5);
    for (let x=0; x<tw; x+=1) {
      let h=(Math.imul(x+17,374761393)^Math.imul(y+31,668265263))>>>0;
      h=(h^(h>>>13))>>>0;
      const n=((h&1023)/1023)-0.5;
      const wave=Math.sin((x/tw)*Math.PI*2 + (y/sh)*Math.PI*0.65)*0.7;
      const delta=n*amp + wave;
      const i=(y*tw+x)*4;
      out.data[i]=clamp(Math.round(baseR+delta),0,255);
      out.data[i+1]=clamp(Math.round(baseG+delta),0,255);
      out.data[i+2]=clamp(Math.round(baseB+delta),0,255);
      out.data[i+3]=255;
    }
  }
  outCtx.putImageData(out,0,0);
  return outCanvas;
}

function drawOriginalSpineArtworkOnce(ctx, image, backgroundCanvas, {
  sourceX, sourceWidth, targetX, targetWidth, targetSpineX, targetSpineWidth, targetHeightPx, featherPx,
}) {
  const layer=document.createElement('canvas');
  const w=Math.max(1,Math.round(targetWidth));
  const h=Math.max(1,Math.round(targetHeightPx));
  layer.width=w; layer.height=h;
  const lctx=layer.getContext('2d', { willReadFrequently:true });
  if (!lctx) throw new Error('Canvas rendering is unavailable while preserving original spine artwork.');
  lctx.drawImage(image,sourceX,0,Math.max(1,sourceWidth),image.height,0,0,w,h);
  const original=lctx.getImageData(0,0,w,h);

  // Compare the original core to the clean reconstructed background. Only pixels
  // that differ materially from the statistical background become foreground.
  // This preserves title/subtitle/script/logo/shadows once, while ordinary teal
  // texture becomes transparent and cannot create a rectangular old-spine patch.
  const bgctx=backgroundCanvas.getContext('2d',{willReadFrequently:true});
  const spineBg=bgctx.getImageData(0,0,backgroundCanvas.width,backgroundCanvas.height).data;
  const overlay=lctx.createImageData(w,h);
  const bgW=backgroundCanvas.width;
  const offset=Math.round(targetX-targetSpineX);
  const edge=Math.max(1,Math.round(featherPx));
  for (let y=0; y<h; y+=1) {
    for (let x=0; x<w; x+=1) {
      const oi=(y*w+x)*4;
      const bx=clamp(offset+x,0,bgW-1);
      const bi=(y*bgW+bx)*4;
      const dr=original.data[oi]-spineBg[bi];
      const dg=original.data[oi+1]-spineBg[bi+1];
      const db=original.data[oi+2]-spineBg[bi+2];
      const distance=Math.sqrt(dr*dr+dg*dg+db*db);
      let alpha=clamp((distance-22)/38,0,1);
      if (x<edge) alpha*=x/edge;
      if (x>w-1-edge) alpha*=(w-1-x)/edge;
      overlay.data[oi]=original.data[oi];
      overlay.data[oi+1]=original.data[oi+1];
      overlay.data[oi+2]=original.data[oi+2];
      overlay.data[oi+3]=Math.round(alpha*255);
    }
  }
  lctx.clearRect(0,0,w,h);
  lctx.putImageData(overlay,0,0);
  ctx.drawImage(layer,targetX,0,targetWidth,targetHeightPx);
}

function verticalSeamScore(ctx, x, targetHeightPx) {
  const xi = Math.round(x);
  const y = Math.max(0, Math.round(targetHeightPx * 0.05));
  const height = Math.max(1, Math.round(targetHeightPx * 0.90));
  if (xi < 2 || xi + 2 >= ctx.canvas.width) return 0;
  try {
    const left = ctx.getImageData(xi - 2, y, 2, height).data;
    const right = ctx.getImageData(xi, y, 2, height).data;
    let total = 0;
    for (let row = 0; row < height; row += 1) {
      const li = row * 8;
      const ri = row * 8;
      for (let channel = 0; channel < 3; channel += 1) {
        const lv = (left[li + channel] + left[li + 4 + channel]) / 2;
        const rv = (right[ri + channel] + right[ri + 4 + channel]) / 2;
        total += Math.abs(lv - rv);
      }
    }
    return total / (height * 3);
  } catch {
    return 0;
  }
}

function extendSpinePreservingArt(ctx, image, { sourceLeftPx, sourceSpinePx, targetLeftPx, targetSpinePx, targetHeightPx }) {
  const sourceToTargetScale = targetHeightPx / Math.max(1, image.height);
  const plan = planSeamlessSpineExpansion({ sourceSpinePx, targetSpinePx, sourceToTargetScale });
  if (plan.mode === 'exact') {
    drawPanel(ctx, image, sourceLeftPx, sourceSpinePx, targetLeftPx, targetSpinePx, targetHeightPx);
    return { ...plan, seamScores:[0,0], worstSeamScore:0, foregroundCopies:1, extensionArtworkCopies:0 };
  }

  const sourceCoreX=sourceLeftPx+plan.edgeInsetSourcePx;
  const targetCoreX=targetLeftPx+plan.leftExtraPx;
  const background=buildRobustSpineBackground(image, {
    sourceX:sourceCoreX,
    sourceWidth:plan.coreSourceWidthPx,
    targetWidthPx:targetSpinePx,
    targetHeightPx,
  });

  // Paint the clean synthesized background across the *entire* new spine first.
  // Critically, no source strip is mirrored, tiled, or stretched into the extra area.
  ctx.drawImage(background,targetLeftPx,0,targetSpinePx,targetHeightPx);

  // Put the original useful spine artwork back exactly once, centered at its
  // original physical width. The foreground mask removes ordinary old background
  // pixels so the original narrow spine cannot show up as a visible rectangle.
  drawOriginalSpineArtworkOnce(ctx,image,background,{
    sourceX:sourceCoreX,
    sourceWidth:plan.coreSourceWidthPx,
    targetX:targetCoreX,
    targetWidth:plan.coreTargetWidthPx,
    targetSpineX:targetLeftPx,
    targetSpineWidth:targetSpinePx,
    targetHeightPx,
    featherPx:plan.featherPx,
  });

  const seamScores=[
    verticalSeamScore(ctx,targetCoreX,targetHeightPx),
    verticalSeamScore(ctx,targetCoreX+plan.coreTargetWidthPx,targetHeightPx),
  ];
  return {
    ...plan,
    seamScores,
    worstSeamScore:Math.max(...seamScores),
    foregroundCopies:1,
    extensionArtworkCopies:0,
  };
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
  const spineAdaptation = extendSpinePreservingArt(ctx, image, { sourceLeftPx, sourceSpinePx, targetLeftPx, targetSpinePx, targetHeightPx:heightPx });
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
  const seamStatus = spineAdaptation.worstSeamScore <= 36 ? 'pass' : 'warning';
  const seamMessage = spineAdaptation.mode === 'exact'
    ? 'The source spine already matches the final geometry; no synthesized join exists.'
    : seamStatus === 'pass'
      ? `Text-safe reconstruction built the added width from statistical background only and composited the source spine artwork once. Internal seam score ${spineAdaptation.worstSeamScore.toFixed(1)}.`
      : `Text-safe reconstruction prevented duplicated source artwork, but the internal seam score is ${spineAdaptation.worstSeamScore.toFixed(1)}. Inspect the manufactured cover at 100% before KDP upload.`;
  const seamCheck = { id:'wrap-art-seam-audit', status:seamStatus, label:'Spine seam audit', message:seamMessage };
  const duplicationCheck = {
    id:'wrap-art-text-duplication-guard',
    status:spineAdaptation.extensionArtworkCopies === 0 ? 'pass' : 'error',
    label:'Spine text duplication guard',
    message:spineAdaptation.mode === 'exact'
      ? 'No expansion occurred.'
      : 'Added spine width contains synthesized background only; source title/subtitle/logo pixels are composited exactly once and never tiled into extension zones.',
  };
  const checks = [...analysis.checks, duplicationCheck, seamCheck, ...baseAudit.checks];
  const errors = checks.filter((item)=>item.status === 'error').length;
  const warnings = checks.filter((item)=>item.status === 'warning').length;
  return {
    bytes:pdf.bytes,
    blob:new Blob([pdf.bytes], { type:'application/pdf' }),
    analysis,
    barcode:barcodeInfo,
    spineAdaptation,
    audit:{ ready:errors===0, checks, summary:{errors,warnings,passes:checks.length-errors-warnings,total:checks.length}, fileSize:pdf.bytes.length },
    geometry,
  };
}
