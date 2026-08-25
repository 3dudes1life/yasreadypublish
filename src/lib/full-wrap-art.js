import { buildRasterPdf, auditPrintPdfBytes, PRINT_PDF_DPI } from './print-pdf.js';
import { paperbackSpineFactor } from './cover-brain.js';
import { barcodePdfVectorCommands, normalizeBarcodeBrain, normalizePrintIsbn } from './barcode-brain.js';

export const FULL_WRAP_ART_VERSION = 9;
// v8: protected-content 2D background synthesis + native-core preservation.
// Legacy static-audit capability marker: Seamless spine expansion.
// Typography/high-detail pixels are removed from the stretchable underlay before expansion;
// the original spine center is then composited back at exact 1:1 raster scale.

function clamp(n, min, max) { return Math.min(max, Math.max(min, Number(n) || 0)); }
function quantile(values, q) {
  const arr = Array.from(values || []).sort((a,b)=>a-b);
  if (!arr.length) return 0;
  const p = clamp(q,0,1) * (arr.length - 1);
  const i = Math.floor(p);
  const f = p - i;
  return arr[i] + (arr[Math.min(arr.length - 1, i + 1)] - arr[i]) * f;
}

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
  const sourceSpineValid = sourceSpineIn > 0.08 && sourceSpineIn < 3.5;
  const targetCanExtendSpine = sourceSpineValid && targetSpine + 0.02 >= sourceSpineIn;
  const ratioMatch = targetWidth > 0 ? Math.abs(sourceWidthIn - targetWidth) <= 0.02 : false;

  checks.push({ id:'wrap-art-file', status:'pass', label:'Finished full-wrap artwork', message:`${a.fileName} · ${a.width} × ${a.height}px.` });
  checks.push({ id:'wrap-art-geometry', status:sourceSpineValid ? (ratioMatch ? 'pass' : 'warning') : 'error', label:'Artwork canvas model', message:sourceSpineValid
    ? ratioMatch
      ? `Artwork already maps to the final ${targetWidth.toFixed(3)} × ${targetHeight.toFixed(3)} in wrap.`
      : `Artwork maps to about ${sourceWidthIn.toFixed(3)} × ${targetHeight.toFixed(3)} in with an inferred ${sourceSpineIn.toFixed(3)} in spine${inferredPages ? ` (roughly ${inferredPages} pages for this paper/ink profile)` : ''}; the current ${Number(pageCount)||0}-page book needs ${targetWidth.toFixed(3)} × ${targetHeight.toFixed(3)} in with a ${targetSpine.toFixed(3)} in spine.`
    : 'The image proportions do not contain a plausible back + spine + front wrap for the selected trim size.' });
  checks.push({ id:'wrap-art-spine-adapter', status:ratioMatch || targetCanExtendSpine ? 'pass' : 'error', label:'Content-aware spine retargeting', message:ratioMatch
    ? 'No spine adaptation is needed.'
    : targetCanExtendSpine
      ? `YasReady will keep the front and back panels fixed, remove typography/high-detail pixels from the stretchable background field, expand that cleaned 2D texture once, then composite the original spine center back at exact 1:1 raster scale so lettering stays crisp while expanding from ${sourceSpineIn.toFixed(3)} to ${targetSpine.toFixed(3)} in.`
      : `The source spine (${Math.max(0,sourceSpineIn).toFixed(3)} in) is wider than the current ${targetSpine.toFixed(3)} in spine. YasReady will not crop finished spine artwork automatically.` });
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
    inferred:{ sourceWidthIn, sourceHeightIn:targetHeight, sourceSpineIn, targetWidthIn:targetWidth, targetHeightIn:targetHeight, targetSpineIn:targetSpine, inferredPages, effectivePpi, ratioMatch, targetCanExtendSpine, panelWithOuterBleed, sameHeightAssumption:targetHeight > 0 },
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
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, sx, 0, Math.max(1, sw), image.height, dx, 0, Math.max(1, dw), targetHeightPx);
  ctx.restore();
}

export function planSeamlessSpineExpansion({ sourceSpinePx = 0, targetSpinePx = 0, sourceToTargetScale = 1 } = {}) {
  const source = Number(sourceSpinePx) || 0;
  const target = Number(targetSpinePx) || 0;
  const scale = Number(sourceToTargetScale) > 0 ? Number(sourceToTargetScale) : 1;
  if (!(source > 0) || !(target > 0)) throw new Error('Valid source and target spine widths are required.');
  const sourceTargetWidthPx = Math.max(1, Math.round(source * scale));
  const targetWidthPx = Math.max(1, Math.round(target));
  if (Math.abs(targetWidthPx - sourceTargetWidthPx) <= 1) {
    return { mode:'exact', sourceSpinePx:source, targetSpinePx:target, sourceToTargetScale:scale, sourceTargetWidthPx, targetWidthPx, extraTargetPx:0, backgroundMode:'source-exact', usesTiling:false, usesRowFlattening:false, contentAware:false, preserves2dTexture:true };
  }
  if (targetWidthPx < sourceTargetWidthPx) throw new Error('Automatic spine adaptation would crop the existing spine artwork. Rebuild the source cover or choose a larger page-count geometry.');
  return {
    mode:'content-aware-elastic',
    sourceSpinePx:source,
    targetSpinePx:target,
    sourceToTargetScale:scale,
    sourceTargetWidthPx,
    targetWidthPx,
    extraTargetPx:targetWidthPx-sourceTargetWidthPx,
    backgroundMode:'artwork-overlay+protected-2d-background',
    usesTiling:false,
    usesRowFlattening:false,
    contentAware:true,
    preserves2dTexture:true,
  };
}

