export const BARCODE_BRAIN_VERSION = 1;
export const EAN13_MODULE_COUNT = 95;
export const KDP_BARCODE_WIDTH_IN = 2;
export const KDP_BARCODE_HEIGHT_IN = 1.2;
export const KDP_BARCODE_MIN_WIDTH_IN = 1.4;
export const KDP_BARCODE_MIN_HEIGHT_IN = 0.8;
export const KDP_BARCODE_SAFE_IN = 0.25;
// Replacement knockout is deliberately larger than the barcode itself so an
// existing placeholder ISBN/price/human-readable digits cannot ghost around the
// new code when YasReady stamps an already-designed full-wrap cover. The size
// mirrors the Book 2 placeholder reference (about 2.05 × 1.65 in) while the
// actual KDP barcode remains the recommended 2 × 1.2 in.
export const KDP_BARCODE_KNOCKOUT_WIDTH_IN = 2.05;
export const KDP_BARCODE_KNOCKOUT_HEIGHT_IN = 1.65;

const L = Object.freeze({
  0:'0001101',1:'0011001',2:'0010011',3:'0111101',4:'0100011',
  5:'0110001',6:'0101111',7:'0111011',8:'0110111',9:'0001011',
});
const G = Object.freeze({
  0:'0100111',1:'0110011',2:'0011011',3:'0100001',4:'0011101',
  5:'0111001',6:'0000101',7:'0010001',8:'0001001',9:'0010111',
});
const R = Object.freeze({
  0:'1110010',1:'1100110',2:'1101100',3:'1000010',4:'1011100',
  5:'1001110',6:'1010000',7:'1000100',8:'1001000',9:'1110100',
});
const PARITY = Object.freeze({
  0:'LLLLLL',1:'LLGLGG',2:'LLGGLG',3:'LLGGGL',4:'LGLLGG',
  5:'LGGLLG',6:'LGGGLL',7:'LGLGLG',8:'LGLGGL',9:'LGGLGL',
});

export function digitsOnly(value = '') { return String(value || '').replace(/[^0-9Xx]/g, '').toUpperCase(); }

