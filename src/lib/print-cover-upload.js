const PDF_PREFIX = '%PDF-';
const MEDIA_BOX_RE = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/;
const KDP_PRINT_FILE_LIMIT_BYTES = 650 * 1024 * 1024;

function bytesToLatin1(bytes) {
  const size = bytes.length;
  const head = bytes.subarray(0, Math.min(size, 6 * 1024 * 1024));
  const tail = size > head.length ? bytes.subarray(Math.max(head.length, size - 2 * 1024 * 1024)) : new Uint8Array();
  let text = '';
  const chunk = 0x8000;
  for (const part of [head, tail]) {
    for (let i = 0; i < part.length; i += chunk) text += String.fromCharCode(...part.subarray(i, Math.min(part.length, i + chunk)));
  }
  return text;
}

function countToken(text, regex) { return [...String(text || '').matchAll(regex)].length; }

function imageDimensions(text = '') {
  const out = [];
  const source = String(text || '');
  const token = /\/Subtype\s*\/?Image\b/g;
  for (const hit of source.matchAll(token)) {
    // PDF image dictionaries are frequently compact (`/Height 2775/.../Subtype/Image/.../Width 3960`),
    // so inspect both sides of the subtype marker rather than assuming key order.
    const window = source.slice(Math.max(0, hit.index - 900), Math.min(source.length, hit.index + 900));
    const widths = [...window.matchAll(/\/Width\s+(\d+)/g)].map((m)=>Number(m[1])).filter((n)=>n>0);
    const heights = [...window.matchAll(/\/Height\s+(\d+)/g)].map((m)=>Number(m[1])).filter((n)=>n>0);
    const width = widths.length ? widths[widths.length - 1] : 0;
    const height = heights.length ? heights[heights.length - 1] : 0;
    if (width > 0 && height > 0 && !out.some((item) => item.width === width && item.height === height)) out.push({ width, height });
  }
  return out;
}

function likelyPageCount(text = '') {
  const direct = countToken(text, /\/Type\s*\/Page(?!s)\b/g);
  if (direct) return direct;
  const counts = [...text.matchAll(/\/Type\s*\/Pages\b[\s\S]{0,300}?\/Count\s+(\d+)/g)].map((match) => Number(match[1])).filter((n) => n > 0);
  return counts.length ? Math.max(...counts) : 0;
}