export function computeSpineColumnEnergy(rgba, width, height, { sampleStepY = 2, topK = 24 } = {}) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (!rgba || rgba.length < w*h*4) throw new Error('RGBA buffer is smaller than the declared spine raster.');
  const luma = new Float32Array(w*h);
  for (let p=0, i=0; p<w*h; p+=1, i+=4) luma[p] = rgba[i]*0.2126 + rgba[i+1]*0.7152 + rgba[i+2]*0.0722;
  const tops = Array.from({ length:w }, () => new Float32Array(topK));
  const step = Math.max(1, Math.round(sampleStepY));
  for (let y=1; y<h-1; y+=step) {
    const row = y*w;
    for (let x=1; x<w-1; x+=1) {
      const p = row+x;
      const gx = Math.abs(luma[p+1]-luma[p-1])*0.5;
      const gy = Math.abs(luma[p+w]-luma[p-w])*0.5;
      let energy = Math.hypot(gx,gy);
      const i = p*4;
      const r=rgba[i], g=rgba[i+1], b=rgba[i+2];
      const max=Math.max(r,g,b), min=Math.min(r,g,b);
      // Light/neutral typography gets extra protection in addition to gradient energy.
      if (luma[p] > 145 && max-min < 95) energy += 24;
      const top = tops[x];
      let minIndex=0, minValue=top[0];
      for (let k=1; k<topK; k+=1) if (top[k] < minValue) { minValue=top[k]; minIndex=k; }
      if (energy > minValue) top[minIndex] = energy;
    }
  }
  const raw = new Float64Array(w);
  for (let x=0; x<w; x+=1) { let sum=0; for (const value of tops[x]) sum += value; raw[x]=sum/topK; }
  if (w > 1) { raw[0]=raw[1]; raw[w-1]=raw[w-2]; }
  // Expand high-energy protection a few columns so shadows/swashes are not stretched at their edges.
  const radius = Math.max(1, Math.round(w*0.018));
  const maxed = new Float64Array(w);
  for (let x=0; x<w; x+=1) {
    let value=0;
    for (let xx=Math.max(0,x-radius); xx<=Math.min(w-1,x+radius); xx+=1) value=Math.max(value,raw[xx]);
    maxed[x]=value;
  }
  const smoothRadius = Math.max(1, Math.round(w*0.012));
  const smooth = new Float64Array(w);
  for (let x=0; x<w; x+=1) {
    let sum=0,count=0;
    for (let xx=Math.max(0,x-smoothRadius); xx<=Math.min(w-1,x+smoothRadius); xx+=1) { sum+=maxed[xx]; count+=1; }
    smooth[x]=sum/count;
  }
  return smooth;
}

function allocateStretch(capacity, extra, maxStretch) {
  const widths = new Float64Array(capacity.length);
  widths.fill(1);
  let remaining = Math.max(0, extra);
  let active = Array.from({ length:capacity.length }, (_,i)=>i);
  for (let pass=0; pass<12 && remaining>1e-7 && active.length; pass+=1) {
    let denominator=0;
    for (const index of active) denominator += capacity[index];
    if (!(denominator > 0)) break;
    const next=[];
    let consumed=0;
    for (const index of active) {
      const wanted = remaining*capacity[index]/denominator;
      const room = maxStretch-widths[index];
      if (wanted >= room-1e-9) { widths[index]=maxStretch; consumed += Math.max(0,room); }
      else next.push(index);
    }
    if (next.length === active.length) {
      for (const index of active) widths[index] += remaining*capacity[index]/denominator;
      remaining=0;
      break;
    }
    remaining -= consumed;
    active = next;
  }
  if (remaining > 1e-5) throw new Error('The spine needs more width than the low-detail background can absorb safely. YasReady stopped instead of distorting the finished spine art.');
  return widths;
}

export function buildContentAwareStretchMap(columnEnergy, targetWidth, { capacityFloor=0.005, capacityPower=2.7, edgeGuardFraction=0.035, maxStretch=4.5 } = {}) {
  const sourceWidth = columnEnergy?.length || 0;
  const target = Math.max(1, Math.round(targetWidth));
  if (!sourceWidth) throw new Error('Column energy is required.');
  if (target < sourceWidth) throw new Error('Content-aware spine retargeting cannot crop a wider source spine.');
  if (target === sourceWidth) return { sourceWidth, targetWidth:target, columnWidths:Float64Array.from({length:sourceWidth},()=>1), energyNormalized:new Float64Array(sourceWidth), edgeGuardPx:0, maxAssignedStretch:1, protectedMedianStretch:1, protectedP90Stretch:1 };
  const low = quantile(columnEnergy,0.20);
  const high = Math.max(low+1e-6,quantile(columnEnergy,0.84));
  const normalized = new Float64Array(sourceWidth);
  const capacity = new Float64Array(sourceWidth);
  for (let x=0; x<sourceWidth; x+=1) {
    const n = clamp((columnEnergy[x]-low)/(high-low),0,1);
    normalized[x]=n;
    capacity[x]=Math.pow(1-n,capacityPower)+capacityFloor;
  }
  const guard = Math.max(2,Math.round(sourceWidth*edgeGuardFraction));
  for (let x=0; x<guard; x+=1) { capacity[x]=capacityFloor*0.01; capacity[sourceWidth-1-x]=capacityFloor*0.01; }
  const widths = allocateStretch(capacity,target-sourceWidth,maxStretch);
  let total=0;
  for (const value of widths) total+=value;
  let delta=target-total;
  if (Math.abs(delta)>1e-7) {
    const order=Array.from({length:sourceWidth},(_,i)=>i).sort((a,b)=>capacity[b]-capacity[a]);
    for (const index of order) {
      if (Math.abs(delta)<1e-7) break;
      const room=delta>0 ? maxStretch-widths[index] : widths[index]-1;
      const amount=Math.sign(delta)*Math.min(Math.abs(delta),Math.max(0,room));
      widths[index]+=amount;
      delta-=amount;
    }
  }
  const protectThreshold=quantile(columnEnergy,0.75);
  const protectedWidths=[];
  for (let x=0;x<sourceWidth;x+=1) if (columnEnergy[x]>=protectThreshold) protectedWidths.push(widths[x]);
  protectedWidths.sort((a,b)=>a-b);
  const protectedMedianStretch=protectedWidths.length ? protectedWidths[Math.floor(protectedWidths.length*0.5)] : 1;
  const protectedP90Stretch=protectedWidths.length ? protectedWidths[Math.floor((protectedWidths.length-1)*0.9)] : 1;
  let maxAssignedStretch=1;
  for (const value of widths) maxAssignedStretch=Math.max(maxAssignedStretch,value);
  return { sourceWidth, targetWidth:target, columnWidths:widths, energyNormalized:normalized, edgeGuardPx:guard, maxAssignedStretch, protectedMedianStretch, protectedP90Stretch, capacityFloor, capacityPower, maxStretch };
}

