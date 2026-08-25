import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SPINE_DONOR_ATLAS_VERSION,
  buildProtectedContentMask,
  cleanProtectedDonorPixels,
  manufactureProtectedDonorAtlasSpine,
} from '../src/lib/spine-donor-atlas.js';
import { migrateProject } from '../src/lib/project.js';

function makeAtlas({left=38,spine=95,right=38,height=210,darkCore=false,edgeText=false,horizontalTexture=false,incompatiblePanels=false}={}){
  const width=left+spine+right;
  const rgba=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      const inSpine=x>=left&&x<left+spine;
      const inLeft=x<left;
      const inRight=x>=left+spine;
      const base=incompatiblePanels&&inLeft?38:incompatiblePanels&&inRight?158:(darkCore&&inSpine)?72:96;
      const texture=
        Math.sin((x+y)*.11)*3+
        Math.cos(x*.17-y*.07)*2+
        (horizontalTexture?Math.sin(y*.17)*3:0);
      const i=(y*width+x)*4;
      rgba[i]=Math.round(18+texture*.30);
      rgba[i+1]=Math.round(base+texture);
      rgba[i+2]=Math.round(base-10+texture*.78);
      rgba[i+3]=255;
    }
  }

  const cream=(x,y)=>{
    if(x<0||x>=width||y<0||y>=height)return;
    const i=(y*width+x)*4;
    rgba[i]=244;rgba[i+1]=236;rgba[i+2]=199;rgba[i+3]=255;
    if(x+1<width){const s=(y*width+x+1)*4;rgba[s]=38;rgba[s+1]=52;rgba[s+2]=47;rgba[s+3]=255;}
  };

  // Central vertical title surrogate + long shadow/flourish.
  for(let y=34;y<176;y++){
    const x=left+Math.floor(spine/2)+Math.round(Math.sin(y*.09)*5);
    cream(x,y);
    if(y%5===0){cream(x-1,y);cream(x+1,y);}
  }
  for(let x=left+10;x<left+spine-10;x++){
    const y=165+Math.round(Math.sin(x*.19)*3);
    if(x%2===0)cream(x,y);
  }

  if(edgeText){
    // Deliberately contaminate BOTH fold-adjacent donor zones with title-like art.
    // v11 could copy these raw pixels into the new width; v13 must not.
    for(let y=55;y<145;y+=2){
      cream(left+2+(y%5),y);
      cream(left+spine-3-(y%5),y);
      cream(Math.max(1,left-5+(y%4)),y);
      cream(Math.min(width-2,left+spine+4-(y%4)),y);
    }
  }

  return{rgba,width,height,left,spine,right};
}

function exactCreamOutsideOverlay(result,atlas){
  const tw=result.visualQuality.metrics.targetWidth;
  const sw=atlas.spine;
  const x0=result.visualQuality.metrics.overlayX;
  let cream=0,total=0;
  for(let y=0;y<atlas.height;y+=2){
    for(let x=0;x<tw;x+=2){
      if(x>=x0&&x<x0+sw)continue;
      const i=(y*tw+x)*4;
      total++;
      if(result.backgroundRgba[i]===244&&result.backgroundRgba[i+1]===236&&result.backgroundRgba[i+2]===199)cream++;
    }
  }
  return total?cream/total:0;
}

test('1.0.43 v13 separates protected art from background donor pixels',()=>{
  assert.equal(SPINE_DONOR_ATLAS_VERSION,13);
  const atlas=makeAtlas({edgeText:true});
  const protectedContent=buildProtectedContentMask(atlas.rgba,atlas.width,atlas.height);
  assert.ok(protectedContent.metrics.protectedFraction>0);
  assert.ok(protectedContent.metrics.protectedFraction<.58);
  const cleaned=cleanProtectedDonorPixels(atlas.rgba,protectedContent.mask,atlas.width,atlas.height);
  assert.equal(cleaned.metrics.rawProtectedPixelsAvailableToQuilter,0);
  assert.equal(cleaned.metrics.fullSourceCoreCopied,false);
});

test('1.0.43 real 0.950 to 1.825 expansion does not duplicate edge-contaminated cream title fragments',()=>{
  const atlas=makeAtlas({spine:95,left:38,right:38,edgeText:true,height:210});
  const result=manufactureProtectedDonorAtlasSpine({
    atlasRgba:atlas.rgba,
    atlasWidth:atlas.width,
    height:atlas.height,
    leftDonorWidth:atlas.left,
    sourceSpineWidth:atlas.spine,
    rightDonorWidth:atlas.right,
    targetWidth:183,
    patchSize:36,
    candidateCount:14,
  });
  assert.equal(result.visualQuality.ready,true);
  assert.equal(result.visualQuality.metrics.oldSourceSpineBackgroundCopied,false);
  assert.equal(result.visualQuality.metrics.rawProtectedDonorReads,0);
  assert.ok(result.visualQuality.metrics.protectedLeakFraction<=.0015);
  assert.equal(exactCreamOutsideOverlay(result,atlas),0);
});

