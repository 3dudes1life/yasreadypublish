import { encodeEan13, normalizePrintIsbn } from './barcode-brain.js';

const PDF_LIB_ESM_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';

function dataUrlBytes(dataUrl = '') {
  const match = String(dataUrl || '').match(/^data:application\/pdf;base64,(.+)$/s);
  if (!match) throw new Error('Attached cover PDF data is unavailable. Reattach the full-wrap PDF.');
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i=0;i<binary.length;i+=1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const DIGITS = Object.freeze({
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

async function loadPdfLib() {
  if (globalThis.PDFLib?.PDFDocument) return globalThis.PDFLib;
  try {
    return await import(PDF_LIB_ESM_URL);
  } catch (error) {
    throw new Error(`Barcode Brain could not load its PDF stamping engine. Your cover stays untouched. Reconnect and try again, or download the SVG barcode instead. (${error?.message || 'PDF engine unavailable'})`);
  }
}

function drawDigit(page, digit, x, y, cell, black) {
  const rows = DIGITS[digit];
  if (!rows) return;
  for (let row=0; row<7; row+=1) {
    for (let col=0; col<5; col+=1) {
      if (rows[row][col] !== '1') continue;
      page.drawRectangle({ x:x+col*cell, y:y+(6-row)*cell, width:cell*0.86, height:cell*0.86, color:black, borderWidth:0 });
    }
  }
}

export async function stampBarcodeOnUploadedCoverPdf({ asset, geometry, isbn, legacyKnockout = false } = {}) {
  const normalized = normalizePrintIsbn(isbn);
  if (!normalized.valid) throw new Error(normalized.reason);
  if (!asset?.dataUrl) throw new Error('Attach the full-wrap cover PDF before stamping the barcode.');
  const encoded = encodeEan13(normalized.digits);
  if (!encoded.ok) throw new Error(encoded.reason);
  const PDFLib = await loadPdfLib();
  const { PDFDocument, rgb } = PDFLib;
  const input = dataUrlBytes(asset.dataUrl);
  const pdfDoc = await PDFDocument.load(input, { updateMetadata:false, ignoreEncryption:false });
  const pages = pdfDoc.getPages();
  if (pages.length !== 1) throw new Error(`KDP full-wrap cover must be one PDF page; this file has ${pages.length}.`);
  const page = pages[0];
  const widthPt = page.getWidth(); const heightPt = page.getHeight();
  const expectedW = Number(geometry?.width || 0)*72; const expectedH = Number(geometry?.height || 0)*72;
  if (Math.abs(widthPt-expectedW) > 1.5 || Math.abs(heightPt-expectedH) > 1.5) throw new Error(`Attached cover canvas is ${(widthPt/72).toFixed(4)} × ${(heightPt/72).toFixed(4)} in; final interior needs ${Number(geometry?.width||0).toFixed(4)} × ${Number(geometry?.height||0).toFixed(4)} in.`);

  const box = geometry.barcode;
  const knockout = legacyKnockout ? (box?.knockout || box) : box;
  const kx = Number(knockout.x)*72;
  const ky = heightPt - (Number(knockout.y)+Number(knockout.height))*72;
  const kw = Number(knockout.width)*72;
  const kh = Number(knockout.height)*72;
  const x = Number(box.x)*72;
  const y = heightPt - (Number(box.y)+Number(box.height))*72;
  const w = Number(box.width)*72;
  const h = Number(box.height)*72;
  const white = rgb(1,1,1); const black = rgb(0,0,0);
  // Knock out the entire legacy placeholder footprint first, then draw the new
  // vector code inside it. This prevents an old ISBN label/digit line from
  // remaining visible around a newly-stamped barcode.
  page.drawRectangle({ x:kx, y:ky, width:kw, height:kh, color:white, borderWidth:0 });
  page.drawRectangle({ x, y, width:w, height:h, color:white, borderWidth:0 });
  const quiet = w*0.05; const topPad=h*0.16; const digitArea=h*0.23; const barH=h-topPad-digitArea;
  const module=(w-quiet*2)/95;
  for (let i=0;i<encoded.bits.length;i+=1) {
    if (encoded.bits[i] !== '1') continue;
    const guard = i<3 || (i>=45 && i<50) || i>=92;
    page.drawRectangle({ x:x+quiet+i*module, y:y+digitArea, width:module*1.02, height:barH+(guard?h*0.055:0), color:black, borderWidth:0 });
  }
  const cell=Math.min(h*0.0205,(w*0.84)/(13*6)); const glyph=cell*5; const gap=cell*1.15; const total=13*glyph+12*gap;
  let dx=x+(w-total)/2; const dy=y+h*0.035;
  for (const digit of encoded.digits) { drawDigit(page,digit,dx,dy,cell,black); dx += glyph+gap; }

  const output = await pdfDoc.save({ useObjectStreams:false, addDefaultPage:false, updateFieldAppearances:false });
  return { bytes:output instanceof Uint8Array ? output : new Uint8Array(output), isbn:normalized.digits, widthIn:widthPt/72, heightIn:heightPt/72, engine:'pdf-lib-1.17.1', vector:true };
}
