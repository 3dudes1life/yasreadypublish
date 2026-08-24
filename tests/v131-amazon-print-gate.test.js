import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateProject } from '../src/lib/project.js';
import { buildPrintReleaseGate, freezePrintRelease, markPrintVisualProofComplete, printReleaseToken, savePrintKdpMetadata, setPrintExternalConfirmation } from '../src/lib/print-release-gate.js';

function baseProject() {
  return migrateProject({
    id:'p31', version:30, appVersion:'1.0.30', title:'Fault Lines', author:'D.C.W.',
    source:{ fileName:'book.docx', manuscriptHash:'story-hash' }, storyLock:{ status:'verified', enabled:true },
    manuscript:{ blocks:[], chapters:[], notes:[], media:[], stats:{}, metadata:{} },
    design:{ print:{}, ebook:{ language:'en', publisher:'3Dudes1Life Creative' } },
    structureOverrides:{}, presentationOverrides:{ ebook:{}, paperback:{}, hardcover:{} },
    editions:{
      paperback:{ enabled:true, design:{ trimWidth:6,trimHeight:9,insideMargin:0.75,outsideMargin:0.5,topMargin:0.6,bottomMargin:0.6 }, production:{ configured:true,trimId:'6x9',ink:'black',paper:'cream',bleed:false }, coverBrain:{ configured:true,source:'generated',amazonBarcode:true }, lastPageCount:400 },
      hardcover:{ enabled:false, design:{} }, ebook:{ enabled:false, design:{ language:'en', publisher:'3Dudes1Life Creative' } }, activePrint:'paperback',
    },
  });
}

function readyFixture() {
  const project=baseProject();
  const preview={ proofSignature:'proof-400', pages:Array.from({length:400},(_,i)=>({physicalNumber:i+1})) };
  project.editions.paperback.lastPdfAudit={ ready:true,sha256:'interior-sha',proofSignature:'proof-400',pageCount:400,fileSize:1000 };
  project.editions.paperback.lastCoverAudit={ ready:true,sha256:'cover-sha',proofSignature:'proof-400',pageCount:400,fileSize:500 };
  savePrintKdpMetadata(project,'paperback',{language:'en',publisher:'3Dudes1Life Creative',isbnMode:'kdp-free'});
  const preflight={ ready:true,summary:{errors:0,warnings:0,passes:12} };
  return {project,preview,preflight};
}

test('1.0.31 Print Gate binds the exact interior, cover, page count, and metadata into one release token', () => {
  const {project,preview,preflight}=readyFixture();
  const gate=buildPrintReleaseGate({project,type:'paperback',preflight,preview});
  assert.equal(gate.technicalReady,true);
  assert.equal(gate.interiorCurrent,true);
  assert.equal(gate.coverCurrent,true);
  const token=printReleaseToken(project,'paperback');
  project.editions.paperback.lastCoverAudit.sha256='new-cover';
  assert.notEqual(printReleaseToken(project,'paperback'),token);
});

test('1.0.31 Amazon confirmations only count after visual proof and package lock for the exact token', () => {
  const {project,preview,preflight}=readyFixture();
  let gate=buildPrintReleaseGate({project,type:'paperback',preflight,preview});
  assert.equal(gate.readyForKdpPreviewer,false);
  markPrintVisualProofComplete(project,'paperback');
  gate=buildPrintReleaseGate({project,type:'paperback',preflight,preview});
  freezePrintRelease(project,'paperback',gate);
  gate=buildPrintReleaseGate({project,type:'paperback',preflight,preview});
  assert.equal(gate.readyForKdpPreviewer,true);
  setPrintExternalConfirmation(project,'paperback','kdpPrintPreviewApproved',true);
  gate=buildPrintReleaseGate({project,type:'paperback',preflight,preview});
  assert.equal(gate.kdpPublishReady,true);
  assert.equal(gate.proofCertified,false);
  setPrintExternalConfirmation(project,'paperback','physicalProofApproved',true);
  gate=buildPrintReleaseGate({project,type:'paperback',preflight,preview});
  assert.equal(gate.proofCertified,true);
  project.editions.paperback.lastPdfAudit.sha256='changed';
  gate=buildPrintReleaseGate({project,type:'paperback',preflight,preview});
  assert.equal(gate.kdpPublishReady,false);
  assert.equal(gate.external.kdpPrintPreviewApproved,false);
});

test('1.0.31 own ISBN mode blocks until a valid 10- or 13-digit ISBN is supplied', () => {
  const {project,preview,preflight}=readyFixture();
  savePrintKdpMetadata(project,'paperback',{language:'en',isbnMode:'own',isbn:'123'});
  let gate=buildPrintReleaseGate({project,type:'paperback',preflight,preview});
  assert.equal(gate.metadataReady,false);
  assert.equal(gate.checks.find(x=>x.id==='print-meta-isbn').status,'error');
  savePrintKdpMetadata(project,'paperback',{language:'en',isbnMode:'own',isbn:'9798998826931'});
  gate=buildPrintReleaseGate({project,type:'paperback',preflight,preview});
  assert.equal(gate.metadataReady,true);
});

test('1.0.31 migration adds Print Gate without rerunning older migrations or altering Kindle confirmations', () => {
  const project=baseProject();
  project.version=30; project.appVersion='1.0.30';
  project.editions.ebook.enabled=true;
  project.editions.ebook.releaseGate={ visualProof:{token:'kindle-proof'}, freeze:{token:'kindle-freeze'}, external:{kindlePreviewerOpened:{value:true,token:'k'},enhancedTypesetting:{value:true,token:'k'}} };
  const before=JSON.stringify(project.manuscript);
  const migrated=migrateProject(project);
  assert.equal(migrated.version,31);
  assert.equal(migrated.appVersion,'1.0.31');
  assert.ok(migrated.editions.paperback.printGate);
  assert.equal(migrated.editions.ebook.releaseGate.visualProof.token,'kindle-proof');
  assert.equal(JSON.stringify(migrated.manuscript),before);
});