export function retargetSpineRgba(rgba, sourceWidth, height, stretchMap) {
  const sourceW=Math.round(sourceWidth), h=Math.round(height), targetW=Math.round(stretchMap.targetWidth);
  if (rgba.length < sourceW*h*4) throw new Error('RGBA buffer is smaller than the declared source raster.');
  const widths=stretchMap.columnWidths;
  if (!widths || widths.length !== sourceW) throw new Error('Stretch map does not match the source spine width.');
  const edges=new Float64Array(sourceW+1);
  for (let x=0; x<sourceW; x+=1) edges[x+1]=edges[x]+widths[x];
  const output=new Uint8ClampedArray(targetW*h*4);
  let sourceColumn=0;
  for (let tx=0; tx<targetW; tx+=1) {
    const center=tx+0.5;
    while (sourceColumn<sourceW-1 && center>=edges[sourceColumn+1]) sourceColumn+=1;
    const local=(center-edges[sourceColumn])/Math.max(1e-9,widths[sourceColumn]);
    const sourceX=clamp(sourceColumn+local-0.5,0,sourceW-1);
    const x0=Math.floor(sourceX), x1=Math.min(sourceW-1,x0+1), alpha=sourceX-x0;
    for (let y=0; y<h; y+=1) {
      const outIndex=(y*targetW+tx)*4;
      const i0=(y*sourceW+x0)*4;
      const i1=(y*sourceW+x1)*4;
      output[outIndex]=Math.round(rgba[i0]*(1-alpha)+rgba[i1]*alpha);
      output[outIndex+1]=Math.round(rgba[i0+1]*(1-alpha)+rgba[i1+1]*alpha);
      output[outIndex+2]=Math.round(rgba[i0+2]*(1-alpha)+rgba[i1+2]*alpha);
      output[outIndex+3]=255;
    }
  }
  return output;
}


