import test from 'node:test';
import assert from 'node:assert/strict';
import { coverGeometry } from '../src/lib/cover-brain.js';
import { KDP_BARCODE_HEIGHT_IN, KDP_BARCODE_KNOCKOUT_HEIGHT_IN, KDP_BARCODE_KNOCKOUT_WIDTH_IN, KDP_BARCODE_WIDTH_IN } from '../src/lib/barcode-brain.js';
import { parsePrintCoverPdfBytes, auditUploadedPrintCoverPdf } from '../src/lib/print-cover-upload.js';
import { runAmazonPrintHardMode } from '../src/lib/amazon-print-hard-mode.js';
import { migrateProject } from '../src/lib/project.js';
import { buildPrintReleaseGate, freezePrintRelease, markPrintVisualProofComplete, savePrintKdpMetadata, setPrintExternalConfirmation, printReleaseReport } from '../src/lib/print-release-gate.js';

const ISBN='9798998826948';

function pages(count=100) {
  return Array.from({length:count},(_,i)=>({ number:i+1, physicalNumber:i+1, side:(i+1)%2?'right':'left' }));
}

function interiorAudit(count=100, proof='proof') {
  return { ready:true, sha256:'interior-sha', proofSignature:proof, pageCount:count, fileSize:1000, checks:[
    {id:'pdf-header',status:'pass',message:'PDF 1.4'}, {id:'page-count',status:'pass',message:`${count} pages`},
    {id:'page-size',status:'pass',message:'6 × 9 in'}, {id:'page-images',status:'pass',message:'300 DPI'}, {id:'fonts',status:'pass',message:'No live font objects; rasterized at 300 DPI'},
    {id:'encryption',status:'pass',message:'No encryption'}, {id:'annotations',status:'pass',message:'No annotations'},
    {id:'interactive',status:'pass',message:'No forms/scripts/bookmarks'}, {id:'trim-marks',status:'pass',message:'MediaBox only'},
    {id:'file-size',status:'pass',message:'Within KDP limit'}, {id:'content-fidelity',status:'pass',message:'Rendered semantic content certified'}
  ]};
}

function coverAudit(count=100, proof='proof') {
  return { ready:true, sha256:'cover-sha', proofSignature:proof, pageCount:count, fileSize:800, barcode:{vector:true}, checks:[
    {id:'page-size',status:'pass',message:'exact wrap'}, {id:'page-images',status:'pass',message:'300 DPI cover'}, {id:'barcode',status:'pass',message:'vector barcode'}
  ]};
}

function projectFixture(count=100) {
  const project=migrateProject({
    id:'v135', version:34, appVersion:'1.0.34', title:'Tres Amigos, Una Vida', author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'story'}, storyLock:{enabled:true,status:'verified'},
    manuscript:{blocks:[],chapters:[],notes:[],media:[],stats:{},metadata:{}},
    design:{print:{},ebook:{language:'en',publisher:'3Dudes1Life Creative'}}, structureOverrides:{}, presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    editions:{ paperback:{enabled:true,coverMode:'build',design:{insideMargin:1.0,outsideMargin:0.5,topMargin:0.6,bottomMargin:0.6,bodyFontSize:11,chapterTitleSize:18,pageNumberFontSize:9,runningHeaderFontSize:9},production:{configured:true,trimId:'6x9',ink:'black',paper:'cream',bleed:false},coverBrain:{configured:true,source:'generated',spineTitle:'A Throuple Love Story'},barcodeBrain:{enabled:true,includeInterior:true,coverPlacement:'yasready'},kdpMetadata:{language:'en',isbnMode:'own',isbn:ISBN},lastPageCount:count}, hardcover:{enabled:false,design:{}}, ebook:{enabled:false,design:{}}, activePrint:'paperback' }
  });
  // Migration deliberately invalidates print artifacts; restore this fixture's current files.
  project.editions.paperback.coverMode='build';
  project.editions.paperback.lastPageCount=count;
  project.editions.paperback.lastPdfAudit=interiorAudit(count);
  project.editions.paperback.lastCoverAudit=coverAudit(count);
  savePrintKdpMetadata(project,'paperback',{language:'en',publisher:'3Dudes1Life Creative',isbnMode:'own',isbn:ISBN});
  return project;
}

