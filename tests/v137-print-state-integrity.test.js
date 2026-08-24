import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { capturePrintSetupState, planPrintSetupInvalidation } from '../src/lib/print-state-invalidation.js';
import { pageParityReport } from '../src/lib/amazon-print-hard-mode.js';

function edition(overrides = {}) {
  return {
    production:{ configured:true, trimId:'6x9', ink:'black', paper:'white', bleed:false },
    design:{ name:'Test', insideMargin:1.25, outsideMargin:0.5 },
    coverMode:'upload-art',
    coverBrain:{ configured:false, amazonBarcode:true },
    uploadedCoverArt:{ sha256:'art-a' },
    uploadedCoverPdf:null,
    kdpMetadata:{ isbnMode:'own', isbn:'9780000000002' },
    barcodeBrain:{ enabled:true, includeInterior:false, coverPlacement:'amazon' },
    ...overrides,
  };
}

test('1.0.37 cover-only changes preserve the finished interior certification', () => {
  const before = capturePrintSetupState(edition(), 'paperback');
  const after = capturePrintSetupState(edition({ uploadedCoverArt:{sha256:'art-b'} }), 'paperback');
  const plan = planPrintSetupInvalidation(before, after);
  assert.equal(plan.interiorChanged, false);
  assert.equal(plan.coverChanged, true);
});

test('1.0.37 cover mode and cover-barcode changes do not erase the interior', () => {
  const before = capturePrintSetupState(edition(), 'paperback');
  const modeAfter = capturePrintSetupState(edition({ coverMode:'upload-pdf', uploadedCoverPdf:{sha256:'pdf-b'} }), 'paperback');
  let plan = planPrintSetupInvalidation(before, modeAfter);
  assert.equal(plan.interiorChanged, false);
  assert.equal(plan.coverChanged, true);

  const barcodeAfter = capturePrintSetupState(edition({ barcodeBrain:{enabled:true,includeInterior:false,coverPlacement:'yasready'} }), 'paperback');
  plan = planPrintSetupInvalidation(before, barcodeAfter);
  assert.equal(plan.interiorChanged, false);
  assert.equal(plan.coverChanged, true);
});

test('1.0.37 real pagination changes invalidate both interior and cover', () => {
  const before = capturePrintSetupState(edition(), 'paperback');
  const productionAfter = capturePrintSetupState(edition({ production:{ configured:true, trimId:'6x9', ink:'black', paper:'cream', bleed:false } }), 'paperback');
  let plan = planPrintSetupInvalidation(before, productionAfter);
  assert.equal(plan.interiorChanged, true);
  assert.equal(plan.coverChanged, true);

  const barcodeAfter = capturePrintSetupState(edition({ barcodeBrain:{enabled:true,includeInterior:true,coverPlacement:'amazon'} }), 'paperback');
  plan = planPrintSetupInvalidation(before, barcodeAfter);
  assert.equal(plan.interiorChanged, true);
  assert.equal(plan.coverChanged, true);
});

test('1.0.37 ISBN changes only invalidate interior when the interior barcode uses ISBN', () => {
  const before = capturePrintSetupState(edition(), 'paperback');
  const coverOnlyIsbn = capturePrintSetupState(edition({ kdpMetadata:{isbnMode:'own',isbn:'9780000000019'} }), 'paperback');
  let plan = planPrintSetupInvalidation(before, coverOnlyIsbn);
  assert.equal(plan.interiorChanged, false);
  assert.equal(plan.coverChanged, true);

  const withInteriorBefore = capturePrintSetupState(edition({ barcodeBrain:{enabled:true,includeInterior:true,coverPlacement:'amazon'} }), 'paperback');
  const withInteriorAfter = capturePrintSetupState(edition({ barcodeBrain:{enabled:true,includeInterior:true,coverPlacement:'amazon'}, kdpMetadata:{isbnMode:'own',isbn:'9780000000019'} }), 'paperback');
  plan = planPrintSetupInvalidation(withInteriorBefore, withInteriorAfter);
  assert.equal(plan.interiorChanged, true);
  assert.equal(plan.coverChanged, true);
});

test('1.0.37 folio parity ignores unnumbered pages instead of coercing null to folio zero', () => {
  const report = pageParityReport([
    {number:1,side:'right',bookPageNumber:null},
    {number:2,side:'left',bookPageNumber:null},
    {number:3,side:'right',bookPageNumber:undefined},
    {number:4,side:'left',bookPageNumber:null},
    {number:5,side:'right',bookPageNumber:1},
    {number:6,side:'left',bookPageNumber:2},
  ]);
  assert.equal(report.physical.length, 0);
  assert.equal(report.folios.length, 0);

  const bad = pageParityReport([{number:1,side:'right',bookPageNumber:2}]);
  assert.equal(bad.folios.length, 1);
});

test('1.0.37 Print Brain save uses differential invalidation instead of clearing every print artifact', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(main.includes('capturePrintSetupState'));
  assert.ok(main.includes('planPrintSetupInvalidation'));
  assert.ok(main.includes('if (setupInvalidation.interiorChanged)'));
  assert.ok(main.includes('else if (setupInvalidation.coverChanged)'));
});
