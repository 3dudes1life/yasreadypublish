import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BARCODE_BRAIN_VERSION,
  COVER_BARCODE_RENDER_VERSION,
  coverBarcodeRasterSpec,
  drawBarcodeToCanvas,
  formatIsbnCompact,
} from '../src/lib/barcode-brain.js';
import { migrateProject } from '../src/lib/project.js';

const ISBN='9798998826948';

function fakeCanvasContext(){
  const calls={rects:[],texts:[],fonts:[]};
  const ctx={
    fillStyle:'#000',
    textAlign:'left',
    textBaseline:'alphabetic',
    font:'',
    save(){},
    restore(){},
    fillRect(x,y,width,height){calls.rects.push({x,y,width,height,fillStyle:this.fillStyle});},
    fillText(text,x,y,maxWidth){calls.texts.push({text,x,y,maxWidth,font:this.font});},
  };
  return{ctx,calls};
}

test('1.0.44 cover barcode spec is exactly the approved 2 × 1.2in / 600 × 360px 300-DPI layout',()=>{
  assert.equal(BARCODE_BRAIN_VERSION,3);
  assert.equal(COVER_BARCODE_RENDER_VERSION,3);
  assert.deepEqual(coverBarcodeRasterSpec(),{
    version:3,
    dpi:300,
    widthIn:2,
    heightIn:1.2,
    widthPx:600,
    heightPx:360,
    showIsbnLabel:true,
    renderer:'drawBarcodeToCanvas',
  });
});

test('1.0.44 approved canvas barcode includes the exact ISBN label and human-readable digits',()=>{
  const {ctx,calls}=fakeCanvasContext();
  drawBarcodeToCanvas(ctx,ISBN,{x:0,y:0,width:600,height:360,showIsbnLabel:true});

  assert.equal(calls.rects[0].fillStyle,'#fff');
  assert.deepEqual(
    {x:calls.rects[0].x,y:calls.rects[0].y,width:calls.rects[0].width,height:calls.rects[0].height},
    {x:0,y:0,width:600,height:360}
  );

  assert.equal(formatIsbnCompact(ISBN),'ISBN 979-899882694-8');
  assert.equal(calls.texts.length,2);
  assert.equal(calls.texts[0].text,'ISBN 979-899882694-8');
  assert.equal(calls.texts[1].text,'9798998826948');

  assert.ok(Math.abs(calls.texts[0].y-30.6)<1e-9);
  assert.ok(Math.abs(calls.texts[1].y-327.6)<1e-9);
  assert.match(calls.texts[0].font,/27px Arial/);
  assert.match(calls.texts[1].font,/34px Arial/);
});

test('1.0.44 manufactured full-wrap cover uses the approved canvas renderer instead of the old PDF-only barcode layout',()=>{
  const source=readFileSync(new URL('../src/lib/full-wrap-art.js',import.meta.url),'utf8');
  const manufacture=source.slice(
    source.indexOf("} else if (barcode.coverPlacement==='yasready')"),
    source.indexOf("const jpegBytes=dataUrlToJpegBytes",source.indexOf("} else if (barcode.coverPlacement==='yasready')")),
  );

  assert.ok(manufacture.includes('coverBarcodeRasterSpec'));
  assert.ok(manufacture.includes('drawBarcodeToCanvas'));
  assert.ok(manufacture.includes('showIsbnLabel:true'));
  assert.ok(manufacture.includes("exactDownloadPngLayout:true"));
  assert.ok(!manufacture.includes('barcodePdfVectorCommands(normalized.digits'));
});

test('1.0.44 cover renderer records a 300-DPI raster barcode instead of claiming the old vector barcode was used',()=>{
  const source=readFileSync(new URL('../src/lib/full-wrap-art.js',import.meta.url),'utf8');
  assert.ok(source.includes("renderer:'drawBarcodeToCanvas'"));
  assert.ok(source.includes('rasterDpi:barcodeSpec.dpi'));
  assert.ok(source.includes('vector:false'));
});

test('1.0.44 migration preserves the certified 730-page interior and invalidates cover proof only',()=>{
  const old={
    id:'v144',version:37,appVersion:'1.0.43',title:'Fault Lines',author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'story'},
    storyLock:{enabled:true,status:'verified'},
    manuscript:{blocks:[],chapters:[],notes:[],media:[],stats:{},metadata:{}},
    design:{print:{},ebook:{}},
    structureOverrides:{},
    presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    editions:{
      paperback:{
        enabled:true,
        coverMode:'upload-art',
        lastPageCount:730,
        lastBuiltAt:'2026-08-25T20:44:34.000Z',
        lastPreflight:{ready:true,proofSignature:'proof'},
        lastPdfAudit:{ready:true,sha256:'inside-final',pageCount:730,proofSignature:'proof'},
        lastCoverAudit:{ready:true,sha256:'old-barcode-cover',generatorVersion:13},
        kdpMetadata:{isbnMode:'own',isbn:ISBN},
        barcodeBrain:{enabled:true,includeInterior:true,coverPlacement:'yasready'},
        printGate:{visualProof:{token:'p'},freeze:{token:'p'},external:{kdpPrintPreviewApproved:{value:true,token:'p'}}},
      },
      hardcover:{enabled:false},
      ebook:{enabled:true,releaseGate:{visualProof:{token:'k'},freeze:{token:'k'}}},
      activePrint:'paperback',
    },
  };

  const pdf=JSON.stringify(old.editions.paperback.lastPdfAudit);
  const preflight=JSON.stringify(old.editions.paperback.lastPreflight);
  const builtAt=old.editions.paperback.lastBuiltAt;
  const kindle=JSON.stringify(old.editions.ebook.releaseGate);

  const migrated=migrateProject(old);
  assert.equal(migrated.appVersion,'1.0.44');
  assert.equal(migrated.editions.paperback.lastPageCount,730);
  assert.equal(migrated.editions.paperback.lastBuiltAt,builtAt);
  assert.equal(JSON.stringify(migrated.editions.paperback.lastPreflight),preflight);
  assert.equal(JSON.stringify(migrated.editions.paperback.lastPdfAudit),pdf);
  assert.equal(migrated.editions.paperback.lastCoverAudit,null);
  assert.equal(JSON.stringify(migrated.editions.ebook.releaseGate),kindle);
});