test('1.0.43 fold-adjacent panel strips are rejected when they do not match the spine background',()=>{
  const atlas=makeAtlas({spine:95,left:42,right:42,edgeText:true,incompatiblePanels:true,height:210});
  const result=manufactureProtectedDonorAtlasSpine({
    atlasRgba:atlas.rgba,
    atlasWidth:atlas.width,
    height:atlas.height,
    leftDonorWidth:atlas.left,
    sourceSpineWidth:atlas.spine,
    rightDonorWidth:atlas.right,
    targetWidth:183,
    patchSize:36,
    candidateCount:24,
  });
  assert.equal(result.visualQuality.ready,true);
  assert.equal(result.visualQuality.metrics.leftDonorAdmitted,false);
  assert.equal(result.visualQuality.metrics.rightDonorAdmitted,false);
  assert.ok(result.visualQuality.metrics.sourceOverlayFoldGuardPx>=3);
});

test('1.0.43 dark old source spine cannot survive as a centered rectangular background plate',()=>{
  const atlas=makeAtlas({spine:95,left:42,right:42,darkCore:true,edgeText:true,height:210});
  const result=manufactureProtectedDonorAtlasSpine({
    atlasRgba:atlas.rgba,
    atlasWidth:atlas.width,
    height:atlas.height,
    leftDonorWidth:atlas.left,
    sourceSpineWidth:atlas.spine,
    rightDonorWidth:atlas.right,
    targetWidth:183,
    patchSize:36,
    candidateCount:14,
  });
  assert.equal(result.visualQuality.metrics.oldSourceSpineBackgroundCopied,false);
  assert.ok(result.visualQuality.metrics.worstOldCoreBoundaryJump<=10);
});

test('1.0.43 horizontal source texture remains below the production banding blocker after synthesis',()=>{
  const atlas=makeAtlas({spine:95,left:38,right:38,edgeText:true,horizontalTexture:true,height:240});
  const result=manufactureProtectedDonorAtlasSpine({
    atlasRgba:atlas.rgba,
    atlasWidth:atlas.width,
    height:atlas.height,
    leftDonorWidth:atlas.left,
    sourceSpineWidth:atlas.spine,
    rightDonorWidth:atlas.right,
    targetWidth:183,
    patchSize:36,
    candidateCount:14,
  });
  assert.equal(result.visualQuality.ready,true);
  assert.ok(result.visualQuality.metrics.banding<=4.5);
});

test('1.0.43 production spine path uses protected donor atlas and not v11 phase quilting',()=>{
  const wrap=readFileSync(new URL('../src/lib/full-wrap-art.js',import.meta.url),'utf8');
  const production=wrap.slice(
    wrap.indexOf('function renderSpineContentAware'),
    wrap.indexOf('export function coverBarcodeBackingPlan'),
  );
  assert.ok(wrap.includes("from './spine-donor-atlas.js'"));
  assert.ok(production.includes('manufactureProtectedDonorAtlasSpine('));
  assert.ok(production.includes("engineMode:'protected-donor-atlas-patch-quilt'"));
  assert.ok(!production.includes('selectArtworkLockedSpineCandidate('));
  assert.ok(!production.includes('buildArtworkLockedSpineExtension('));
});

test('1.0.43 cover-only migration preserves the certified 730-page interior and invalidates cover only',()=>{
  const old={
    id:'v143',version:37,appVersion:'1.0.42',title:'Fault Lines',author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'story'},
    storyLock:{enabled:true,status:'verified'},
    manuscript:{blocks:[],chapters:[],notes:[],media:[],stats:{},metadata:{}},
    design:{print:{},ebook:{}},structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    editions:{
      paperback:{enabled:true,coverMode:'upload-art',lastPageCount:730,lastBuiltAt:'2026-08-25T19:00:00.000Z',lastPreflight:{ready:true,proofSignature:'proof'},lastPdfAudit:{ready:true,sha256:'inside-final',pageCount:730,proofSignature:'proof'},lastCoverAudit:{ready:true,sha256:'bad-v11',generatorVersion:11},kdpMetadata:{isbnMode:'own',isbn:'9798998826948'},barcodeBrain:{enabled:true,includeInterior:true,coverPlacement:'yasready'},printGate:{visualProof:{token:'p'},freeze:{token:'p'},external:{kdpPrintPreviewApproved:{value:true}}}},
      hardcover:{enabled:false},ebook:{enabled:true,releaseGate:{visualProof:{token:'k'},freeze:{token:'k'}}},activePrint:'paperback',
    },
  };
  const pdf=JSON.stringify(old.editions.paperback.lastPdfAudit),pf=JSON.stringify(old.editions.paperback.lastPreflight),built=old.editions.paperback.lastBuiltAt,kindle=JSON.stringify(old.editions.ebook.releaseGate);
  const migrated=migrateProject(old);
  assert.equal(migrated.appVersion,'1.0.44');
  assert.equal(migrated.editions.paperback.lastPageCount,730);
  assert.equal(migrated.editions.paperback.lastBuiltAt,built);
  assert.equal(JSON.stringify(migrated.editions.paperback.lastPreflight),pf);
  assert.equal(JSON.stringify(migrated.editions.paperback.lastPdfAudit),pdf);
  assert.equal(migrated.editions.paperback.lastCoverAudit,null);
  assert.equal(JSON.stringify(migrated.editions.ebook.releaseGate),kindle);
});

test('1.0.43 cover gate reuses persisted certified interior by current proof signature',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.ok(main.includes('buildProofSignature'));
  assert.ok(main.includes('currentInteriorProofSignature'));
  assert.ok(main.includes('certifiedProofSignature'));
  assert.ok(main.includes('interiorCurrentForCover'));
  assert.ok(!main.includes("(!liveProofSignature || interiorAudit.proofSignature === liveProofSignature)"));
});