export function isbn13CheckDigit(first12 = '') {
  const digits = String(first12).replace(/\D/g, '');
  if (digits.length !== 12) return null;
  const sum = [...digits].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

export function isbn10CheckDigit(first9 = '') {
  const digits = String(first9).replace(/\D/g, '');
  if (digits.length !== 9) return null;
  const sum = [...digits].reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const remainder = (11 - (sum % 11)) % 11;
  return remainder === 10 ? 'X' : String(remainder);
}

export function validateIsbn13(value = '') {
  const digits = digitsOnly(value);
  if (!/^97[89]\d{10}$/.test(digits)) return { valid:false, digits, reason:'ISBN-13 must contain 13 digits and begin with 978 or 979.' };
  const expected = isbn13CheckDigit(digits.slice(0,12));
  if (digits[12] !== expected) return { valid:false, digits, reason:`ISBN-13 check digit should be ${expected}.` };
  return { valid:true, digits, reason:'Valid ISBN-13.' };
}

export function validateIsbn10(value = '') {
  const digits = digitsOnly(value);
  if (!/^\d{9}[\dX]$/.test(digits)) return { valid:false, digits, reason:'ISBN-10 must contain 10 digits; only the final check digit may be X.' };
  const expected = isbn10CheckDigit(digits.slice(0,9));
  if (digits[9] !== expected) return { valid:false, digits, reason:`ISBN-10 check digit should be ${expected}.` };
  return { valid:true, digits, reason:'Valid ISBN-10.' };
}

export function isbn10To13(value = '') {
  const check = validateIsbn10(value);
  if (!check.valid) return { valid:false, digits:'', reason:check.reason };
  const first12 = `978${check.digits.slice(0,9)}`;
  const digits = `${first12}${isbn13CheckDigit(first12)}`;
  return { valid:true, digits, reason:'ISBN-10 converted to ISBN-13.' };
}

export function normalizePrintIsbn(value = '') {
  const raw = digitsOnly(value);
  if (raw.length === 13) return validateIsbn13(raw);
  if (raw.length === 10) return isbn10To13(raw);
  return { valid:false, digits:raw, reason:'Enter a valid 13-digit ISBN (or legacy ISBN-10).' };
}

export function formatIsbnCompact(value = '') {
  const normalized = normalizePrintIsbn(value);
  if (!normalized.valid) return String(value || '').trim();
  const d = normalized.digits;
  // We cannot infer publisher registration ranges without the ISBN agency table,
  // so the barcode itself uses canonical digits and the display groups only the
  // standard prefix/check digit. This avoids inventing a false registration split.
  return `ISBN ${d.slice(0,3)}-${d.slice(3,12)}-${d.slice(12)}`;
}

export function encodeEan13(value = '') {
  const normalized = normalizePrintIsbn(value);
  if (!normalized.valid) return { ok:false, digits:normalized.digits || '', bits:'', reason:normalized.reason };
  const digits = normalized.digits;
  const parity = PARITY[digits[0]];
  let bits = '101';
  for (let i = 1; i <= 6; i += 1) bits += (parity[i-1] === 'L' ? L : G)[digits[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i += 1) bits += R[digits[i]];
  bits += '101';
  return { ok:true, digits, bits, parity, modules:bits.length, reason:'EAN-13 encoded.' };
}

function reverseMap(table) { return Object.fromEntries(Object.entries(table).map(([digit,bits]) => [bits,digit])); }
const LR = reverseMap(L); const GR = reverseMap(G); const RR = reverseMap(R); const PR = reverseMap(PARITY);

export function decodeEan13Bits(bits = '') {
  const value = String(bits || '');
  if (value.length !== EAN13_MODULE_COUNT || !value.startsWith('101') || value.slice(45,50) !== '01010' || !value.endsWith('101')) return { ok:false, digits:'', reason:'EAN-13 guard/module structure is invalid.' };
  let parity = ''; let left = '';
  for (let i = 0; i < 6; i += 1) {
    const group = value.slice(3 + i*7, 10 + i*7);
    if (LR[group] != null) { parity += 'L'; left += LR[group]; }
    else if (GR[group] != null) { parity += 'G'; left += GR[group]; }
    else return { ok:false, digits:'', reason:'EAN-13 left-side pattern is invalid.' };
  }
  const first = PR[parity];
  if (first == null) return { ok:false, digits:'', reason:'EAN-13 parity pattern is invalid.' };
  let right = '';
  for (let i = 0; i < 6; i += 1) {
    const group = value.slice(50 + i*7, 57 + i*7);
    if (RR[group] == null) return { ok:false, digits:'', reason:'EAN-13 right-side pattern is invalid.' };
    right += RR[group];
  }
  const digits = `${first}${left}${right}`;
  const valid = validateIsbn13(digits);
  return { ok:valid.valid, digits, reason:valid.valid ? 'EAN-13 round-trip decoded to the same valid ISBN.' : valid.reason };
}

export function barcodeRoundTrip(value = '') {
  const encoded = encodeEan13(value);
  if (!encoded.ok) return { ok:false, encoded, decoded:null };
  const decoded = decodeEan13Bits(encoded.bits);
  return { ok:Boolean(decoded.ok && decoded.digits === encoded.digits), encoded, decoded };
}

export function defaultBarcodeBrain() {
  return {
    version:BARCODE_BRAIN_VERSION,
    enabled:false,
    includeInterior:false,
    coverPlacement:'amazon', // yasready | amazon | none
    interiorPlacement:'book1-bottom-left',
    includePriceSupplement:false,
    priceSupplement:'',
    uploadedCoverBarcodeConfirmed:false,
    lastGenerated:null,
  };
}

export function normalizeBarcodeBrain(input = {}) {
  const out = { ...defaultBarcodeBrain(), ...(input || {}) };
  out.version = BARCODE_BRAIN_VERSION;
  out.enabled = out.enabled !== false;
  out.includeInterior = out.includeInterior !== false;
  out.coverPlacement = ['yasready','amazon','none'].includes(out.coverPlacement) ? out.coverPlacement : 'yasready';
  out.interiorPlacement = out.interiorPlacement === 'book1-bottom-left' ? out.interiorPlacement : 'book1-bottom-left';
  out.includePriceSupplement = Boolean(out.includePriceSupplement);
  out.priceSupplement = String(out.priceSupplement || '').replace(/\D/g, '').slice(0,5);
  out.uploadedCoverBarcodeConfirmed = Boolean(out.uploadedCoverBarcodeConfirmed);
  out.lastGenerated = out.lastGenerated && typeof out.lastGenerated === 'object' ? out.lastGenerated : null;
  return out;
}

export function interiorBarcodeEnabled(project, type = 'paperback') {
  const edition = project?.editions?.[type] || {};
  const brain = normalizeBarcodeBrain(edition.barcodeBrain || {});
  return Boolean(brain.enabled && brain.includeInterior);
}

export function barcodePagePlan(basePageCount = 0, includeInterior = true) {
  const base = Math.max(0, Number(basePageCount) || 0);
  if (!includeInterior) return { enabled:false, basePageCount:base, spacerPages:0, barcodePages:0, finalPageCount:base, barcodePhysicalPage:null };
  // Physical page 1 is right/recto; even pages are left/verso. Match Book 1 by
  // making the barcode the final even/left page. If base is even, insert one
  // numbered spacer on the next right page before the barcode.
  const spacerPages = base % 2 === 0 ? 1 : 0;
  const finalPageCount = base + spacerPages + 1;
  return { enabled:true, basePageCount:base, spacerPages, barcodePages:1, finalPageCount, barcodePhysicalPage:finalPageCount, barcodeSide:'left' };
}

export function appendInteriorBarcodePages(preview, { isbn = '', enabled = true } = {}) {
  if (!preview?.pages) throw new Error('A paginated print preview is required before Barcode Brain can add the final ISBN page.');
  const normalized = normalizePrintIsbn(isbn);
  if (enabled && !normalized.valid) throw new Error(`Barcode Brain needs a valid print ISBN before pagination can finish. ${normalized.reason}`);
  if (!enabled) {
    preview.barcodePlan = barcodePagePlan(preview.pages.length, false);
    return preview;
  }
  const base = preview.pages.length;
  const plan = barcodePagePlan(base, true);
  const lastBookPage = preview.pages.reduce((max,page) => Number.isFinite(Number(page.bookPageNumber)) ? Math.max(max, Number(page.bookPageNumber)) : max, 0);
  let nextBook = lastBookPage;
  const addPage = ({ kind }) => {
    const number = preview.pages.length + 1;
    nextBook += 1;
    if (kind === 'spacer') {
      preview.pages.push({
        number, side:number % 2 ? 'right' : 'left', fragments:[], usedPx:0, intentionalBlank:false,
        blankReason:'barcode-left-alignment', bookPageNumber:nextBook, section:'back', chapterTitle:'', hasChapterTitle:false,
        hasGeneratedToc:false, showRunningHeader:false, showFolio:true, barcodeSpacer:true,
      });
    } else {
      preview.pages.push({
        number, side:number % 2 ? 'right' : 'left',
        fragments:[{ sourceBlockId:null, kind:'isbn-barcode-page', text:'', continuation:false, measuredHeight:0, previewHeight:null, startOffset:0, endOffset:0, isFinalPiece:true, suppressIndent:true, generated:true, isbn:normalized.digits }],
        usedPx:0, intentionalBlank:false, blankReason:'', bookPageNumber:nextBook, section:'back', chapterTitle:'', hasChapterTitle:false,
        hasGeneratedToc:false, showRunningHeader:false, showFolio:true, barcodePage:true, isbn:normalized.digits,
      });
    }
  };
  if (plan.spacerPages) addPage({ kind:'spacer' });
  addPage({ kind:'barcode' });
  preview.barcodePlan = { ...plan, isbn:normalized.digits, finalBookPageNumber:nextBook };
  preview.terminalBlankPages = 0;
  preview.barcodeSpacerPages = plan.spacerPages;
  return preview;
}

export function detectLabeledPrintIsbn(project, type = 'paperback') {
  const blocks = project?.manuscript?.blocks || [];
  const label = type === 'hardcover' ? /hard\s*cover|case\s*laminate/i : /paper\s*back|paperback\s*print|print\s*paperback/i;
  for (const block of blocks) {
    const text = String(block?.text || '');
    const match = text.match(/(?:97[89][\s-]*)?(?:\d[\s-]*){9,12}[\dXx]/);
    if (!match || !label.test(text)) continue;
    const normalized = normalizePrintIsbn(match[0]);
    if (normalized.valid) return { isbn:normalized.digits, blockId:block.id || null, text };
  }
  return null;
}

export function barcodeBrainChecks({ isbn = '', isbnMode = 'own', pageCount = 0, basePageCount = 0, brain:brainInput = {}, coverMode = 'build' } = {}) {
  const brain = normalizeBarcodeBrain(brainInput);
  const normalized = normalizePrintIsbn(isbn);
  const roundTrip = normalized.valid ? barcodeRoundTrip(normalized.digits) : { ok:false };
  const plan = barcodePagePlan(basePageCount || Math.max(0, Number(pageCount) - 1), brain.enabled && brain.includeInterior);
  const checks = [];
  if (!brain.enabled) {
    checks.push({ id:'barcode-isbn', status:'pass', label:'Print ISBN', message:isbnMode === 'kdp-free' ? 'KDP-free ISBN mode: YasReady barcode generation is intentionally disabled until Amazon assigns the ISBN.' : 'Barcode Brain is disabled for this edition.' });
    checks.push({ id:'barcode-roundtrip', status:'pass', label:'EAN-13 scanner round-trip', message:'Not required while YasReady barcode generation is disabled.' });
    checks.push({ id:'barcode-final-page', status:'pass', label:'Final interior barcode page', message:'Interior barcode page is disabled.' });
    checks.push({ id:'barcode-cover', status:brain.coverPlacement === 'none' ? 'warning' : 'pass', label:'Back-cover barcode', message:brain.coverPlacement === 'amazon' ? 'YasReady will leave the KDP barcode zone white for Amazon to place its barcode.' : 'No ISBN barcode will be placed on the cover.' });
    const warnings = checks.filter((item)=>item.status==='warning').length;
    return { ready:true, checks, summary:{errors:0,warnings,passes:checks.length-warnings,total:checks.length}, isbn:'', plan, roundTrip };
  }
  const hasNumber = isbnMode === 'own' && normalized.valid;
  checks.push({ id:'barcode-isbn', status:hasNumber ? 'pass' : 'error', label:'Print ISBN', message:hasNumber ? `${normalized.digits} is a valid ISBN-13 for barcode generation.` : isbnMode !== 'own' ? 'YasReady can only generate an ISBN barcode after the physical edition has a known ISBN. Choose your own ISBN or enter the KDP-assigned ISBN once available.' : normalized.reason });
  checks.push({ id:'barcode-roundtrip', status:roundTrip.ok ? 'pass' : 'error', label:'EAN-13 scanner round-trip', message:roundTrip.ok ? `Encoded and decoded back to ${normalized.digits}.` : 'Barcode pattern cannot be certified until the ISBN is valid.' });
  checks.push({ id:'barcode-final-page', status:!brain.includeInterior || (Number(pageCount) > 0 && Number(pageCount) % 2 === 0) ? 'pass' : 'error', label:'Final interior barcode page', message:!brain.includeInterior ? 'Interior barcode page is disabled.' : Number(pageCount) > 0 ? `Barcode page is locked to physical ${pageCount}, the final left/even page.` : 'Build pagination so Barcode Brain can lock the final left/even page.' });
  const coverMessage = brain.coverPlacement === 'yasready'
    ? coverMode === 'upload-pdf'
      ? 'YasReady will stamp the generated vector ISBN barcode onto the attached full-wrap PDF at export.'
      : coverMode === 'upload-art'
        ? 'YasReady will manufacture the final KDP cover from the finished artwork, knock out the old barcode footprint, and place the generated vector ISBN barcode.'
        : 'Cover Brain will draw the ISBN barcode into the KDP-safe back-cover zone.'
    : brain.coverPlacement === 'amazon'
      ? 'YasReady will leave the KDP barcode zone white for Amazon to place its barcode.'
      : 'No ISBN barcode will be placed on the cover.';
  checks.push({ id:'barcode-cover', status:brain.coverPlacement === 'none' ? 'warning' : 'pass', label:'Back-cover barcode', message:coverMessage });
  const errors = checks.filter((item)=>item.status==='error').length;
  const warnings = checks.filter((item)=>item.status==='warning').length;
  return { ready:errors===0, checks, summary:{errors,warnings,passes:checks.length-errors-warnings,total:checks.length}, isbn:normalized.valid ? normalized.digits : '', plan, roundTrip };
}

function svgText(value) { return String(value || '').replace(/[&<>"']/g,(c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;' }[c])); }

export function barcodeSvg(value = '', { widthIn = KDP_BARCODE_WIDTH_IN, heightIn = KDP_BARCODE_HEIGHT_IN, showIsbnLabel = true } = {}) {
  const encoded = encodeEan13(value);
  if (!encoded.ok) throw new Error(encoded.reason);
  const width = 2000; const height = Math.round(heightIn / widthIn * width);
  const quiet = 90; const top = showIsbnLabel ? 165 : 65; const bottom = 230;
  const barHeight = height - top - bottom;
  const module = (width - quiet*2) / EAN13_MODULE_COUNT;
  const bars = [];
  for (let i=0;i<encoded.bits.length;i+=1) {
    if (encoded.bits[i] !== '1') continue;
    const guard = i < 3 || (i >= 45 && i < 50) || i >= 92;
    bars.push(`<rect x="${(quiet+i*module).toFixed(3)}" y="${top}" width="${(module+0.15).toFixed(3)}" height="${(barHeight + (guard ? 70 : 0)).toFixed(3)}"/>`);
  }
  const label = showIsbnLabel ? `<text x="${width/2}" y="105" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="68" letter-spacing="5">${svgText(formatIsbnCompact(encoded.digits))}</text>` : '';
  const digits = `<text x="${width/2}" y="${height-55}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="92" letter-spacing="14">${encoded.digits}</text>`;
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${widthIn}in" height="${heightIn}in" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars.join('')}${label}${digits}</g></svg>`;
}

export function drawBarcodeToCanvas(ctx, value = '', { x=0, y=0, width=600, height=360, showIsbnLabel=true } = {}) {
  const encoded = encodeEan13(value);
  if (!encoded.ok) throw new Error(encoded.reason);
  ctx.save();
  ctx.fillStyle='#fff'; ctx.fillRect(x,y,width,height);
  const quiet = width * 0.045; const top = height * (showIsbnLabel ? 0.18 : 0.08); const bottom = height * 0.22;
  const barHeight = Math.max(1, height - top - bottom);
  const module = (width - quiet*2) / EAN13_MODULE_COUNT;
  ctx.fillStyle='#000';
  for (let i=0;i<encoded.bits.length;i+=1) {
    if (encoded.bits[i] !== '1') continue;
    const guard = i < 3 || (i >= 45 && i < 50) || i >= 92;
    ctx.fillRect(x+quiet+i*module, y+top, Math.ceil(module+0.25), barHeight + (guard ? height*0.055 : 0));
  }
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#000';
  if (showIsbnLabel) { ctx.font=`${Math.max(9,Math.round(height*0.075))}px Arial, sans-serif`; ctx.fillText(formatIsbnCompact(encoded.digits), x+width/2, y+height*0.085, width*0.92); }
  ctx.font=`${Math.max(10,Math.round(height*0.095))}px Arial, sans-serif`; ctx.fillText(encoded.digits, x+width/2, y+height*0.91, width*0.90);
  ctx.restore();
  return encoded;
}

export function barcodeFingerprint({ isbn = '', pageCount = 0, brain = {} } = {}) {
  const normalized = normalizePrintIsbn(isbn);
  const b = normalizeBarcodeBrain(brain);
  return normalized.valid ? `ean13:${normalized.digits}:pages:${Number(pageCount)||0}:cover:${b.coverPlacement}:interior:${b.includeInterior?'1':'0'}` : '';
}

const DIGIT_5X7 = Object.freeze({
  0:['11111','10001','10001','10001','10001','10001','11111'],
  1:['00100','01100','00100','00100','00100','00100','01110'],
  2:['11110','00001','00001','11110','10000','10000','11111'],
  3:['11110','00001','00001','01110','00001','00001','11110'],
  4:['10010','10010','10010','11111','00010','00010','00010'],
  5:['11111','10000','10000','11110','00001','00001','11110'],
  6:['01111','10000','10000','11110','10001','10001','01110'],
  7:['11111','00001','00010','00100','01000','01000','01000'],
  8:['01110','10001','10001','01110','10001','10001','01110'],
  9:['01110','10001','10001','01111','00001','00001','11110'],
});

function pdfNum(value) { return Number(Number(value || 0).toFixed(3)).toString(); }

function bitmapDigitPdf(digit, xPt, yPt, cellPt) {
  const rows = DIGIT_5X7[digit];
  if (!rows) return '';
  const commands = [];
  // yPt is the bottom edge of the seven-row glyph.
  for (let row=0; row<7; row+=1) {
    for (let col=0; col<5; col+=1) {
      if (rows[row][col] !== '1') continue;
      const x = xPt + col*cellPt;
      const y = yPt + (6-row)*cellPt;
      commands.push(`${pdfNum(x)} ${pdfNum(y)} ${pdfNum(cellPt*0.86)} ${pdfNum(cellPt*0.86)} re f`);
    }
  }
  return commands.join('\n');
}

export function barcodePdfVectorCommands(value = '', { xIn=0, yTopIn=0, widthIn=KDP_BARCODE_WIDTH_IN, heightIn=KDP_BARCODE_HEIGHT_IN, pageHeightIn=9 } = {}) {
  const encoded = encodeEan13(value);
  if (!encoded.ok) throw new Error(encoded.reason);
  const pt = 72;
  const x = Number(xIn)*pt;
  const top = Number(yTopIn)*pt;
  const width = Number(widthIn)*pt;
  const height = Number(heightIn)*pt;
  const pageHeight = Number(pageHeightIn)*pt;
  const y = pageHeight - top - height;
  const quiet = width*0.05;
  const barTopPad = height*0.16;
  const digitArea = height*0.23;
  const barHeight = height - barTopPad - digitArea;
  const module = (width - quiet*2) / EAN13_MODULE_COUNT;
  const commands = ['q','1 1 1 rg',`${pdfNum(x)} ${pdfNum(y)} ${pdfNum(width)} ${pdfNum(height)} re f`,'0 0 0 rg'];
  for (let i=0;i<encoded.bits.length;i+=1) {
    if (encoded.bits[i] !== '1') continue;
    const guard = i < 3 || (i >= 45 && i < 50) || i >= 92;
    const bx = x + quiet + i*module;
    const bh = barHeight + (guard ? height*0.055 : 0);
    const by = y + digitArea;
    commands.push(`${pdfNum(bx)} ${pdfNum(by)} ${pdfNum(module*1.02)} ${pdfNum(bh)} re f`);
  }
  const cell = Math.min(height*0.0205, (width*0.84)/(13*6));
  const glyphWidth = cell*5;
  const gap = cell*1.15;
  const total = 13*glyphWidth + 12*gap;
  let dx = x + (width-total)/2;
  const dy = y + height*0.035;
  for (const digit of encoded.digits) {
    commands.push(bitmapDigitPdf(digit, dx, dy, cell));
    dx += glyphWidth + gap;
  }
  commands.push('Q');
  return commands.filter(Boolean).join('\n');
}
