import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFullWrapArtwork } from '../src/lib/full-wrap-art.js';
import { printMatterFragmentKind, printMatterStyleSpec } from '../src/lib/print-matter.js';
import { migrateProject } from '../src/lib/project.js';
import { readFileSync } from 'node:fs';

const geometry = {
  type:'paperback',
  trimWidth:6,
  bleed:0.125,
  width:14.075,
  height:9.25,
  spineWidth:1.825,
};
const production = { trimId:'6x9', ink:'black', paper:'cream', bleed:false };

function art(width,height,name='Book2-wrap.jpg') {
  return {
    fileName:name,
    mimeType:'image/jpeg',
    fileSize:1000,
    width,
    height,
    dataUrl:'data:image/jpeg;base64,AA==',
    sha256:'art-sha',
  };
}

test('1.0.36 Book 2 reference artwork is diagnosed as old-wrap geometry, not a mysterious bad cover',()=>{
  const audit=analyzeFullWrapArtwork({asset:art(2048,1435),geometry,production,pageCount:730});
  assert.ok(Math.abs(audit.inferred.sourceWidthIn-13.20)<0.02,`source width ${audit.inferred.sourceWidthIn}`);
  assert.ok(Math.abs(audit.inferred.sourceSpineIn-0.95)<0.03,`source spine ${audit.inferred.sourceSpineIn}`);
  assert.ok(Math.abs(audit.inferred.targetSpineIn-1.825)<0.001);
  assert.ok(audit.inferred.inferredPages>=370 && audit.inferred.inferredPages<=390,`inferred pages ${audit.inferred.inferredPages}`);
  assert.equal(audit.inferred.targetCanExtendSpine,true);
  assert.ok(audit.inferred.effectivePpi>=150 && audit.inferred.effectivePpi<=160,`ppi ${audit.inferred.effectivePpi}`);
  assert.equal(audit.ready,false,'reference-size JPEG must not be certified as production resolution');
  assert.equal(audit.checks.find(x=>x.id==='wrap-art-resolution').status,'error');
  assert.match(audit.checks.find(x=>x.id==='wrap-art-geometry').message,/current 730-page book needs 14\.075 × 9\.250/);
});

test('1.0.36 high-resolution artwork with the same old wrap proportions can be safely spine-adapted',()=>{
  // Same physical proportions as the 13.2 × 9.25 Book 1-era wrap, but at 300 PPI.
  const audit=analyzeFullWrapArtwork({asset:art(3960,2775,'Book2-wrap-HIRES.jpg'),geometry,production,pageCount:730});
  assert.ok(Math.abs(audit.inferred.sourceWidthIn-13.20)<0.02);
  assert.ok(Math.abs(audit.inferred.sourceSpineIn-0.95)<0.03);
  assert.equal(audit.inferred.targetCanExtendSpine,true);
  assert.ok(audit.inferred.effectivePpi>=299);
  assert.equal(audit.checks.find(x=>x.id==='wrap-art-resolution').status,'pass');
  assert.equal(audit.ready,true);
});

test('1.0.36 back matter centers the heading but left-aligns readable prose underneath',()=>{
  const info={role:'about-authors',sectionType:'back-matter',meaningfulIndex:0};
  const headingKind=printMatterFragmentKind(info,{kind:'body',text:'About the Authors'});
  const bodyKind=printMatterFragmentKind({...info,meaningfulIndex:1},{kind:'body',text:'D.C.W. = Daniel, Caleb, and Will.'});
  assert.equal(headingKind,'matter-back-heading');
  assert.equal(bodyKind,'matter-back-body');
  assert.equal(printMatterStyleSpec(headingKind,{bodyFontSize:11}).alignment,'center');
  assert.equal(printMatterStyleSpec(bodyKind,{bodyFontSize:11}).alignment,'left');
  const journeyHeading=printMatterFragmentKind({role:'join-journey',sectionType:'back-matter',meaningfulIndex:0},{kind:'body',text:'Join the Journey!'});
  assert.equal(journeyHeading,'matter-back-heading');
});

test('1.0.36 Simple Mode exposes in-page forward navigation through all four steps',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  for (const marker of ['renderSimpleFlowDock','Continue to Style →','Continue to Preview →','Continue to Export →','simpleFlowDock']) {
    assert.ok(main.includes(marker),marker);
  }
});

test('1.0.36 migration invalidates print production proofs while preserving earned Kindle release proof',()=>{
  const old={
    id:'m36',version:35,appVersion:'1.0.35',title:'Fault Lines',author:'D.C.W.',source:{fileName:'book.docx',manuscriptHash:'story'},storyLock:{enabled:true,status:'verified'},
    manuscript:{blocks:[],chapters:[],notes:[],media:[],stats:{},metadata:{}},design:{print:{},ebook:{}},structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    editions:{
      paperback:{enabled:true,coverMode:'upload-pdf',uploadedCover:{fileName:'wrap.pdf',dataUrl:'data:application/pdf;base64,AA=='},lastPageCount:730,lastPdfAudit:{sha256:'i'},lastCoverAudit:{sha256:'c'},printGate:{visualProof:{token:'p'},freeze:{token:'p'},external:{kdpPrintPreviewApproved:{value:true,token:'p'}}}},
      hardcover:{enabled:false},
      ebook:{enabled:true,releaseGate:{visualProof:{token:'k'},freeze:{token:'k'},external:{kindlePreviewerOpened:{value:true,token:'k'},enhancedTypesetting:{value:true,token:'k'}}}},
      activePrint:'paperback'
    }
  };
  const kindle=JSON.stringify(old.editions.ebook.releaseGate);
  const migrated=migrateProject(old);
  assert.equal(migrated.version,37);
  assert.equal(migrated.appVersion,'1.0.43');
  assert.equal(migrated.editions.paperback.lastPageCount,null);
  assert.equal(migrated.editions.paperback.lastPdfAudit,null);
  assert.equal(migrated.editions.paperback.lastCoverAudit,null);
  assert.equal(migrated.editions.paperback.printGate.visualProof,null);
  assert.equal(migrated.editions.paperback.printGate.freeze,null);
  assert.equal(migrated.editions.paperback.printGate.external.kdpPrintPreviewApproved,false);
  assert.equal(JSON.stringify(migrated.editions.ebook.releaseGate),kindle);
});