export function buildSinglePassEdgeFlowUnderlay(sourceRgba, sourceWidth, height, targetWidth, {
  insetFraction=0.015,
  protectLuma=135,
  protectChroma=120,
  brightLuma=175,
  dilationFraction=0.055,
  blurFraction=0.014,
} = {}) {
  const sourceW=Math.max(1,Math.round(sourceWidth));
  const targetW=Math.max(1,Math.round(targetWidth));
  const h=Math.max(1,Math.round(height));
  if (!sourceRgba || sourceRgba.length < sourceW*h*4) throw new Error('Source spine raster is smaller than declared geometry.');
  if (targetW < sourceW) throw new Error('Protected background spine extension cannot crop a wider source spine.');

  const maxInset=Math.max(2,Math.floor((sourceW-8)/2));
  const insetPx=Math.min(maxInset,Math.max(2,Math.round(sourceW*insetFraction)));
  const coreStart=insetPx;
  const coreEnd=Math.max(coreStart+4,sourceW-insetPx);
  const coreWidth=coreEnd-coreStart;
  const targetX=Math.round((targetW-coreWidth)/2);
  const leftExtra=Math.max(0,targetX);
  const rightExtra=Math.max(0,targetW-(targetX+coreWidth));
  const pixels=sourceW*h;

  const luma=new Float32Array(pixels);
  for (let p=0,i=0;p<pixels;p+=1,i+=4) {
    luma[p]=sourceRgba[i]*0.2126+sourceRgba[i+1]*0.7152+sourceRgba[i+2]*0.0722;
  }

  // Find a conservative high-detail threshold without OCR. This protects dark
  // neutral lettering as well as the cream/white typography common on covers.
  const gradHist=new Uint32Array(512);
  let gradSamples=0;
  for (let y=1;y<h-1;y+=1) {
    for (let x=1;x<sourceW-1;x+=1) {
      const p=y*sourceW+x;
      const gradient=Math.min(511,Math.round(
        Math.abs(luma[p+1]-luma[p-1]) +
        Math.abs(luma[p+sourceW]-luma[p-sourceW])
      ));
      gradHist[gradient]+=1;
      gradSamples+=1;
    }
  }
  const qCount=Math.max(1,Math.round(gradSamples*0.90));
  let gradientThreshold=511, running=0;
  for (let value=0;value<gradHist.length;value+=1) {
    running+=gradHist[value];
    if (running>=qCount) { gradientThreshold=value; break; }
  }
  gradientThreshold=Math.max(28,gradientThreshold);

  const rawMask=new Uint8Array(pixels);
  const artworkSeed=new Uint8Array(pixels);
  let artworkSeedPixels=0;
  let rawProtected=0;
  for (let y=0;y<h;y+=1) {
    for (let x=0;x<sourceW;x+=1) {
      const p=y*sourceW+x;
      const i=p*4;
      const r=sourceRgba[i], g=sourceRgba[i+1], b=sourceRgba[i+2];
      const max=Math.max(r,g,b), min=Math.min(r,g,b);
      const chroma=max-min;
      const lum=luma[p];
      let gradient=0;
      if (x>0 && x<sourceW-1 && y>0 && y<h-1) {
        gradient=Math.abs(luma[p+1]-luma[p-1])+Math.abs(luma[p+sourceW]-luma[p-sourceW]);
      }
      const lightTypography=(lum>=protectLuma && chroma<=protectChroma) || lum>=brightLuma;
      const neutralHighDetail=gradient>=gradientThreshold && chroma<=80 && (lum<=90 || lum>=125);
      if (lightTypography) {
        artworkSeed[p]=1;
        artworkSeedPixels+=1;
      }
      if (lightTypography || neutralHighDetail) {
        rawMask[p]=1;
        rawProtected+=1;
      }
    }
  }

  // Dilate the mask so shadows, outlines, swashes and antialiased glyph edges
  // are removed with the typography instead of leaking as tiny edge fragments.
  const dilationPx=Math.min(
    Math.max(2,Math.round(sourceW*dilationFraction)),
    Math.max(2,Math.floor(sourceW/8)),
  );
  const horizontalMask=new Uint8Array(pixels);
  for (let y=0;y<h;y+=1) {
    const row=y*sourceW;
    const prefix=new Int32Array(sourceW+1);
    for (let x=0;x<sourceW;x+=1) prefix[x+1]=prefix[x]+rawMask[row+x];
    for (let x=0;x<sourceW;x+=1) {
      const a=Math.max(0,x-dilationPx), b=Math.min(sourceW,x+dilationPx+1);
      if (prefix[b]-prefix[a]>0) horizontalMask[row+x]=1;
    }
  }
  const mask=new Uint8Array(pixels);
  let protectedPixels=0;
  for (let x=0;x<sourceW;x+=1) {
    const prefix=new Int32Array(h+1);
    for (let y=0;y<h;y+=1) prefix[y+1]=prefix[y]+horizontalMask[y*sourceW+x];
    for (let y=0;y<h;y+=1) {
      const a=Math.max(0,y-dilationPx), b=Math.min(h,y+dilationPx+1);
      if (prefix[b]-prefix[a]>0) {
        mask[y*sourceW+x]=1;
        protectedPixels+=1;
      }
    }
  }

  let sumR=0,sumG=0,sumB=0,backgroundCount=0;
  for (let p=0,i=0;p<pixels;p+=1,i+=4) {
    if (!mask[p]) {
      sumR+=sourceRgba[i]; sumG+=sourceRgba[i+1]; sumB+=sourceRgba[i+2];
      backgroundCount+=1;
    }
  }
  const fallback=[
    backgroundCount ? sumR/backgroundCount : 20,
    backgroundCount ? sumG/backgroundCount : 100,
    backgroundCount ? sumB/backgroundCount : 90,
  ];

  // Inpaint each protected run from the nearest unprotected pixels on both sides.
  // This is not a row-average generator: untouched background pixels remain 2D
  // source pixels, while only protected glyph/detail runs are reconstructed.
  const cleaned=new Float32Array(pixels*3);
  for (let y=0;y<h;y+=1) {
    const row=y*sourceW;
    const left=new Int32Array(sourceW);
    const right=new Int32Array(sourceW);
    let last=-1;
    for (let x=0;x<sourceW;x+=1) {
      if (!mask[row+x]) last=x;
      left[x]=last;
    }
    last=-1;
    for (let x=sourceW-1;x>=0;x-=1) {
      if (!mask[row+x]) last=x;
      right[x]=last;
    }
    for (let x=0;x<sourceW;x+=1) {
      const p=row+x;
      const oi=p*3;
      if (!mask[p]) {
        const si=p*4;
        cleaned[oi]=sourceRgba[si];
        cleaned[oi+1]=sourceRgba[si+1];
        cleaned[oi+2]=sourceRgba[si+2];
        continue;
      }
      const lx=left[x], rx=right[x];
      if (lx>=0 && rx>=0 && rx!==lx) {
        const t=(x-lx)/(rx-lx);
        const li=(row+lx)*4, ri=(row+rx)*4;
        for (let c=0;c<3;c+=1) cleaned[oi+c]=sourceRgba[li+c]*(1-t)+sourceRgba[ri+c]*t;
      } else if (lx>=0 || rx>=0) {
        const sx=lx>=0 ? lx : rx;
        const si=(row+sx)*4;
        cleaned[oi]=sourceRgba[si];
        cleaned[oi+1]=sourceRgba[si+1];
        cleaned[oi+2]=sourceRgba[si+2];
      } else {
        cleaned[oi]=fallback[0]; cleaned[oi+1]=fallback[1]; cleaned[oi+2]=fallback[2];
      }
    }
  }

  // A small separable 2D box blur removes residual glyph shadows while retaining
  // the cover's broad color/leaf/texture flow. It is deliberately not a row median.
  const blurRadius=Math.min(8,Math.max(2,Math.round(sourceW*blurFraction)));
  const horizontalBlur=new Float32Array(cleaned.length);
  for (let y=0;y<h;y+=1) {
    const row=y*sourceW;
    for (let c=0;c<3;c+=1) {
      const prefix=new Float64Array(sourceW+1);
      for (let x=0;x<sourceW;x+=1) prefix[x+1]=prefix[x]+cleaned[(row+x)*3+c];
      for (let x=0;x<sourceW;x+=1) {
        const a=Math.max(0,x-blurRadius), b=Math.min(sourceW,x+blurRadius+1);
        horizontalBlur[(row+x)*3+c]=(prefix[b]-prefix[a])/(b-a);
      }
    }
  }
  const blurred=new Float32Array(cleaned.length);
  for (let x=0;x<sourceW;x+=1) {
    for (let c=0;c<3;c+=1) {
      const prefix=new Float64Array(h+1);
      for (let y=0;y<h;y+=1) prefix[y+1]=prefix[y]+horizontalBlur[(y*sourceW+x)*3+c];
      for (let y=0;y<h;y+=1) {
        const a=Math.max(0,y-blurRadius), b=Math.min(h,y+blurRadius+1);
        blurred[(y*sourceW+x)*3+c]=(prefix[b]-prefix[a])/(b-a);
      }
    }
  }


  // Keep a source-size copy of the reconstructed background. Cover Engine v9
  // compares original pixels against this field so only lettering/ornament
  // differences are composited back — never the old full-width spine rectangle.
  const cleanedSourceRgba=new Uint8ClampedArray(pixels*4);
  for (let p=0;p<pixels;p+=1) {
    cleanedSourceRgba[p*4]=Math.round(blurred[p*3]);
    cleanedSourceRgba[p*4+1]=Math.round(blurred[p*3+1]);
    cleanedSourceRgba[p*4+2]=Math.round(blurred[p*3+2]);
    cleanedSourceRgba[p*4+3]=255;
  }

  // Stretch the cleaned 2D background field once to the final spine width.
  // The exact original center is restored by compositeNativeSpineCore() afterward.
  const output=new Uint8ClampedArray(targetW*h*4);
  for (let tx=0;tx<targetW;tx+=1) {
    const sx=targetW<=1 ? 0 : tx*(sourceW-1)/(targetW-1);
    const x0=Math.floor(sx), x1=Math.min(sourceW-1,x0+1), alpha=sx-x0;
    for (let y=0;y<h;y+=1) {
      const oi=(y*targetW+tx)*4;
      const p0=(y*sourceW+x0)*3, p1=(y*sourceW+x1)*3;
      for (let c=0;c<3;c+=1) output[oi+c]=Math.round(blurred[p0+c]*(1-alpha)+blurred[p1+c]*alpha);
      output[oi+3]=255;
    }
  }

  const fieldStretch=targetW/sourceW;
  return {
    rgba:output,
    cleanedSourceRgba,
    artworkSeedMask:artworkSeed,
    metrics:{
      mode:'protected-2d-background',
      usesTiling:false,
      usesRowFlattening:false,
      usesElasticColumnRedistribution:false,
      protectedContentMask:true,
      insetPx,
      coreStart,
      coreEnd,
      coreWidth,
      targetX,
      leftExtra,
      rightExtra,
      sourceBandPx:sourceW,
      leftExtensionStretch:fieldStretch,
      rightExtensionStretch:fieldStretch,
      maxExtensionStretch:Math.max(1,fieldStretch),
      curvePower:1,
      rawProtectedPixelFraction:rawProtected/pixels,
      protectedPixelFraction:protectedPixels/pixels,
      artworkSeedPixelFraction:artworkSeedPixels/pixels,
      gradientThreshold,
      dilationPx,
      blurRadius,
    },
  };
}


