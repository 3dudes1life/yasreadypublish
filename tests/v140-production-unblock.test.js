import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRINT_PDF_VERSION,reconcileBodyAdvance,visibleOverflowDecision } from '../src/lib/print-pdf.js';
import { isAppVersionBefore,migrateProject } from '../src/lib/project.js';

test('1.0.40 tiny 300-DPI metric drift does not accumulate but a real extra line still advances',()=>{
  assert.equal(PRINT_PDF_VERSION,4);
  assert.equal(reconcileBodyAdvance({measuredHeightPx:100,drawnHeightPx:105,tolerancePx:6}),100);
  assert.equal(reconcileBodyAdvance({measuredHeightPx:100,drawnHeightPx:107,tolerancePx:6}),107);
});

test('1.0.40 cursor drift alone cannot block export; actual ink overflow can',()=>{
  assert.equal(visibleOverflowDecision({cursorOverflowPx:9.6,darkSamples:0}),false);
  assert.equal(visibleOverflowDecision({cursorOverflowPx:9.6,darkSamples:2}),false);
  assert.equal(visibleOverflowDecision({cursorOverflowPx:9.6,darkSamples:3}),true);
  const source=readFileSync(new URL('../src/lib/print-pdf.js',import.meta.url),'utf8');
  assert.ok(source.includes('rasterBottomMarginOverflowEvidence'));
  assert.ok(source.includes('overflowEvidence?.ok === false'));
  assert.ok(!source.includes('if (pageFlow?.overflowPx > 1)'));
});

test('1.0.40 app migration ordering is monotonic',()=>{
  assert.equal(isAppVersionBefore('1.0.37','1.0.38'),true);
  assert.equal(isAppVersionBefore('1.0.39','1.0.38'),false);
  assert.equal(isAppVersionBefore('1.0.39','1.0.40'),true);
  assert.equal(isAppVersionBefore('1.0.40','1.0.40'),false);
});

function fixture(appVersion){
  return {id:'v140',version:37,appVersion,title:'Fault Lines',author:'D.C.W.',source:{fileName:'book.docx',manuscriptHash:'story'},storyLock:{enabled:true,status:'verified'},manuscript:{blocks:[{id:'a',kind:'body',text:'ISBN:'},{id:'b',kind:'body',text:'979-8-9988269-3-1 (E-book)'},{id:'c',kind:'body',text:'979-8-9988269-4-8 (Paperback Print)'}],chapters:[],notes:[],media:[],stats:{},metadata:{}},design:{print:{},ebook:{}},structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},editions:{paperback:{enabled:true,coverMode:'upload-art',kdpMetadata:{isbnMode:'own',isbn:'9798998826948'},barcodeBrain:{enabled:true,includeInterior:true,coverPlacement:'yasready',detectedIsbn:'9798998826948',detectedIsbnBlockId:'c'},lastPageCount:730,lastBuiltAt:'2026-08-25T00:00:00.000Z',lastPreflight:{ready:true},lastPdfAudit:{ready:true,sha256:'interior',pageCount:730},lastCoverAudit:{ready:true,sha256:'cover',pageCount:730,generatorVersion:9,visualQuality:{ready:true}},printGate:{visualProof:{token:'p'},freeze:{token:'p'},external:{kdpPrintPreviewApproved:{value:true,token:'p'}}}},hardcover:{enabled:false},ebook:{enabled:true,releaseGate:{visualProof:{token:'k'},freeze:{token:'k'},external:{kindlePreviewerOpened:{value:true,token:'k'},enhancedTypesetting:{value:true,token:'k'}}}},activePrint:'paperback'}};
}

test('1.0.40 upgrades 1.0.39 once while preserving 730-page ISBN/barcode/Kindle state',()=>{
  const old=fixture('1.0.39'); const kindle=JSON.stringify(old.editions.ebook.releaseGate); const migrated=migrateProject(old);
  assert.equal(migrated.appVersion,'1.0.42');
  assert.equal(migrated.editions.paperback.lastPageCount,730);
  assert.equal(migrated.editions.paperback.kdpMetadata.isbn,'9798998826948');
  assert.equal(migrated.editions.paperback.barcodeBrain.includeInterior,true);
  assert.equal(migrated.editions.paperback.lastPreflight,null);
  assert.equal(migrated.editions.paperback.lastPdfAudit,null);
  assert.equal(migrated.editions.paperback.lastCoverAudit,null);
  assert.equal(JSON.stringify(migrated.editions.ebook.releaseGate),kindle);
});

test('1.0.40 project upgraded through 1.0.41 preserves certified interior while invalidating the old v9 cover',()=>{
  const current=fixture('1.0.40');
  const pdf=JSON.stringify(current.editions.paperback.lastPdfAudit),kindle=JSON.stringify(current.editions.ebook.releaseGate);
  const migrated=migrateProject(current);
  assert.equal(migrated.editions.paperback.lastPageCount,730);
  assert.equal(JSON.stringify(migrated.editions.paperback.lastPdfAudit),pdf);
  assert.equal(migrated.editions.paperback.lastCoverAudit,null);
  assert.equal(JSON.stringify(migrated.editions.ebook.releaseGate),kindle);
});

test('1.0.40 diagnostics no longer claim v8/native-core behavior',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const wrap=readFileSync(new URL('../src/lib/full-wrap-art.js',import.meta.url),'utf8');
  assert.ok(main.includes('AMAZON PRINT GATE · v1.0.40'));
  assert.ok(!main.includes('AMAZON PRINT GATE · v1.0.37'));
  assert.ok(wrap.includes('v11: Artwork Lock exact core + automatic multi-candidate 2D phase quilting.'));
  assert.ok(wrap.includes('never the old spine background rectangle'));
});
