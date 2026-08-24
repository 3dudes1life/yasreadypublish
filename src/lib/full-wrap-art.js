import { buildRasterPdf, auditPrintPdfBytes, PRINT_PDF_DPI } from './print-pdf.js';
import { paperbackSpineFactor } from './cover-brain.js';
import { barcodePdfVectorCommands, normalizeBarcodeBrain, normalizePrintIsbn } from './barcode-brain.js';

export const FULL_WRAP_ART_VERSION = 5;
// v5: content-aware elastic retargeting. Never tile full-height strips, never flatten rows.
// Seamless spine expansion is now a measured content-aware warp, not texture synthesis.

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
      ? `YasReady will keep the front and back panels fixed, protect high-detail spine artwork, and make low-detail teal/texture columns absorb the extra width from ${sourceSpineIn.toFixed(3)} to ${targetSpine.toFixed(3)} in. No source strip is tiled and no row-average texture is generated.`
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
    backgroundMode:'content-aware-horizontal-retarget',
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

export function analyzeSpineRasterQuality(rgba, width, height, { protectedMedianStretch=1, protectedP90Stretch=1, maxAssignedStretch=1 } = {}) {
  const w=Math.round(width), h=Math.round(height);
  const quarter=Math.max(3,Math.floor(w*0.24));
  const leftBand=regionBandingScore(rgba,w,h,0,quarter);
  const rightBand=regionBandingScore(rgba,w,h,w-quarter,w);
  const leftRepeat=periodicityDip(rgba,w,h,0,quarter);
  const rightRepeat=periodicityDip(rgba,w,h,w-quarter,w);
  const worstBand=Math.max(leftBand,rightBand);
  const worstRepeat=Math.max(leftRepeat.score,rightRepeat.score);
  const checks=[
    { id:'wrap-art-content-protection', status:protectedP90Stretch<=1.28?'pass':'error', label:'Spine artwork protection', message:`High-detail spine columns: median ${protectedMedianStretch.toFixed(2)}×, 90th percentile ${protectedP90Stretch.toFixed(2)}× stretch. YasReady protects lettering and ornament columns from carrying the new width.` },
    { id:'wrap-art-horizontal-banding', status:worstBand<=4?'pass':'error', label:'Horizontal banding detector', message:`Worst outer-spine banding score ${worstBand.toFixed(2)} (limit 4.00).` },
    { id:'wrap-art-periodic-repetition', status:worstRepeat<=1.9?'pass':'error', label:'Repeated texture detector', message:`Worst short-period repetition score ${worstRepeat.toFixed(2)} (limit 1.90).${worstRepeat>1.9 ? ` Repeating pattern detected near ${leftRepeat.score>=rightRepeat.score?leftRepeat.lag:rightRepeat.lag}px.` : ''}` },
    { id:'wrap-art-background-stretch', status:maxAssignedStretch<=4.5?'pass':'error', label:'Low-detail background stretch', message:`Maximum low-detail column stretch ${maxAssignedStretch.toFixed(2)}× (limit 4.50×).` },
  ];
  const errors=checks.filter((item)=>item.status==='error').length;
  return { ready:errors===0, checks, summary:{errors,passes:checks.length-errors,total:checks.length}, metrics:{leftBand,rightBand,leftRepeat,rightRepeat,worstBand,worstRepeat,maxAssignedStretch,protectedMedianStretch,protectedP90Stretch} };
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
  const energy=computeSpineColumnEnergy(sourceData.data,sourceCanvas.width,sourceCanvas.height);
  const stretchMap=buildContentAwareStretchMap(energy,plan.targetWidthPx);
  const targetRgba=retargetSpineRgba(sourceData.data,sourceCanvas.width,sourceCanvas.height,stretchMap);
  const visualQuality=analyzeSpineRasterQuality(targetRgba,plan.targetWidthPx,sourceCanvas.height,stretchMap);
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
    stretchMap:{ edgeGuardPx:stretchMap.edgeGuardPx, maxAssignedStretch:stretchMap.maxAssignedStretch, protectedMedianStretch:stretchMap.protectedMedianStretch, protectedP90Stretch:stretchMap.protectedP90Stretch },
    visualQuality,
  };
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
  if (barcode.coverPlacement!=='none') {
    const b=geometry.barcode;
    const knockout=b.knockout||b;
    ctx.save();
    ctx.fillStyle='#ffffff';
    ctx.fillRect(knockout.x*dpi,knockout.y*dpi,knockout.width*dpi,knockout.height*dpi);
    ctx.restore();
    if (barcode.coverPlacement==='amazon') {
      ctx.save();
      ctx.fillStyle='#777';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.font=`${Math.max(12,Math.round(0.055*dpi))}px Arial, sans-serif`;
      ctx.fillText('AMAZON BARCODE RESERVED',(b.x+b.width/2)*dpi,(b.y+b.height/2)*dpi,(b.width-0.12)*dpi);
      ctx.restore();
    } else {
      const normalized=normalizePrintIsbn(isbn);
      if (!normalized.valid) throw new Error('A valid owned print ISBN is required before YasReady can place the cover barcode.');
      overlayPdf=barcodePdfVectorCommands(normalized.digits,{xIn:b.x,yTopIn:b.y,widthIn:b.width,heightIn:b.height,pageHeightIn:geometry.height});
      barcodeInfo={placement:'yasready',isbn:normalized.digits,vector:true};
    }
  }

  const jpegBytes=dataUrlToJpegBytes(canvas.toDataURL('image/jpeg',0.96));
  const pdf=buildRasterPdf({pages:[{jpegBytes,widthPx,heightPx,overlayPdf}],pageWidthIn:geometry.width,pageHeightIn:geometry.height,dpi});
  const baseAudit=auditPrintPdfBytes(pdf.bytes,{pageCount:1,pageWidthIn:geometry.width,pageHeightIn:geometry.height,dpi});
  const visualChecks=spineAdaptation.visualQuality?.checks || [];
  const seamCheck={
    id:'wrap-art-seam-audit',
    status:spineAdaptation.visualQuality?.ready ? 'pass' : 'error',
    label:'Spine continuity audit',
    message:spineAdaptation.mode==='exact'
      ? 'No synthesized join exists because the source spine already matches final geometry.'
      : 'Content-aware retargeting passed banding, repetition, artwork-protection, and stretch-ceiling checks. No repeated source strip or row-flattened texture is used.',
  };
  const engineCheck={ id:'wrap-art-engine', status:'pass', label:'Cover manufacturing engine', message:`Content-aware elastic spine engine v${FULL_WRAP_ART_VERSION}; front/back panels remain fixed while low-detail spine columns absorb added width.` };
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
