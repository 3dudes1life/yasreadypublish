import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BARCODE_BRAIN_VERSION, barcodePagePlan, detectLabeledPrintIsbn } from '../src/lib/barcode-brain.js';
import { FULL_WRAP_ART_VERSION, compositeProtectedSpineArtwork, coverBarcodeBackingPlan } from '../src/lib/full-wrap-art.js';
import { matterPostDrawAdvance, PRINT_PDF_VERSION } from '../src/lib/print-pdf.js';
import { migrateProject } from '../src/lib/project.js';

const ISBN='9798998826948';

test('1.0.39 detects a paperback ISBN split across neighboring DOCX blocks', () => {
  const project={manuscript:{blocks:[
    {id:'a',text:'ISBN:'},
    {id:'b',text:'979-8-9988269-3-1 (E-book)'},
    {id:'c',text:'979-8-9988269-4-8 (Paperback Print)'},
  ]}};
  const detected=detectLabeledPrintIsbn(project,'paperback');
  assert.equal(detected?.isbn,ISBN);
  assert.equal(detected?.blockId,'c');
  assert.equal(BARCODE_BRAIN_VERSION,2);
});

test('1.0.39 restores final barcode pagination from a 728-page base', () => {
  const plan=barcodePagePlan(728,true);
  assert.equal(plan.spacerPages,1);
  assert.equal(plan.finalPageCount,730);
  assert.equal(plan.barcodePhysicalPage,730);
  assert.equal(plan.barcodeSide,'left');
});

test('1.0.39 back-matter renderer advances by actual canvas wrapping', () => {
  assert.equal(PRINT_PDF_VERSION,4);
  assert.equal(matterPostDrawAdvance({measuredHeightPx:100,topPx:10,bottomPx:10,drawnHeightPx:110}),120);
  const source=readFileSync(new URL('../src/lib/print-pdf.js',import.meta.url),'utf8');
  assert.ok(source.includes('const drawnHeight=drawWrappedFragment'));
  assert.ok(source.includes('overflowEvidence?.ok === false'));
  assert.ok(source.includes('reconcileBodyAdvance'));
  assert.ok(!source.includes('if (pageFlow?.overflowPx > 1)'));
  assert.ok(source.includes('const drawnBodyHeight=drawWrappedFragment'));
});

test('1.0.39 Cover Engine v9 overlays protected artwork without restoring the old spine rectangle', () => {
  assert.equal(FULL_WRAP_ART_VERSION,9);
  const sourceW=20,targetW=36,height=10;
  const bg=new Uint8ClampedArray(targetW*height*4);
  const original=new Uint8ClampedArray(sourceW*height*4);
  const cleaned=new Uint8ClampedArray(sourceW*height*4);
  const seed=new Uint8Array(sourceW*height);
  for (let y=0;y<height;y+=1) {
    for (let x=0;x<targetW;x+=1) {
      const i=(y*targetW+x)*4; bg[i]=20;bg[i+1]=110;bg[i+2]=95;bg[i+3]=255;
    }
    for (let x=0;x<sourceW;x+=1) {
      const i=(y*sourceW+x)*4;
      original[i]=12;original[i+1]=80;original[i+2]=72;original[i+3]=255;
      cleaned[i]=20;cleaned[i+1]=110;cleaned[i+2]=95;cleaned[i+3]=255;
      if (x>=8 && x<=11 && y>=2 && y<=7) {
        original[i]=246;original[i+1]=236;original[i+2]=195; seed[y*sourceW+x]=1;
      }
    }
  }
  const result=compositeProtectedSpineArtwork(bg,targetW,original,sourceW,height,cleaned,seed);
  assert.equal(result.metrics.artworkOnlyOverlay,true);
  assert.equal(result.metrics.fullNativeCore,false);
  assert.equal(result.metrics.artworkMeanAbsError,0);
  const tx=result.metrics.targetX;
  const backgroundPixel=(5*targetW+(tx+2))*4;
  assert.deepEqual(Array.from(result.rgba.slice(backgroundPixel,backgroundPixel+3)),[20,110,95]);
  const textPixel=(4*targetW+(tx+9))*4;
  assert.deepEqual(Array.from(result.rgba.slice(textPixel,textPixel+3)),[246,236,195]);

  const source=readFileSync(new URL('../src/lib/full-wrap-art.js',import.meta.url),'utf8');
  const production=source.slice(source.indexOf('function renderSpineContentAware'),source.indexOf('export async function renderFullWrapArtworkPdf'));
  assert.ok(production.includes('compositeProtectedSpineArtwork'));
  assert.ok(!production.includes('compositeNativeSpineCore('));
});