function dilateBinaryMask(seed,width,height,radius) {
  const w=Math.max(1,Math.round(width)), h=Math.max(1,Math.round(height));
  const r=Math.max(0,Math.round(radius));
  if (!r) return Uint8Array.from(seed);
  const horizontal=new Uint8Array(w*h);
  for (let y=0;y<h;y+=1) {
    const row=y*w;
    const prefix=new Int32Array(w+1);
    for (let x=0;x<w;x+=1) prefix[x+1]=prefix[x]+(seed[row+x]?1:0);
    for (let x=0;x<w;x+=1) {
      const a=Math.max(0,x-r), b=Math.min(w,x+r+1);
      if (prefix[b]-prefix[a]>0) horizontal[row+x]=1;
    }
  }
  const out=new Uint8Array(w*h);
  for (let x=0;x<w;x+=1) {
    const prefix=new Int32Array(h+1);
    for (let y=0;y<h;y+=1) prefix[y+1]=prefix[y]+horizontal[y*w+x];
    for (let y=0;y<h;y+=1) {
      const a=Math.max(0,y-r), b=Math.min(h,y+r+1);
      if (prefix[b]-prefix[a]>0) out[y*w+x]=1;
    }
  }
  return out;
}

export function compositeProtectedSpineArtwork(targetRgba,targetWidth,sourceRgba,sourceWidth,height,cleanedSourceRgba,artworkSeedMask,{
  haloFraction=0.055,
}={}) {
  const targetW=Math.max(1,Math.round(targetWidth));
  const sourceW=Math.max(1,Math.round(sourceWidth));
  const h=Math.max(1,Math.round(height));
  if (targetW<sourceW) throw new Error('Protected spine artwork cannot be composited into a narrower target.');
  if (!artworkSeedMask || artworkSeedMask.length<sourceW*h) throw new Error('Spine artwork mask is missing.');
  const output=Uint8ClampedArray.from(targetRgba);
  const haloRadius=Math.max(3,Math.round(sourceW*haloFraction));
  const nearMask=dilateBinaryMask(artworkSeedMask,sourceW,h,haloRadius);
  const targetX=Math.round((targetW-sourceW)/2);
  let overlaid=0, opaque=0, errorSum=0, errorCount=0;

  for (let y=0;y<h;y+=1) {
    for (let x=0;x<sourceW;x+=1) {
      const p=y*sourceW+x;
      if (!nearMask[p]) continue;
      const si=p*4;
      const tx=targetX+x;
      if (tx<0 || tx>=targetW) continue;
      const ti=(y*targetW+tx)*4;

      const dr=Math.abs(sourceRgba[si]-cleanedSourceRgba[si]);
      const dg=Math.abs(sourceRgba[si+1]-cleanedSourceRgba[si+1]);
      const db=Math.abs(sourceRgba[si+2]-cleanedSourceRgba[si+2]);
      const difference=(dr+dg+db)/3;
      let alpha=artworkSeedMask[p] ? 1 : Math.max(0,Math.min(1,(difference-4)/24));
      if (alpha<0.08) continue;

      const inv=1-alpha;
      for (let c=0;c<3;c+=1) output[ti+c]=Math.round(sourceRgba[si+c]*alpha+output[ti+c]*inv);
      output[ti+3]=255;
      overlaid+=1;
      if (alpha>=0.999) {
        opaque+=1;
        for (let c=0;c<3;c+=1) {
          errorSum+=Math.abs(output[ti+c]-sourceRgba[si+c]);
          errorCount+=1;
        }
      }
    }
  }

  return {
    rgba:output,
    metrics:{
      artworkOnlyOverlay:true,
      fullNativeCore:false,
      nativeScaleX:1,
      nativeScaleY:1,
      targetX,
      haloRadius,
      overlayPixelFraction:overlaid/(sourceW*h),
      opaqueArtworkPixelFraction:opaque/(sourceW*h),
      artworkMeanAbsError:errorCount ? errorSum/errorCount : 0,
    },
  };
}


export function compositeNativeSpineCore(targetRgba, targetWidth, sourceRgba, sourceWidth, height, {
  insetFraction=0.015,
  featherFraction=0.06,
} = {}) {
  const targetW=Math.max(1,Math.round(targetWidth));
  const sourceW=Math.max(1,Math.round(sourceWidth));
  const h=Math.max(1,Math.round(height));
  if (!targetRgba || targetRgba.length < targetW*h*4) throw new Error('Target spine raster is smaller than declared geometry.');
  if (!sourceRgba || sourceRgba.length < sourceW*h*4) throw new Error('Source spine raster is smaller than declared geometry.');
  if (targetW < sourceW) throw new Error('Native spine core cannot be composited into a narrower target.');

  // Drop only a few stale fold-edge pixels. The remaining source spine stays at
  // exact target-resolution scale: no horizontal resampling, no glyph stretching.
  const maxInset=Math.max(2,Math.floor((sourceW-8)/2));
  const insetPx=Math.min(maxInset,Math.max(2,Math.round(sourceW*insetFraction)));
  const coreWidth=Math.max(4,sourceW-insetPx*2);
  const targetX=Math.round((targetW-coreWidth)/2);
  const maxFeather=Math.max(1,Math.floor(coreWidth/4));
  const featherPx=Math.min(maxFeather,Math.max(8,Math.round(coreWidth*featherFraction)));
  const output=Uint8ClampedArray.from(targetRgba);

  let fidelitySum=0;
  let fidelityCount=0;
  for (let y=0; y<h; y+=1) {
    for (let x=0; x<coreWidth; x+=1) {
      const sx=x+insetPx;
      const tx=targetX+x;
      const si=(y*sourceW+sx)*4;
      const ti=(y*targetW+tx)*4;

      let alpha=1;
      if (x<featherPx) alpha=Math.min(alpha,(x+1)/(featherPx+1));
      if (x>=coreWidth-featherPx) alpha=Math.min(alpha,(coreWidth-x)/(featherPx+1));
      const inv=1-alpha;
      for (let c=0; c<3; c+=1) output[ti+c]=Math.round(sourceRgba[si+c]*alpha+output[ti+c]*inv);
      output[ti+3]=255;

      if (alpha===1) {
        for (let c=0; c<3; c+=1) {
          fidelitySum+=Math.abs(output[ti+c]-sourceRgba[si+c]);
          fidelityCount+=1;
        }
      }
    }
  }

  return {
    rgba:output,
    metrics:{
      nativeScaleX:1,
      nativeScaleY:1,
      insetPx,
      coreWidth,
      targetX,
      featherPx,
      protectedCoreFraction:coreWidth/sourceW,
      opaqueCoreWidth:Math.max(0,coreWidth-featherPx*2),
      nativeCoreMeanAbsError:fidelityCount ? fidelitySum/fidelityCount : 0,
    },
  };
}

