const PDF_PREFIX = '%PDF-';
const MEDIA_BOX_RE = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/;

function bytesToLatin1(bytes) {
  const size = bytes.length;
  const head = bytes.subarray(0, Math.min(size, 4 * 1024 * 1024));
  const tail = size > head.length ? bytes.subarray(Math.max(head.length, size - 1024 * 1024)) : new Uint8Array();
  let text = '';
  const chunk = 0x8000;
  for (const part of [head, tail]) {
    for (let i = 0; i < part.length; i += chunk) text += String.fromCharCode(...part.subarray(i, Math.min(part.length, i + chunk)));
  }
  return text;
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
  return { ok:true, widthPt, heightPt, widthIn:widthPt / 72, heightIn:heightPt / 72 };
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
  const ready = checks.every((item) => item.status !== 'error');
  return { ready, source:'uploaded-full-wrap', checks, fileSize:a.fileSize, sha256:a.sha256, pageCount:Number(pageCount)||0, proofSignature, widthIn:a.widthIn, heightIn:a.heightIn, expectedWidthIn:expectedWidth, expectedHeightIn:expectedHeight, generatedAt:new Date().toISOString() };
}