test('1.0.39 clean artwork gets no Amazon white reserve and exact YasReady barcode backing', () => {
  assert.deepEqual(coverBarcodeBackingPlan({placement:'amazon'}),{
    paintWhite:false,backing:'none',artworkUntouched:true
  });
  assert.equal(coverBarcodeBackingPlan({placement:'yasready',legacyPlaceholder:false}).backing,'exact-barcode');
  assert.equal(coverBarcodeBackingPlan({placement:'yasready',legacyPlaceholder:true}).backing,'legacy-knockout');
});

test('1.0.39 migration repairs Book 2 ISBN/barcode state and preserves Kindle proof', () => {
  const old={
    id:'v139',version:37,appVersion:'1.0.38',title:'Fault Lines',author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'story'},storyLock:{enabled:true,status:'verified'},
    manuscript:{blocks:[
      {id:'a',kind:'body',text:'ISBN:'},
      {id:'b',kind:'body',text:'979-8-9988269-3-1 (E-book)'},
      {id:'c',kind:'body',text:'979-8-9988269-4-8 (Paperback Print)'},
    ],chapters:[],notes:[],media:[],stats:{},metadata:{}},
    design:{print:{},ebook:{}},structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    editions:{
      paperback:{
        enabled:true,coverMode:'upload-art',kdpMetadata:{isbnMode:'kdp-free',isbn:''},
        barcodeBrain:{enabled:false,includeInterior:false,coverPlacement:'amazon'},
        lastPageCount:728,lastPdfAudit:{sha256:'old'},lastCoverAudit:{sha256:'old-cover'},
        printGate:{visualProof:{token:'p'},freeze:{token:'p'},external:{kdpPrintPreviewApproved:{value:true,token:'p'}}},
      },
      hardcover:{enabled:false},
      ebook:{enabled:true,releaseGate:{visualProof:{token:'k'},freeze:{token:'k'},external:{kindlePreviewerOpened:{value:true,token:'k'},enhancedTypesetting:{value:true,token:'k'}}}},
      activePrint:'paperback',
    },
  };
  const kindle=JSON.stringify(old.editions.ebook.releaseGate);
  const migrated=migrateProject(old);
  assert.equal(migrated.appVersion,'1.0.40');
  assert.equal(migrated.editions.paperback.kdpMetadata.isbnMode,'own');
  assert.equal(migrated.editions.paperback.kdpMetadata.isbn,ISBN);
  assert.equal(migrated.editions.paperback.barcodeBrain.enabled,true);
  assert.equal(migrated.editions.paperback.barcodeBrain.includeInterior,true);
  assert.equal(migrated.editions.paperback.barcodeBrain.coverPlacement,'yasready');
  assert.equal(migrated.editions.paperback.lastPageCount,null);
  assert.equal(migrated.editions.paperback.lastBuiltAt,null);
  assert.equal(migrated.editions.paperback.lastPreflight,null);
  assert.equal(migrated.editions.paperback.lastPdfAudit,null);
  assert.equal(migrated.editions.paperback.lastCoverAudit,null);
  assert.equal(JSON.stringify(migrated.editions.ebook.releaseGate),kindle);
});