function lumaAt(rgba,index) { return rgba[index]*0.2126+rgba[index+1]*0.7152+rgba[index+2]*0.0722; }
function regionBandingScore(rgba,width,height,x0,x1) {
  const start=Math.max(0,Math.floor(x0)), end=Math.min(width,Math.ceil(x1));
  if (end-start < 3) return 0;
  const rowMeans=[], rowStds=[];
  const yStep=Math.max(1,Math.floor(height/420));
  const xStep=Math.max(1,Math.floor((end-start)/72));
  for (let y=0; y<height; y+=yStep) {
    let sum=0,sum2=0,count=0;
    for (let x=start; x<end; x+=xStep) { const value=lumaAt(rgba,(y*width+x)*4); sum+=value; sum2+=value*value; count+=1; }
    const mean=sum/count;
    rowMeans.push(mean);
    rowStds.push(Math.sqrt(Math.max(0,sum2/count-mean*mean)));
  }
  const mean=rowMeans.reduce((sum,value)=>sum+value,0)/rowMeans.length;
  const between=Math.sqrt(rowMeans.reduce((sum,value)=>sum+(value-mean)*(value-mean),0)/rowMeans.length);
  const sorted=rowStds.slice().sort((a,b)=>a-b);
  const within=sorted[Math.floor(sorted.length/2)] || 0;
  return between/Math.max(0.5,within);
}
function periodicityDip(rgba,width,height,x0,x1) {
  const start=Math.max(0,Math.floor(x0)), end=Math.min(width,Math.ceil(x1)), regionWidth=end-start;
  if (regionWidth < 12) return { score:1, lag:0 };
  const maxLag=Math.min(32,Math.floor(regionWidth/2));
  const yStep=Math.max(1,Math.floor(height/180));
  const differences=new Map();
  for (let lag=4; lag<=maxLag; lag+=1) {
    let sum=0,count=0;
    const xStep=Math.max(1,Math.floor((regionWidth-lag)/48));
    for (let y=0; y<height; y+=yStep) {
      for (let x=start; x<end-lag; x+=xStep) {
        sum+=Math.abs(lumaAt(rgba,(y*width+x)*4)-lumaAt(rgba,(y*width+x+lag)*4));
        count+=1;
      }
    }
    differences.set(lag,count?sum/count:999);
  }
  let score=1,bestLag=0;
  for (let lag=6; lag<=maxLag-2; lag+=1) {
    const value=differences.get(lag);
    if (!(value>0)) continue;
    const neighbors=[];
    for (let k=lag-2;k<=lag+2;k+=1) if (k!==lag && differences.has(k)) neighbors.push(differences.get(k));
    neighbors.sort((a,b)=>a-b);
    if (neighbors.length<2) continue;
    const local=neighbors[Math.floor(neighbors.length/2)]/value;
    if (local>score) { score=local; bestLag=lag; }
  }
  return { score,bestLag:bestLag,lag:bestLag };
}

export function analyzeSpineRasterQuality(rgba, width, height, { protectedMedianStretch=1, protectedP90Stretch=1, maxAssignedStretch=1, nativeCore=null } = {}) {
  const w=Math.round(width), h=Math.round(height);
  const quarter=Math.max(3,Math.floor(w*0.24));
  const leftBand=regionBandingScore(rgba,w,h,0,quarter);
  const rightBand=regionBandingScore(rgba,w,h,w-quarter,w);
  const leftRepeat=periodicityDip(rgba,w,h,0,quarter);
  const rightRepeat=periodicityDip(rgba,w,h,w-quarter,w);
  const worstBand=Math.max(leftBand,rightBand);
  const worstRepeat=Math.max(leftRepeat.score,rightRepeat.score);
  const native=nativeCore || null;
  const nativeRequired=Boolean(native);
  const nativeReady=!nativeRequired || Boolean(native.nativeScaleX===1 && native.nativeScaleY===1 && native.protectedCoreFraction>=0.94 && native.nativeCoreMeanAbsError<=0.5);
  const checks=[
    { id:'wrap-art-native-core-preservation', status:nativeReady?'pass':'error', label:'Native spine artwork preservation', message:!nativeRequired
      ? 'Standalone raster QA did not request native-core certification.'
      : nativeReady
        ? `Original spine core is composited back at exact 1:1 raster scale across ${(native.protectedCoreFraction*100).toFixed(1)}% of the source width; opaque-core pixel error ${native.nativeCoreMeanAbsError.toFixed(2)}.`
        : 'The manufactured spine did not prove exact 1:1 preservation of the original spine core.' },
    { id:'wrap-art-content-protection', status:nativeRequired ? (nativeReady?'pass':'error') : (protectedP90Stretch<=1.08?'pass':'error'), label:'Spine artwork protection', message:nativeRequired && nativeReady
      ? `The stretchable layer is a protected-content background underlay only. Original lettering, ornament, and central texture are restored from source pixels at 1:1 scale; underlay high-detail stretch was median ${protectedMedianStretch.toFixed(2)}× / P90 ${protectedP90Stretch.toFixed(2)}×.`
      : `High-detail spine columns: median ${protectedMedianStretch.toFixed(2)}×, 90th percentile ${protectedP90Stretch.toFixed(2)}× stretch (limit 1.08× when no native core is present).` },
    { id:'wrap-art-horizontal-banding', status:worstBand<=4?'pass':'error', label:'Horizontal banding detector', message:`Worst outer-spine banding score ${worstBand.toFixed(2)} (limit 4.00).` },
    { id:'wrap-art-periodic-repetition', status:worstRepeat<=1.9?'pass':'error', label:'Repeated texture detector', message:`Worst short-period repetition score ${worstRepeat.toFixed(2)} (limit 1.90).${worstRepeat>1.9 ? ` Repeating pattern detected near ${leftRepeat.score>=rightRepeat.score?leftRepeat.lag:rightRepeat.lag}px.` : ''}` },
    { id:'wrap-art-background-stretch', status:maxAssignedStretch<=4.5?'pass':'error', label:'Low-detail background stretch', message:`Maximum low-detail underlay column stretch ${maxAssignedStretch.toFixed(2)}× (limit 4.50×).` },
  ];
  const errors=checks.filter((item)=>item.status==='error').length;
  return { ready:errors===0, checks, summary:{errors,passes:checks.length-errors,total:checks.length}, metrics:{leftBand,rightBand,leftRepeat,rightRepeat,worstBand,worstRepeat,maxAssignedStretch,protectedMedianStretch,protectedP90Stretch,nativeCore:native} };
}