test('1.0.35 Book 2 placeholder replacement uses a larger knockout around the 2 × 1.2 in certified barcode',()=>{
  const g=coverGeometry({type:'paperback',production:{trimId:'6x9',ink:'black',paper:'cream'},pageCount:726});
  assert.equal(Number(g.barcode.width.toFixed(2)),KDP_BARCODE_WIDTH_IN);
  assert.equal(Number(g.barcode.height.toFixed(2)),KDP_BARCODE_HEIGHT_IN);
  assert.equal(Number(g.barcode.knockout.width.toFixed(2)),KDP_BARCODE_KNOCKOUT_WIDTH_IN);
  assert.equal(Number(g.barcode.knockout.height.toFixed(2)),KDP_BARCODE_KNOCKOUT_HEIGHT_IN);
  assert.ok(g.barcode.knockout.width>g.barcode.width);
  assert.ok(g.barcode.knockout.height>g.barcode.height);
  assert.ok(g.panels.spine.x-(g.barcode.x+g.barcode.width)>=0.25-1e-9);
  assert.ok((g.barcode.x-g.panels.back.x)>=0.25-1e-9);
});

test('1.0.35 uploaded-cover scan warns on transparency/page boxes but hard-blocks encryption',()=>{
  const source='%PDF-1.4\n1 0 obj\n<< /Type/Page /MediaBox [0 0 950.4 666] /CropBox [0 0 950.4 666] /Group << /S/Transparency >> /Subtype/Image /Height 2775 /Width 3960 >>\nendobj\n%%EOF';
  const bytes=new TextEncoder().encode(source);
  const parsed=parsePrintCoverPdfBytes(bytes);
  assert.equal(parsed.pageCount,1);
  assert.equal(parsed.transparency,true);
  assert.equal(parsed.imageObjectCount,1);
  assert.equal(parsed.largestImageWidth,3960);
  assert.equal(parsed.largestImageHeight,2775);
  const asset={fileName:'book2-wrap.pdf',fileSize:bytes.length,sha256:'cover',dataUrl:'data:application/pdf;base64,JVBERg==',...parsed};
  const audit=auditUploadedPrintCoverPdf({asset,geometry:{width:13.2,height:9.25},pageCount:726,proofSignature:'proof'});
  assert.equal(audit.ready,true);
  assert.equal(audit.checks.find(x=>x.id==='uploaded-cover-transparency').status,'warning');
  assert.equal(audit.checks.find(x=>x.id==='uploaded-cover-page-boxes').status,'warning');
  const encrypted=auditUploadedPrintCoverPdf({asset:{...asset,encrypted:true},geometry:{width:13.2,height:9.25},pageCount:726});
  assert.equal(encrypted.ready,false);
  assert.equal(encrypted.checks.find(x=>x.id==='uploaded-cover-security').status,'error');
});

test('1.0.35 Amazon Paperback Hard Mode independently certifies parity, page limits, margins, PDF safety, cover geometry and barcode',()=>{
  const project=projectFixture(100);
  const preview={proofSignature:'proof',design:project.editions.paperback.design,pages:pages(100)};
  const hard=runAmazonPrintHardMode({project,type:'paperback',preview,interiorAudit:project.editions.paperback.lastPdfAudit,coverAudit:project.editions.paperback.lastCoverAudit});
  assert.equal(hard.ready,true);
  for (const id of ['amazon-physical-parity','amazon-folio-parity','amazon-page-range','amazon-inside-margin','amazon-outside-margins','amazon-interior-security','amazon-cover-geometry','amazon-barcode-geometry','amazon-barcode-rendering']) {
    assert.equal(hard.checks.find(x=>x.id===id)?.status,'pass',id);
  }
});