function safePdfFileName(fileName = '') {
  const value = String(fileName || '');
  return Boolean(value && value.length <= 220 && /^[\x20-\x7E]+$/.test(value) && !/[\\/:*?"<>|]/.test(value) && /\.pdf$/i.test(value));
}

export function parsePrintCoverPdfBytes(arrayBuffer) {
  const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer || 0);
  if (bytes.length < 8) return { ok:false, reason:'empty' };
  const prefix = String.fromCharCode(...bytes.subarray(0, 5));
  if (prefix !== PDF_PREFIX) return { ok:false, reason:'not-pdf' };
  const text = bytesToLatin1(bytes);
  const media = text.match(MEDIA_BOX_RE);
  if (!media) return { ok:false, reason:'missing-mediabox' };
  const x0 = Number(media[1]); const y0 = Number(media[2]); const x1 = Number(media[3]); const y1 = Number(media[4]);
  const widthPt = Math.abs(x1 - x0); const heightPt = Math.abs(y1 - y0);
  if (!(widthPt > 0 && heightPt > 0)) return { ok:false, reason:'invalid-mediabox' };
  const dims = imageDimensions(text);
  const largestImage = dims.sort((a,b) => (b.width*b.height)-(a.width*a.height))[0] || null;
  const pdfVersion = (text.match(/^%PDF-([\d.]+)/)?.[1] || '').trim();
  return {
    ok:true, widthPt, heightPt, widthIn:widthPt / 72, heightIn:heightPt / 72,
    pageCount:likelyPageCount(text), pdfVersion,
    technicalScan:'byte-signature-v1',
    objectStreams:/\/ObjStm\b/.test(text),
    encrypted:/\/Encrypt\b/.test(text),
    annotations:/\/Annots\b/.test(text),
    acroForm:/\/AcroForm\b/.test(text),
    xfa:/\/XFA\b/.test(text),
    javascript:/\/JavaScript\b|\/JS\s*\(/.test(text),
    openAction:/\/OpenAction\b/.test(text),
    transparency:/\/SMask\b|\/Transparency\b|\/Group\s*<<[\s\S]{0,200}?\/S\s*\/Transparency\b/.test(text),
    cropBox:/\/CropBox\b/.test(text),
    trimBox:/\/TrimBox\b/.test(text),
    bleedBox:/\/BleedBox\b/.test(text),
    artBox:/\/ArtBox\b/.test(text),
    fontObjectCount:countToken(text, /\/Type\s*\/Font\b/g),
    embeddedFontFileCount:countToken(text, /\/FontFile(?:2|3)?\b/g),
    imageObjectCount:countToken(text, /\/Subtype\s*\/?Image\b/g),
    largestImageWidth:largestImage?.width || 0,
    largestImageHeight:largestImage?.height || 0,
  };
}

export function normalizeUploadedPrintCoverPdf(input = null) {
  if (!input || typeof input !== 'object') return null;
  if (!input.dataUrl || !input.sha256) return null;
  return {
    fileName:String(input.fileName || 'print-cover.pdf').slice(0, 220),
    mimeType:'application/pdf',
    fileSize:Number(input.fileSize) || 0,
    sha256:String(input.sha256),
    dataUrl:String(input.dataUrl),
    widthPt:Number(input.widthPt) || 0,
    heightPt:Number(input.heightPt) || 0,
    widthIn:Number(input.widthIn) || 0,
    heightIn:Number(input.heightIn) || 0,
    pageCount:Number(input.pageCount) || 0,
    pdfVersion:String(input.pdfVersion || ''),
    technicalScan:String(input.technicalScan || ''),
    objectStreams:Boolean(input.objectStreams),
    encrypted:Boolean(input.encrypted),
    annotations:Boolean(input.annotations),
    acroForm:Boolean(input.acroForm),
    xfa:Boolean(input.xfa),
    javascript:Boolean(input.javascript),
    openAction:Boolean(input.openAction),
    transparency:Boolean(input.transparency),
    cropBox:Boolean(input.cropBox),
    trimBox:Boolean(input.trimBox),
    bleedBox:Boolean(input.bleedBox),
    artBox:Boolean(input.artBox),
    fontObjectCount:Number(input.fontObjectCount) || 0,
    embeddedFontFileCount:Number(input.embeddedFontFileCount) || 0,
    imageObjectCount:Number(input.imageObjectCount) || 0,
    largestImageWidth:Number(input.largestImageWidth) || 0,
    largestImageHeight:Number(input.largestImageHeight) || 0,
    updatedAt:input.updatedAt || null,
  };
}

export function auditUploadedPrintCoverPdf({ asset, geometry, pageCount = 0, proofSignature = '' } = {}) {
  const a = normalizeUploadedPrintCoverPdf(asset);
  const checks = [];
  if (!a) {
    checks.push({ id:'uploaded-cover-file', status:'error', label:'Full-wrap cover PDF', message:'Attach the full-wrap KDP cover PDF.' });
    return { ready:false, source:'uploaded-full-wrap', checks, fileSize:0, sha256:'', pageCount:Number(pageCount)||0, proofSignature };
  }
  checks.push({ id:'uploaded-cover-file', status:'pass', label:'Full-wrap cover PDF', message:`${a.fileName} is attached.` });
  checks.push({ id:'uploaded-cover-filename', status:safePdfFileName(a.fileName) ? 'pass' : 'error', label:'KDP-safe cover filename', message:safePdfFileName(a.fileName) ? 'Filename uses printable ASCII and no operating-system reserved characters.' : 'Rename the cover PDF using plain letters/numbers/spaces/hyphens/underscores before KDP upload.' });
  checks.push({ id:'uploaded-cover-one-page', status:a.pageCount === 1 ? 'pass' : a.pageCount > 1 ? 'error' : 'warning', label:'Single-page full wrap', message:a.pageCount === 1 ? 'One PDF page contains back + spine + front as KDP requires.' : a.pageCount > 1 ? `This cover PDF contains ${a.pageCount} pages; KDP requires one continuous cover page.` : 'Page object count could not be proven from the byte scan; KDP Print Previewer remains authoritative.' });

  const expectedWidth = Number(geometry?.width) || 0;
  const expectedHeight = Number(geometry?.height) || 0;
  const widthDelta = Math.abs((Number(a.widthIn) || 0) - expectedWidth);
  const heightDelta = Math.abs((Number(a.heightIn) || 0) - expectedHeight);
  const dimensionsKnown = a.widthIn > 0 && a.heightIn > 0;
  const dimensionsMatch = dimensionsKnown && widthDelta <= 0.02 && heightDelta <= 0.02;
  checks.push({
    id:'uploaded-cover-geometry',
    status:dimensionsMatch ? 'pass' : 'error',
    label:'Cover canvas matches final interior',
    message:dimensionsMatch
      ? `${a.widthIn.toFixed(4)} × ${a.heightIn.toFixed(4)} in matches the ${Number(pageCount)||0}-page cover geometry.`
      : dimensionsKnown
        ? `Attached PDF is ${a.widthIn.toFixed(4)} × ${a.heightIn.toFixed(4)} in; final interior needs ${expectedWidth.toFixed(4)} × ${expectedHeight.toFixed(4)} in.`
        : 'YasReady could not read the PDF MediaBox, so the cover cannot be certified.',
  });
  checks.push({ id:'uploaded-cover-bleed', status:dimensionsMatch ? 'pass' : 'error', label:'Required cover bleed canvas', message:dimensionsMatch ? 'Full-wrap dimensions include the KDP-required outer cover bleed for this trim/spine.' : 'Exact full-wrap geometry must pass before bleed canvas can be certified.' });
  checks.push({ id:'uploaded-cover-security', status:a.encrypted ? 'error' : 'pass', label:'No PDF security / encryption', message:a.encrypted ? 'Encryption/security dictionary detected; KDP can reject locked files.' : 'No encryption dictionary detected.' });
  const interactive = a.annotations || a.acroForm || a.xfa || a.javascript || a.openAction;
  checks.push({ id:'uploaded-cover-interactive', status:interactive ? 'error' : 'pass', label:'No annotations / forms / scripts', message:interactive ? 'Interactive PDF structures were detected. Flatten/remove annotations, forms, XFA, JavaScript, and open actions before KDP upload.' : 'No annotation, form, XFA, JavaScript, or open-action signatures detected.' });
  checks.push({ id:'uploaded-cover-transparency', status:a.transparency ? 'warning' : 'pass', label:'Flattened transparency', message:a.transparency ? 'Transparency/soft-mask signatures were detected. This is a review warning, not an automatic rejection: flatten transparency when re-exporting if practical and confirm the rendered cover in KDP Print Previewer.' : 'No transparency/soft-mask signature detected in the scanned PDF structures.' });
  const fontsOk = a.fontObjectCount === 0 || a.embeddedFontFileCount > 0;
  checks.push({ id:'uploaded-cover-fonts', status:fontsOk ? 'pass' : 'error', label:'Cover fonts embedded or outlined', message:a.fontObjectCount === 0 ? 'No live PDF font objects detected; cover text appears outlined/rasterized.' : fontsOk ? `${a.fontObjectCount} font object(s) detected with embedded font-file resources.` : `${a.fontObjectCount} live font object(s) detected but no embedded font-file resource was visible. Re-export with fonts embedded.` });
  if (!a.imageObjectCount) {
    checks.push({ id:'uploaded-cover-images', status:'pass', label:'Cover image resolution', message:'No raster image objects were visible in the byte scan; vector/outlined cover content does not need raster PPI certification.' });
  } else if (a.largestImageWidth && a.largestImageHeight && a.widthIn && a.heightIn) {
    const ppi = Math.min(a.largestImageWidth/a.widthIn, a.largestImageHeight/a.heightIn);
    const singleRaster = a.imageObjectCount === 1;
    checks.push({ id:'uploaded-cover-images', status:singleRaster && ppi >= 300 ? 'pass' : 'warning', label:'Cover image resolution', message:singleRaster ? `${Math.round(ppi)} effective PPI for the full-cover raster image; KDP minimum is 300 DPI.` : `${a.imageObjectCount} raster image object(s) detected. Individual effective PPI cannot be proven safely from static PDF bytes; verify any warning in KDP Print Previewer.` });
  } else {
    checks.push({ id:'uploaded-cover-images', status:'warning', label:'Cover image resolution', message:`${a.imageObjectCount} raster image object(s) detected, but their effective placement PPI could not be proven from static PDF bytes. KDP Print Previewer remains authoritative.` });
  }
  const extraBoxes = a.cropBox || a.trimBox || a.bleedBox || a.artBox;
  checks.push({ id:'uploaded-cover-page-boxes', status:extraBoxes ? 'warning' : 'pass', label:'No template/crop-mark baggage', message:extraBoxes ? 'Additional PDF page boxes are present. They are not automatically crop marks, but inspect the exported cover for template guides/color bars before KDP upload.' : 'No extra CropBox/TrimBox/BleedBox/ArtBox structures detected.' });
  checks.push({ id:'uploaded-cover-filesize', status:a.fileSize <= KDP_PRINT_FILE_LIMIT_BYTES ? 'pass' : 'error', label:'KDP cover file size', message:`${(a.fileSize/1024/1024).toFixed(1)} MB ${a.fileSize <= KDP_PRINT_FILE_LIMIT_BYTES ? 'is within' : 'exceeds'} the modeled 650 MB KDP upload ceiling.` });
  if (a.objectStreams) checks.push({ id:'uploaded-cover-object-streams', status:'warning', label:'Compressed PDF object streams', message:'This PDF uses compressed object streams, so static byte signatures cannot prove every internal object. YasReady still checks geometry/security signatures; KDP Print Previewer is the final external validator.' });

  const errors = checks.filter((item) => item.status === 'error').length;
  const warnings = checks.filter((item) => item.status === 'warning').length;
  const ready = errors === 0;
  return { ready, source:'uploaded-full-wrap', checks, summary:{errors,warnings,passes:checks.length-errors-warnings,total:checks.length}, fileSize:a.fileSize, sha256:a.sha256, pageCount:Number(pageCount)||0, proofSignature, widthIn:a.widthIn, heightIn:a.heightIn, expectedWidthIn:expectedWidth, expectedHeightIn:expectedHeight, generatedAt:new Date().toISOString(), technical:{ pageCount:a.pageCount, encrypted:a.encrypted, annotations:a.annotations, acroForm:a.acroForm, transparency:a.transparency, fontObjectCount:a.fontObjectCount, embeddedFontFileCount:a.embeddedFontFileCount, imageObjectCount:a.imageObjectCount, objectStreams:a.objectStreams } };
}