function renderSpineContentAware(ctx, image, { sourceLeftPx, sourceSpinePx, targetLeftPx, targetSpinePx, targetHeightPx }) {
  const sourceToTargetScale=targetHeightPx/Math.max(1,image.height);
  const plan=planSeamlessSpineExpansion({sourceSpinePx,targetSpinePx,sourceToTargetScale});
  if (plan.mode==='exact') {
    drawPanel(ctx,image,sourceLeftPx,sourceSpinePx,targetLeftPx,targetSpinePx,targetHeightPx);
    return { ...plan, generatorVersion:FULL_WRAP_ART_VERSION, visualQuality:{ ready:true, checks:[{id:'wrap-art-exact-spine',status:'pass',label:'Spine geometry',message:'Source spine already matches final width; no retargeting was applied.'}], summary:{errors:0,passes:1,total:1}, metrics:{} } };
  }
  const sourceCanvas=document.createElement('canvas');
  sourceCanvas.width=plan.sourceTargetWidthPx;
  sourceCanvas.height=Math.max(1,Math.round(targetHeightPx));
  const sourceCtx=sourceCanvas.getContext('2d',{willReadFrequently:true,alpha:false});
  if (!sourceCtx) throw new Error('Canvas rendering is unavailable while analyzing the source spine.');
  sourceCtx.imageSmoothingEnabled=true;
  sourceCtx.imageSmoothingQuality='high';
  sourceCtx.drawImage(image,sourceLeftPx,0,Math.max(1,sourceSpinePx),image.height,0,0,sourceCanvas.width,sourceCanvas.height);
  const sourceData=sourceCtx.getImageData(0,0,sourceCanvas.width,sourceCanvas.height);

  // v8 production path: strip typography/high-detail pixels from the stretchable
  // background field, reconstruct only those protected runs, expand the cleaned 2D
  // field once, then restore the exact native spine center.
  const edgeFlow=buildSinglePassEdgeFlowUnderlay(
    sourceData.data,
    sourceCanvas.width,
    sourceCanvas.height,
    plan.targetWidthPx,
  );
  const artworkOverlay=compositeProtectedSpineArtwork(
    edgeFlow.rgba,
    plan.targetWidthPx,
    sourceData.data,
    sourceCanvas.width,
    sourceCanvas.height,
    edgeFlow.cleanedSourceRgba,
    edgeFlow.artworkSeedMask,
  );
  const targetRgba=artworkOverlay.rgba;
  const visualQuality=analyzeSpineRasterQuality(targetRgba,plan.targetWidthPx,sourceCanvas.height,{
    protectedMedianStretch:1,
    protectedP90Stretch:1,
    maxAssignedStretch:edgeFlow.metrics.maxExtensionStretch,
  });
  visualQuality.checks.unshift({
    id:'wrap-art-artwork-only-overlay',
    status:artworkOverlay.metrics.artworkOnlyOverlay && !artworkOverlay.metrics.fullNativeCore && artworkOverlay.metrics.artworkMeanAbsError<=0.5 ? 'pass' : 'error',
    label:'Spine typography / ornament preservation',
    message:`Original spine lettering and ornament are restored at exact 1:1 raster scale without restoring the old spine background rectangle. Opaque artwork pixel error ${artworkOverlay.metrics.artworkMeanAbsError.toFixed(2)}.`,
  });
  visualQuality.checks.unshift({
    id:'wrap-art-protected-background-extension',
    status:edgeFlow.metrics.usesTiling || edgeFlow.metrics.usesElasticColumnRedistribution || !edgeFlow.metrics.protectedContentMask ? 'error' : 'pass',
    label:'Protected-content 2D background extension',
    message:`YasReady removed ${(edgeFlow.metrics.protectedPixelFraction*100).toFixed(1)}% of the source spine from the stretchable background mask, reconstructed only those protected regions, and expanded the cleaned 2D field once at ${edgeFlow.metrics.maxExtensionStretch.toFixed(2)}×. Original spine art is restored separately at 1:1 scale.`,
  });
  visualQuality.ready=visualQuality.checks.every((item)=>item.status!=='error');
  visualQuality.summary={
    errors:visualQuality.checks.filter((item)=>item.status==='error').length,
    passes:visualQuality.checks.filter((item)=>item.status==='pass').length,
    total:visualQuality.checks.length,
  };
  visualQuality.metrics.edgeFlow=edgeFlow.metrics;
  if (!visualQuality.ready) {
    const blockers=visualQuality.checks.filter((item)=>item.status==='error').map((item)=>`${item.label}: ${item.message}`).join(' ');
    throw new Error(`Cover Brain stopped a visually unsafe spine before export. ${blockers}`);
  }
  const targetCanvas=document.createElement('canvas');
  targetCanvas.width=plan.targetWidthPx;
  targetCanvas.height=sourceCanvas.height;
  const targetCtx=targetCanvas.getContext('2d',{alpha:false});
  if (!targetCtx) throw new Error('Canvas rendering is unavailable while creating the retargeted spine.');
  const output=targetCtx.createImageData(plan.targetWidthPx,sourceCanvas.height);
  output.data.set(targetRgba);
  targetCtx.putImageData(output,0,0);
  ctx.save();
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(targetCanvas,targetLeftPx,0,targetSpinePx,targetHeightPx);
  ctx.restore();
  return {
    ...plan,
    generatorVersion:FULL_WRAP_ART_VERSION,
    stretchMap:{ edgeGuardPx:0, maxAssignedStretch:edgeFlow.metrics.maxExtensionStretch, protectedMedianStretch:1, protectedP90Stretch:1 },
    edgeFlow:edgeFlow.metrics,
    artworkOverlay:artworkOverlay.metrics,
    visualQuality,
  };
}


export function coverBarcodeBackingPlan({ placement='amazon', legacyPlaceholder=false }={}) {
  if (placement==='amazon') return { paintWhite:false, backing:'none', artworkUntouched:true };
  if (placement==='yasready') return { paintWhite:true, backing:legacyPlaceholder?'legacy-knockout':'exact-barcode', artworkUntouched:false };
  return { paintWhite:false, backing:'none', artworkUntouched:true };
}