test('1.0.35 parity mismatch is a blocker while a suspicious three-page blank run is a warning',()=>{
  const project=projectFixture(100);
  const badPages=pages(100); badPages[1].side='right';
  let hard=runAmazonPrintHardMode({project,type:'paperback',preview:{design:project.editions.paperback.design,pages:badPages},interiorAudit:project.editions.paperback.lastPdfAudit,coverAudit:project.editions.paperback.lastCoverAudit});
  assert.equal(hard.ready,false);
  assert.equal(hard.checks.find(x=>x.id==='amazon-physical-parity').status,'error');
  const blankPages=pages(100); blankPages[30].intentionalBlank=true; blankPages[31].intentionalBlank=true; blankPages[32].intentionalBlank=true;
  hard=runAmazonPrintHardMode({project,type:'paperback',preview:{design:project.editions.paperback.design,pages:blankPages},interiorAudit:project.editions.paperback.lastPdfAudit,coverAudit:project.editions.paperback.lastCoverAudit});
  assert.equal(hard.ready,true);
  assert.equal(hard.checks.find(x=>x.id==='amazon-blank-runs').status,'warning');
});

test('1.0.35 Amazon package certifies after KDP Print Previewer without a physical-proof software gate',()=>{
  const project=projectFixture(100);
  const preview={proofSignature:'proof',design:project.editions.paperback.design,pages:pages(100)};
  const preflight={ready:true,summary:{errors:0,warnings:0,passes:20}};
  let gate=buildPrintReleaseGate({project,type:'paperback',preflight,preview});
  assert.equal(gate.technicalReady,true);
  markPrintVisualProofComplete(project,'paperback');
  gate=buildPrintReleaseGate({project,type:'paperback',preflight,preview});
  freezePrintRelease(project,'paperback',gate);
  gate=buildPrintReleaseGate({project,type:'paperback',preflight,preview});
  assert.equal(gate.readyForKdpPreviewer,true);
  setPrintExternalConfirmation(project,'paperback','kdpPrintPreviewApproved',true);
  gate=buildPrintReleaseGate({project,type:'paperback',preflight,preview});
  assert.equal(gate.proofCertified,true);
  assert.throws(()=>setPrintExternalConfirmation(project,'paperback','physicalProofApproved',true),/Unknown print external confirmation/);
  const report=printReleaseReport({project,type:'paperback',preflight,preview,gate});
  assert.equal(report.amazonPipeline.yasreadyAmazonPackageCertified,true);
  assert.equal(report.amazonPipeline.physicalProofResponsibility,'author');
});

test('1.0.35 migration invalidates stale print/KDP Previewer proof but preserves the exact Kindle release proof',()=>{
  const old={
    id:'m35',version:34,appVersion:'1.0.34',title:'Fault Lines',author:'D.C.W.',source:{fileName:'book.docx',manuscriptHash:'story'},storyLock:{enabled:true,status:'verified'},
    manuscript:{blocks:[],chapters:[],notes:[],media:[],stats:{},metadata:{}},design:{print:{},ebook:{}},structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    editions:{paperback:{enabled:true,lastPageCount:726,lastPdfAudit:{sha256:'i'},lastCoverAudit:{sha256:'c'},printGate:{visualProof:{token:'p'},freeze:{token:'p'},external:{kdpPrintPreviewApproved:{value:true,token:'p'}}}},hardcover:{enabled:false},ebook:{enabled:true,releaseGate:{visualProof:{token:'k'},freeze:{token:'k'},external:{kindlePreviewerOpened:{value:true,token:'k'},enhancedTypesetting:{value:true,token:'k'}}}},activePrint:'paperback'}
  };
  const kindle=JSON.stringify(old.editions.ebook.releaseGate);
  const manuscript=JSON.stringify(old.manuscript);
  const migrated=migrateProject(old);
  assert.equal(migrated.version,37);
  assert.equal(migrated.appVersion,'1.0.41');
  assert.equal(migrated.editions.paperback.lastPageCount,null);
  assert.equal(migrated.editions.paperback.lastPdfAudit,null);
  assert.equal(migrated.editions.paperback.lastCoverAudit,null);
  assert.equal(migrated.editions.paperback.printGate.visualProof,null);
  assert.equal(migrated.editions.paperback.printGate.freeze,null);
  assert.equal(migrated.editions.paperback.printGate.external.kdpPrintPreviewApproved,false);
  assert.equal(JSON.stringify(migrated.editions.ebook.releaseGate),kindle);
  assert.equal(JSON.stringify(migrated.manuscript),manuscript);
});
