import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FULL_WRAP_ART_VERSION,
  buildArtworkLockedSpineExtension,
  analyzeArtworkLockedSpineQuality,
  selectArtworkLockedSpineCandidate,
} from '../src/lib/full-wrap-art.js';
import { migrateProject } from '../src/lib/project.js';

function bandProneArt(width=64,height=180){
  const rgba=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y+=1){
    const horizontal=
      Math.sin(y/13)*11+
      Math.sin(y/5.2)*4+
      Math.sin(y/31)*3;
    for(let x=0;x<width;x+=1){
      const texture=Math.sin(x/7)*7+Math.sin((x+y)/19)*3;
      const base=105+horizontal+texture;
      const i=(y*width+x)*4;
      rgba[i]=Math.max(0,Math.min(255,Math.round(base*0.72)));
      rgba[i+1]=Math.max(0,Math.min(255,Math.round(base)));
      rgba[i+2]=Math.max(0,Math.min(255,Math.round(base*0.91)));
      rgba[i+3]=255;
    }
  }
  for(let y=45;y<135;y+=1){
    for(let x=25;x<39;x+=1){
      if((x+y)%4===0){
        const i=(y*width+x)*4;
        rgba[i]=244;rgba[i+1]=236;rgba[i+2]=204;
      }
    }
  }
  return rgba;
}

test('1.0.42 Cover Engine v11 keeps the complete source core byte-exact',()=>{
  assert.equal(FULL_WRAP_ART_VERSION,11);
  const sw=64,tw=118,h=180;
  const source=bandProneArt(sw,h);
  const result=buildArtworkLockedSpineExtension(source,sw,h,tw,{seed:4});
  assert.equal(result.metrics.sourceCoreExact,true);
  assert.equal(result.metrics.sourceCoreMeanAbsError,0);
  assert.equal(result.metrics.sourceCoreMaxAbsError,0);
  assert.equal(result.metrics.sameRowOnly,false);
  assert.equal(result.metrics.extensionMethod,'multi-candidate-2d-phase-quilt');

  const coreX=result.metrics.sourceCoreX;
  for(let y=0;y<h;y+=1){
    for(let x=0;x<sw;x+=1){
      const si=(y*sw+x)*4;
      const ti=(y*tw+coreX+x)*4;
      assert.deepEqual(
        Array.from(result.rgba.slice(ti,ti+4)),
        Array.from(source.slice(si,si+4)),
      );
    }
  }
});

test('1.0.42 automatically evaluates multiple 2D extension candidates and selects a safe one',()=>{
  const sw=64,tw=118,h=180;
  const source=bandProneArt(sw,h);
  const selected=selectArtworkLockedSpineCandidate(source,sw,h,tw);
  assert.equal(selected.attempts.length,8);
  assert.equal(selected.quality.ready,true);
  assert.ok(selected.quality.metrics.generatedWorstBand<=selected.quality.metrics.bandLimit);
  assert.ok(selected.quality.metrics.generatedRowTransition<=selected.quality.metrics.rowLimit);
  assert.ok(selected.quality.metrics.worstSeam<=0.5);
});

test('1.0.42 source-relative QA has no v10 3.25 hard ceiling',()=>{
  const source=readFileSync(new URL('../src/lib/full-wrap-art.js',import.meta.url),'utf8');
  assert.ok(source.includes('sourceWorstBand*1.12+0.22'));
  assert.ok(!source.includes('Math.min(3.25'));
});


test('1.0.42 strong generated horizontal stripe remains a hard blocker',()=>{
  const sw=64,tw=118,h=180;
  const source=bandProneArt(sw,h);
  const selected=selectArtworkLockedSpineCandidate(source,sw,h,tw);
  assert.equal(selected.quality.ready,true);

  const damaged=Uint8ClampedArray.from(selected.locked.rgba);
  const leftExtra=selected.locked.metrics.leftExtraPx;
  for(let y=82;y<98;y+=1){
    for(let x=0;x<leftExtra;x+=1){
      const i=(y*tw+x)*4;
      damaged[i]=0;
      damaged[i+1]=0;
      damaged[i+2]=0;
    }
  }

  const quality=analyzeArtworkLockedSpineQuality(
    source,sw,damaged,tw,h,selected.locked.metrics
  );
  assert.equal(quality.ready,false);
  const bandCheck=quality.checks.find((item)=>item.id==='wrap-art-horizontal-banding');
  assert.equal(bandCheck?.status,'error');
});

test('1.0.42 production cover path chooses from multiple candidates and never uses v9 reconstruction',()=>{
  const source=readFileSync(new URL('../src/lib/full-wrap-art.js',import.meta.url),'utf8');
  const production=source.slice(
    source.indexOf('function renderSpineContentAware'),
    source.indexOf('export function coverBarcodeBackingPlan'),
  );
  assert.ok(production.includes('selectArtworkLockedSpineCandidate'));
  assert.ok(production.includes('candidateCount'));
  assert.ok(!production.includes('buildSinglePassEdgeFlowUnderlay('));
  assert.ok(!production.includes('compositeProtectedSpineArtwork('));
});

test('1.0.42 cover-only migration preserves the certified 730-page interior',()=>{
  const old={
    id:'v142',version:37,appVersion:'1.0.41',title:'Fault Lines',author:'D.C.W.',
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
        lastBuiltAt:'2026-08-25T19:00:00.000Z',
        lastPreflight:{ready:true,proofSignature:'proof'},
        lastPdfAudit:{
          ready:true,
          sha256:'inside-is-final',
          pageCount:730,
          proofSignature:'proof',
        },
        lastCoverAudit:null,
        kdpMetadata:{isbnMode:'own',isbn:'9798998826948'},
        barcodeBrain:{enabled:true,includeInterior:true,coverPlacement:'yasready'},
        printGate:{
          visualProof:null,
          freeze:null,
          external:{kdpPrintPreviewApproved:false},
        },
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

  assert.equal(migrated.appVersion,'1.0.42');
  assert.equal(migrated.editions.paperback.lastPageCount,730);
  assert.equal(migrated.editions.paperback.lastBuiltAt,builtAt);
  assert.equal(JSON.stringify(migrated.editions.paperback.lastPreflight),preflight);
  assert.equal(JSON.stringify(migrated.editions.paperback.lastPdfAudit),pdf);
  assert.equal(migrated.editions.paperback.lastCoverAudit,null);
  assert.equal(JSON.stringify(migrated.editions.ebook.releaseGate),kindle);
});
