import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendInteriorBarcodePages, barcodeBrainChecks, barcodePagePlan, barcodePdfVectorCommands,
  barcodeRoundTrip, barcodeSvg, detectLabeledPrintIsbn, encodeEan13, isbn13CheckDigit,
  normalizePrintIsbn,
} from '../src/lib/barcode-brain.js';
import { migrateProject } from '../src/lib/project.js';
import { printReleaseToken } from '../src/lib/print-release-gate.js';

const BOOK2_PAPERBACK = '9798998826948';

function basePreview(count) {
  return {
    pages:Array.from({ length:count }, (_,i) => ({
      number:i+1, side:(i+1)%2 ? 'right' : 'left', fragments:[], bookPageNumber:i+1,
      section:'back', showRunningHeader:false, showFolio:true,
    })),
  };
}

test('1.0.34 ISBN-13 validator certifies the Book 2 paperback ISBN and rejects a bad check digit', () => {
  assert.equal(isbn13CheckDigit(BOOK2_PAPERBACK.slice(0,12)), '8');
  assert.deepEqual(normalizePrintIsbn('979-8-9988269-4-8'), { valid:true, digits:BOOK2_PAPERBACK, reason:'Valid ISBN-13.' });
  assert.equal(normalizePrintIsbn('9798998826947').valid, false);
});

test('1.0.34 Barcode Brain produces the exact 95-module EAN-13 and scanner round-trips to the same ISBN', () => {
  const encoded = encodeEan13(BOOK2_PAPERBACK);
  assert.equal(encoded.ok, true);
  assert.equal(encoded.bits.length, 95);
  const roundTrip = barcodeRoundTrip(BOOK2_PAPERBACK);
  assert.equal(roundTrip.ok, true);
  assert.equal(roundTrip.decoded.digits, BOOK2_PAPERBACK);
});

test('1.0.34 barcode page planner always makes the barcode the true final left/even physical page', () => {
  assert.deepEqual(barcodePagePlan(385, true), {
    enabled:true, basePageCount:385, spacerPages:0, barcodePages:1,
    finalPageCount:386, barcodePhysicalPage:386, barcodeSide:'left',
  });
  const even = barcodePagePlan(386, true);
  assert.equal(even.spacerPages, 1);
  assert.equal(even.finalPageCount, 388);
  assert.equal(even.barcodePhysicalPage % 2, 0);
});

test('1.0.34 interior insertion matches Book 1: final barcode on left/even page with continuing folio', () => {
  const preview = basePreview(385);
  appendInteriorBarcodePages(preview, { isbn:BOOK2_PAPERBACK, enabled:true });
  const last = preview.pages.at(-1);
  assert.equal(preview.pages.length, 386);
  assert.equal(last.barcodePage, true);
  assert.equal(last.side, 'left');
  assert.equal(last.bookPageNumber, 386);
  assert.equal(last.isbn, BOOK2_PAPERBACK);
  assert.equal(last.showFolio, true);
});

test('1.0.34 even base pagination inserts a numbered right-page spacer before the final left barcode', () => {
  const preview = basePreview(386);
  appendInteriorBarcodePages(preview, { isbn:BOOK2_PAPERBACK, enabled:true });
  assert.equal(preview.pages.length, 388);
  assert.equal(preview.pages[386].barcodeSpacer, true);
  assert.equal(preview.pages[386].side, 'right');
  assert.equal(preview.pages[386].bookPageNumber, 387);
  assert.equal(preview.pages[387].barcodePage, true);
  assert.equal(preview.pages[387].bookPageNumber, 388);
});

test('1.0.34 labeled paperback ISBN is detected from Story-Locked copyright matter without rewriting text', () => {
  const project = { manuscript:{ blocks:[
    { id:'c1', text:'ISBN:' },
    { id:'c2', text:'979-8-9988269-4-8 (Paperback Print)' },
  ] } };
  const before = JSON.stringify(project.manuscript.blocks);
  const detected = detectLabeledPrintIsbn(project, 'paperback');
  assert.equal(detected.isbn, BOOK2_PAPERBACK);
  assert.equal(detected.blockId, 'c2');
  assert.equal(JSON.stringify(project.manuscript.blocks), before);
});