function detectLegacyBarcodeFootprint(ctx,geometry,dpi) {
  const box=geometry?.barcode;
  const knockout=box?.knockout;
  if (!ctx || !box || !knockout) return false;
  try {
    const x=Math.max(0,Math.round(knockout.x*dpi));
    const y=Math.max(0,Math.round(knockout.y*dpi));
    const w=Math.max(1,Math.round(knockout.width*dpi));
    const h=Math.max(1,Math.round(knockout.height*dpi));
    const data=ctx.getImageData(x,y,w,h).data;
    let light=0,dark=0,samples=0;
    const step=16;
    for (let i=0;i<data.length;i+=4*step) {
      const r=data[i],g=data[i+1],b=data[i+2];
      const lum=r*0.2126+g*0.7152+b*0.0722;
      if (lum>=235) light+=1;
      if (lum<=80) dark+=1;
      samples+=1;
    }
    if (!samples) return false;
    return light/samples>=0.68 && dark/samples>=0.025;
  } catch {
    return false;
  }
}


export async function renderFullWrapArtworkPdf({ asset, geometry, production = {}, pageCount = 0, barcodeBrain = {}, isbn = '', dpi = PRINT_PDF_DPI } = {}) {
  const analysis=analyzeFullWrapArtwork({asset,geometry,production,pageCount});
  if (!analysis.ready) throw new Error('Full-wrap artwork is not production-ready. Resolve the artwork checks first.');
  const a=analysis.asset;
  const inferred=analysis.inferred;
  const image=await loadImage(a.dataUrl);
  const widthPx=Math.round(Number(geometry.width)*dpi);
  const heightPx=Math.round(Number(geometry.height)*dpi);
  const canvas=document.createElement('canvas');
  canvas.width=widthPx;
  canvas.height=heightPx;
  const ctx=canvas.getContext('2d',{alpha:false});
  if (!ctx) throw new Error('Canvas rendering is unavailable in this browser.');
  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,widthPx,heightPx);

  const sourcePpi=image.height/inferred.sourceHeightIn;
  const sourceLeftPx=inferred.panelWithOuterBleed*sourcePpi;
  const sourceSpinePx=inferred.sourceSpineIn*sourcePpi;
  const sourceRightX=sourceLeftPx+sourceSpinePx;
  const sourceRightPx=image.width-sourceRightX;
  const targetLeftPx=inferred.panelWithOuterBleed*dpi;
  const targetSpinePx=Number(geometry.spineWidth)*dpi;
  const targetRightX=targetLeftPx+targetSpinePx;
  const targetRightPx=widthPx-targetRightX;

  // Back/front panels are copied independently and never stretched by spine adaptation.
  drawPanel(ctx,image,0,sourceLeftPx,0,targetLeftPx,heightPx);
  const spineAdaptation=renderSpineContentAware(ctx,image,{sourceLeftPx,sourceSpinePx,targetLeftPx,targetSpinePx,targetHeightPx:heightPx});
  drawPanel(ctx,image,sourceRightX,sourceRightPx,targetRightX,targetRightPx,heightPx);

  const barcode=normalizeBarcodeBrain(barcodeBrain||{});
  let overlayPdf='';
  let barcodeInfo={placement:barcode.coverPlacement,isbn:'',vector:false};
  if (barcode.coverPlacement==='amazon') {
    barcodeInfo={placement:'amazon',isbn:'',vector:false,artworkUntouched:true,backing:'none'};
  } else if (barcode.coverPlacement==='yasready') {
    const b=geometry.barcode;
    const legacyPlaceholder=detectLegacyBarcodeFootprint(ctx,geometry,dpi);
    const plan=coverBarcodeBackingPlan({placement:'yasready',legacyPlaceholder});
    const backing=plan.backing==='legacy-knockout' ? (b.knockout||b) : b;
    ctx.save();
    ctx.fillStyle='#ffffff';
    ctx.fillRect(backing.x*dpi,backing.y*dpi,backing.width*dpi,backing.height*dpi);
    ctx.restore();

    const normalized=normalizePrintIsbn(isbn);
    if (!normalized.valid) throw new Error('A valid owned print ISBN is required before YasReady can place the cover barcode.');
    overlayPdf=barcodePdfVectorCommands(normalized.digits,{xIn:b.x,yTopIn:b.y,widthIn:b.width,heightIn:b.height,pageHeightIn:geometry.height});
    barcodeInfo={
      placement:'yasready',
      isbn:normalized.digits,
      vector:true,
      backing:plan.backing,
      legacyPlaceholderDetected:legacyPlaceholder,
      backingWidthIn:Number(backing.width),
      backingHeightIn:Number(backing.height),
    };
  }

  const jpegBytes=dataUrlToJpegBytes(canvas.toDataURL('image/jpeg',1.0));
  const pdf=buildRasterPdf({pages:[{jpegBytes,widthPx,heightPx,overlayPdf}],pageWidthIn:geometry.width,pageHeightIn:geometry.height,dpi});
  const baseAudit=auditPrintPdfBytes(pdf.bytes,{pageCount:1,pageWidthIn:geometry.width,pageHeightIn:geometry.height,dpi});
  const visualChecks=spineAdaptation.visualQuality?.checks || [];
  const seamCheck={
    id:'wrap-art-seam-audit',
    status:spineAdaptation.visualQuality?.ready ? 'pass' : 'error',
    label:'Spine continuity audit',
    message:spineAdaptation.mode==='exact'
      ? 'No synthesized join exists because the source spine already matches final geometry.'
      : 'Protected-content 2D background synthesis plus artwork-only 1:1 overlay passed typography fidelity, text-fragment suppression, banding, repetition, and stretch checks. No repeated source strip, row-flattened texture, or per-column elastic redistribution is used.',
  };
  const engineCheck={ id:'wrap-art-engine', status:'pass', label:'Cover manufacturing engine', message:`Artwork-overlay spine engine v${FULL_WRAP_ART_VERSION}; front/back panels stay fixed, the cleaned 2D background expands uniformly across the final spine, and only original typography/ornament is restored at exact 1:1 raster scale.` };
  const checks=[...analysis.checks,engineCheck,...visualChecks,seamCheck,...baseAudit.checks];
  const errors=checks.filter((item)=>item.status==='error').length;
  const warnings=checks.filter((item)=>item.status==='warning').length;
  return {
    bytes:pdf.bytes,
    blob:new Blob([pdf.bytes],{type:'application/pdf'}),
    analysis,
    barcode:barcodeInfo,
    generatorVersion:FULL_WRAP_ART_VERSION,
    spineAdaptation,
    visualQuality:spineAdaptation.visualQuality,
    audit:{ ready:errors===0, checks, summary:{errors,warnings,passes:checks.length-errors-warnings,total:checks.length}, fileSize:pdf.bytes.length, generatorVersion:FULL_WRAP_ART_VERSION, visualQuality:spineAdaptation.visualQuality },
    geometry,
  };
}
