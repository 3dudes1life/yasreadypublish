import { buildRasterPdf, auditPrintPdfBytes, PRINT_PDF_DPI } from './print-pdf.js';
import { coverBrainChecks, coverGeometry, COVER_FILE_LIMIT_BYTES } from './cover-brain.js';
import { barcodePdfVectorCommands, normalizeBarcodeBrain } from './barcode-brain.js';

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Cover artwork could not be decoded.'));
    image.src = dataUrl;
  });
}

function hexTextColor(value) { return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : '#ffffff'; }

function coverDrawImage(ctx, image, x, y, width, height) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let sx = 0, sy = 0, sw = image.width, sh = image.height;
  if (sourceRatio > targetRatio) {
    sw = image.height * targetRatio;
    sx = (image.width - sw) / 2;
  } else {
    sh = image.width / targetRatio;
    sy = (image.height - sh) / 2;
  }
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

function wrapLines(ctx, text, maxWidth) {
  const paragraphs = String(text || '').split(/\n+/);
  const lines = [];
  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function dataUrlToBytes(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/jpeg;base64,(.+)$/s);
  if (!match) throw new Error('Cover canvas did not produce JPEG data.');
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function renderCoverPdf({ project, editionType = 'paperback', production = {}, pageCount = 0, cover = {}, dpi = PRINT_PDF_DPI } = {}) {
  const edition = project?.editions?.[editionType] || {};
  const barcodeBrain = normalizeBarcodeBrain(edition.barcodeBrain || {});
  const metadata = edition.kdpMetadata || {};
  const brain = coverBrainChecks({ type:editionType, production, pageCount, cover, ebookCover:project?.editions?.ebook?.cover || null, barcodeBrain, isbnMode:metadata.isbnMode || 'kdp-free', isbn:metadata.isbn || '' });
  if (!brain.ready) throw new Error('Cover Brain blocked the production cover PDF. Resolve the cover checks first.');
  const geometry = brain.geometry;
  const widthPx = Math.round(geometry.width * dpi);
  const heightPx = Math.round(geometry.height * dpi);
  if (widthPx > 10000 || heightPx > 10000) throw new Error('Cover canvas exceeds YasReady’s safe 300 DPI browser rendering range.');
  const canvas = document.createElement('canvas');
  canvas.width = widthPx; canvas.height = heightPx;
  const ctx = canvas.getContext('2d', { alpha:false });
  if (!ctx) throw new Error('Canvas rendering is unavailable in this browser.');
  const px = (inch) => inch * dpi;
  ctx.fillStyle = geometry.cover.background || '#111111';
  ctx.fillRect(0, 0, widthPx, heightPx);

  const front = brain.frontArt;
  if (front?.dataUrl) {
    const image = await loadImage(front.dataUrl);
    const p = geometry.panels.front;
    const outer = editionType === 'paperback' ? geometry.bleed : geometry.wrap;
    const x = px(p.x);
    const y = 0;
    const w = px(p.width + outer);
    const h = heightPx;
    coverDrawImage(ctx, image, x, y, w, h);
  } else {
    const p = geometry.panels.front;
    ctx.save();
    ctx.fillStyle = hexTextColor(geometry.cover.textColor);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(0.28*dpi)}px Arial, sans-serif`;
    const max = px(p.width - 1);
    const lines = wrapLines(ctx, project?.title || 'Untitled', max).slice(0, 4);
    const start = px(p.y + p.height * 0.42) - ((lines.length-1) * 0.17*dpi);
    lines.forEach((line, i) => ctx.fillText(line, px(p.x + p.width/2), start + i*0.34*dpi, max));
    ctx.font = `400 ${Math.round(0.14*dpi)}px Arial, sans-serif`;
    ctx.fillText(project?.author || '', px(p.x + p.width/2), px(p.y + p.height*0.68), max);
    ctx.restore();
  }

  const back = geometry.panels.back;
  if (geometry.cover.backArt?.dataUrl) {
    const image = await loadImage(geometry.cover.backArt.dataUrl);
    const outer = editionType === 'paperback' ? geometry.bleed : geometry.wrap;
    coverDrawImage(ctx, image, 0, 0, px(back.width + outer), heightPx);
  }
  const clearRight = barcodeBrain.coverPlacement !== 'none' ? 2.3 : 0.55;
  if (geometry.cover.backCopy) {
    ctx.save();
    ctx.fillStyle = hexTextColor(geometry.cover.textColor);
    ctx.font = `400 ${Math.round(0.105*dpi)}px Georgia, serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const left = px(back.x + 0.5), top = px(back.y + 0.75), maxWidth = px(Math.max(1.5, back.width - 1));
    const lines = wrapLines(ctx, geometry.cover.backCopy, maxWidth);
    let y = top;
    for (const line of lines) {
      if (y > px(back.y + back.height - 2)) break;
      ctx.fillText(line, left, y, maxWidth); y += 0.16*dpi;
    }
    ctx.restore();
  }
  if (geometry.cover.publisher) {
    ctx.save(); ctx.fillStyle = hexTextColor(geometry.cover.textColor); ctx.font = `700 ${Math.round(0.09*dpi)}px Arial, sans-serif`; ctx.textAlign='left';
    ctx.fillText(geometry.cover.publisher, px(back.x + 0.5), px(back.y + back.height - 0.55), px(Math.max(1.5, back.width - clearRight)));
    ctx.restore();
  }

  if (barcodeBrain.coverPlacement !== 'none') {
    const b = geometry.barcode;
    ctx.save(); ctx.fillStyle='#ffffff'; ctx.fillRect(px(b.x), px(b.y), px(b.width), px(b.height));
    if (barcodeBrain.coverPlacement === 'amazon') {
      ctx.fillStyle='#777777'; ctx.font=`400 ${Math.round(0.055*dpi)}px Arial, sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('AMAZON BARCODE RESERVED', px(b.x+b.width/2), px(b.y+b.height/2), px(b.width-0.12));
    }
    ctx.restore();
  }

  if (geometry.spineTextAllowed && geometry.cover.spineTitle) {
    const s = geometry.panels.spine;
    ctx.save();
    ctx.translate(px(s.x + s.width/2), px(s.y + s.height/2));
    ctx.rotate(-Math.PI/2);
    ctx.fillStyle = hexTextColor(geometry.cover.textColor); ctx.textAlign='center'; ctx.textBaseline='middle';
    const maxWidth = px(Math.max(0.5, s.height - 1.1));
    const fontPx = Math.max(18, Math.min(0.14*dpi, px(Math.max(0.08, s.width - geometry.spineSafeInset*2)) * 0.48));
    ctx.font = `700 ${Math.round(fontPx)}px Arial, sans-serif`;
    ctx.fillText(geometry.cover.spineTitle, 0, geometry.cover.spineAuthor ? -0.09*dpi : 0, maxWidth);
    if (geometry.cover.spineAuthor) { ctx.font=`400 ${Math.max(14,Math.round(fontPx*.72))}px Arial, sans-serif`; ctx.fillText(geometry.cover.spineAuthor,0,0.11*dpi,maxWidth); }
    ctx.restore();
  }

  const jpegBytes = dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.94));
  const overlayPdf = barcodeBrain.coverPlacement === 'yasready'
    ? barcodePdfVectorCommands(brain.barcodeIsbn, { xIn:geometry.barcode.x, yTopIn:geometry.barcode.y, widthIn:geometry.barcode.width, heightIn:geometry.barcode.height, pageHeightIn:geometry.height })
    : '';
  const pdf = buildRasterPdf({ pages:[{ jpegBytes, widthPx, heightPx, overlayPdf }], pageWidthIn:geometry.width, pageHeightIn:geometry.height, dpi });
  const baseAudit = auditPrintPdfBytes(pdf.bytes, { pageCount:1, pageWidthIn:geometry.width, pageHeightIn:geometry.height, dpi });
  const coverChecks = [...brain.checks];
  if (pdf.bytes.length > COVER_FILE_LIMIT_BYTES) coverChecks.push({ id:'cover-file-size',status:'error',label:'Cover file size',message:'Cover PDF exceeds KDP’s 650 MB ceiling.' });
  else coverChecks.push({ id:'cover-file-size',status:'pass',label:'Cover file size',message:`${(pdf.bytes.length/1024/1024).toFixed(1)} MB cover PDF.` });
  const errors = [...baseAudit.checks, ...coverChecks].filter((item) => item.status === 'error').length;
  const warnings = [...baseAudit.checks, ...coverChecks].filter((item) => item.status === 'warning').length;
  return {
    bytes:pdf.bytes,
    blob:new Blob([pdf.bytes], { type:'application/pdf' }),
    geometry,
    barcode:{ placement:barcodeBrain.coverPlacement, isbn:brain.barcodeIsbn || '', vectorOverlay:Boolean(overlayPdf) },
    audit:{ ready:errors===0, checks:[...baseAudit.checks,...coverChecks], summary:{errors,warnings,passes:baseAudit.checks.length+coverChecks.length-errors-warnings}, fileSize:pdf.bytes.length },
  };
}