test('1.0.34 standalone SVG is a 2 × 1.2 in black-on-white vector barcode with no hidden-content tricks', () => {
  const svg = barcodeSvg(BOOK2_PAPERBACK);
  assert.match(svg, /width="2in"/);
  assert.match(svg, /height="1\.2in"/);
  assert.match(svg, /<rect/);
  assert.match(svg, /9798998826948/);
  assert.doesNotMatch(svg, /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*=\s*["']0/i);
});

test('1.0.34 cover PDF barcode commands are vector rectangles and do not depend on embedded fonts', () => {
  const commands = barcodePdfVectorCommands(BOOK2_PAPERBACK, { xIn:1, yTopIn:7, widthIn:2, heightIn:1.2, pageHeightIn:9.25 });
  assert.match(commands, / re f/);
  assert.match(commands, /0 0 0 rg/);
  assert.doesNotMatch(commands, /\/Font|Tf|Tj/);
});

test('1.0.34 migration detects the paperback ISBN, primes the two-placement workflow, invalidates print only, and preserves Kindle proof', () => {
  const old = {
    id:'p34', version:33, appVersion:'1.0.33', title:'Tres Amigos, Una Vida', author:'D.C.W.',
    source:{ fileName:'book.docx', manuscriptHash:'hash' }, storyLock:{ status:'verified', enabled:true },
    manuscript:{ blocks:[{id:'isbn-pb',text:'979-8-9988269-4-8 (Paperback Print)'}], chapters:[], notes:[], media:[], stats:{}, metadata:{} },
    design:{ print:{}, ebook:{} }, structureOverrides:{}, presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    editions:{
      paperback:{ enabled:true, design:{}, production:{}, coverMode:'upload-pdf', lastPageCount:726, lastPdfAudit:{sha256:'old'}, lastCoverAudit:{sha256:'old-cover'}, printGate:{ visualProof:{token:'p'}, freeze:{token:'p'}, external:{kdpPrintPreviewApproved:{value:true,token:'p'}} } },
      hardcover:{ enabled:false, design:{} },
      ebook:{ enabled:true, design:{}, releaseGate:{ visualProof:{token:'k'}, freeze:{token:'k'}, external:{kindlePreviewerOpened:{value:true,token:'k'}} } },
      activePrint:'paperback',
    },
  };
  const manuscriptBefore = JSON.stringify(old.manuscript);
  const kindleBefore = JSON.stringify(old.editions.ebook.releaseGate);
  const migrated = migrateProject(old);
  assert.equal(migrated.version, 37);
  assert.equal(migrated.appVersion, '1.0.42');
  assert.equal(migrated.editions.paperback.barcodeBrain.detectedIsbn, BOOK2_PAPERBACK);
  assert.equal(migrated.editions.paperback.barcodeBrain.enabled, true);
  assert.equal(migrated.editions.paperback.barcodeBrain.includeInterior, true);
  assert.equal(migrated.editions.paperback.barcodeBrain.coverPlacement, 'yasready');
  assert.equal(migrated.editions.paperback.lastPdfAudit, null);
  assert.equal(migrated.editions.paperback.lastCoverAudit, null);
  assert.equal(JSON.stringify(migrated.editions.ebook.releaseGate), kindleBefore);
  assert.equal(JSON.stringify(migrated.manuscript), manuscriptBefore);
});

test('1.0.34 release token changes when Barcode Brain placement changes and gate certifies a valid owned ISBN', () => {
  const project = migrateProject({
    id:'token', version:34, appVersion:'1.0.34', title:'Fault Lines', author:'D.C.W.',
    source:{manuscriptHash:'hash'}, storyLock:{status:'verified'}, manuscript:{blocks:[],chapters:[],notes:[],media:[],stats:{},metadata:{}},
    design:{print:{},ebook:{}}, structureOverrides:{}, presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    editions:{paperback:{enabled:true,design:{},production:{},coverBrain:{},barcodeBrain:{enabled:true,includeInterior:true,coverPlacement:'yasready'},kdpMetadata:{isbnMode:'own',isbn:BOOK2_PAPERBACK},lastPageCount:400},hardcover:{enabled:false,design:{}},ebook:{enabled:false,design:{}},activePrint:'paperback'},
  });
  const report = barcodeBrainChecks({ isbn:BOOK2_PAPERBACK, isbnMode:'own', pageCount:400, basePageCount:399, brain:project.editions.paperback.barcodeBrain, coverMode:'build' });
  assert.equal(report.ready, true);
  const before = printReleaseToken(project,'paperback');
  project.editions.paperback.barcodeBrain.coverPlacement = 'amazon';
  assert.notEqual(printReleaseToken(project,'paperback'), before);
});
