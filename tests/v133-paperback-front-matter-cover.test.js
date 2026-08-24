import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBookBrain } from '../src/lib/book-brain.js';
import { buildPrintMatterIndex, normalizePrintMatterText, printMatterFragmentKind, printMatterPagePolicy, printMatterStyleSpec } from '../src/lib/print-matter.js';
import { parsePrintCoverPdfBytes, auditUploadedPrintCoverPdf } from '../src/lib/print-cover-upload.js';
import { migrateProject } from '../src/lib/project.js';

const words=(text='')=>String(text).trim()?String(text).trim().split(/\s+/).length:0;
function block(id,index,text,kind='body',style='Normal') {
  return { id,index,text,kind,style:{name:style},wordCount:words(text),runs:[{text,bold:false,italic:false}] };
}
function projectV32() {
  const blocks=[
    block('title',0,'Tres Amigos, Una Vida','body','Title'),
    block('subtitle',1,'A Throuple Love Story - Fault Lines','body','Subtitle'),
    block('byline',2,'by D.C.W.','body','Normal'),
    block('blank-a',3,'','blank'),
    block('copyright',4,'Copyright © 2026 3Dudes1Life Creative'),
    block('legal',5,'No part of this book may be reproduced or distributed in any form or by any means without prior written permission.'),
    block('isbn',6,'ISBN: 979-8-9988269-3-1 (E-book)'),
    block('dedication-head',7,'Dedication Page','body','Heading 2'),
    block('dedication-copy',8,'To everyone who has ever been told their love was too different, too complicated, or too difficult for others to understand.','body','Normal'),
    block('chapter',9,'Chapter 1: Home','chapter-title','Heading 1'),
    block('body',10,'The house waited for them.','body','Normal'),
  ];
  return {
    id:'p133',version:32,appVersion:'1.0.32',title:'Tres Amigos, Una Vida',author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'story'},storyLock:{enabled:true,status:'verified'},
    manuscript:{blocks,chapters:[],notes:[],media:[],stats:{paragraphs:blocks.length},metadata:{}},
    design:{print:{templateId:'tres-amigos-book1'},ebook:{language:'en',publisher:'3Dudes1Life Creative'}},
    structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    editions:{paperback:{enabled:true,coverBrain:{configured:true,source:'generated'},lastPageCount:726,lastPdfAudit:{ready:true},lastCoverAudit:{ready:true},printGate:{visualProof:{token:'old'},freeze:{token:'old'},external:{kdpPrintPreviewApproved:true}}},hardcover:{enabled:false},ebook:{enabled:true,design:{language:'en'}},activePrint:'paperback'},
  };
}

test('1.0.33 Print Matter splits title, copyright, and dedication into semantic print sections without changing source text',()=>{
  const p=projectV32();
  applyBookBrain(p);
  const before=JSON.stringify(p.manuscript.blocks);
  const index=buildPrintMatterIndex(p);
  assert.equal(index.get('title').role,'title');
  assert.equal(index.get('copyright').role,'copyright');
  assert.equal(index.get('dedication-head').role,'dedication');
  assert.equal(index.get('title').sectionId === index.get('copyright').sectionId,false);
  assert.equal(index.get('copyright').sectionId === index.get('dedication-head').sectionId,false);
  assert.equal(printMatterFragmentKind(index.get('title'),p.manuscript.blocks[0]),'matter-title-primary');
  assert.equal(printMatterFragmentKind(index.get('copyright'),p.manuscript.blocks[4]),'matter-copyright-heading');
  assert.equal(printMatterFragmentKind(index.get('dedication-head'),p.manuscript.blocks[7]),'matter-dedication-heading');
  assert.equal(printMatterStyleSpec('matter-title-primary').alignment,'center');
  assert.equal(printMatterStyleSpec('matter-copyright-body').alignment,'left');
  assert.equal(printMatterStyleSpec('matter-dedication-body').italic,true);
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});


test('1.0.33 semantic print page policy reproduces Book 1 physical 1/2/3 front matter sequence',()=>{
  const p=projectV32();
  applyBookBrain(p);
  const index=buildPrintMatterIndex(p);
  const title=printMatterPagePolicy(index.get('title'));
  const copyright=printMatterPagePolicy(index.get('copyright'));
  const dedication=printMatterPagePolicy(index.get('dedication-head'));
  assert.deepEqual(title,{breakBefore:true,alignRight:false});
  assert.deepEqual(copyright,{breakBefore:true,alignRight:false});
  assert.deepEqual(dedication,{breakBefore:true,alignRight:true});
  // Starting from physical page 1 (right): title stays 1, copyright breaks to 2,
  // dedication breaks to 3, which is already right-hand and needs no filler.
  let physical=1;
  physical += copyright.breakBefore ? 1 : 0;
  assert.equal(physical,2);
  physical += dedication.breakBefore ? 1 : 0;
  if (dedication.alignRight && physical % 2 === 0) physical += 1;
  assert.equal(physical,3);
});

test('1.0.33 print-matter visual cleanup collapses source whitespace presentation-only',()=>{
  assert.equal(normalizePrintMatterText('  Copyright   © 2026\n3Dudes1Life   Creative  '),'Copyright © 2026 3Dudes1Life Creative');
});

test('1.0.33 full-wrap PDF intake reads the real MediaBox and certifies matching final geometry',()=>{
  const source='%PDF-1.4\n1 0 obj\n<< /Type /Page /MediaBox [0 0 950.4 666] >>\nendobj\n%%EOF';
  const bytes=new TextEncoder().encode(source);
  const parsed=parsePrintCoverPdfBytes(bytes);
  assert.equal(parsed.ok,true);
  assert.equal(Number(parsed.widthIn.toFixed(2)),13.2);
  assert.equal(Number(parsed.heightIn.toFixed(2)),9.25);
  const asset={fileName:'wrap.pdf',fileSize:bytes.length,sha256:'abc123',dataUrl:'data:application/pdf;base64,JVBERg==',...parsed};
  const pass=auditUploadedPrintCoverPdf({asset,geometry:{width:13.2,height:9.25},pageCount:500,proofSignature:'proof'});
  assert.equal(pass.ready,true);
  const fail=auditUploadedPrintCoverPdf({asset,geometry:{width:13.4,height:9.25},pageCount:540,proofSignature:'proof2'});
  assert.equal(fail.ready,false);
  assert.equal(fail.checks.find(x=>x.id==='uploaded-cover-geometry').status,'error');
});

test('1.0.33 migration forces existing paperback authors to make an explicit cover choice and invalidates stale print proofs only',()=>{
  const p=projectV32();
  p.editions.ebook.lastPreflight={ready:true};
  const sourceBefore=JSON.stringify(p.manuscript.blocks);
  const migrated=migrateProject(p);
  assert.equal(migrated.version,35);
  assert.equal(migrated.appVersion,'1.0.35');
  assert.equal(migrated.editions.paperback.coverMode,'choose');
  assert.equal(migrated.editions.paperback.lastPageCount,null);
  assert.equal(migrated.editions.paperback.lastPdfAudit,null);
  assert.equal(migrated.editions.paperback.lastCoverAudit,null);
  assert.equal(migrated.editions.paperback.printGate.visualProof,null);
  assert.equal(JSON.stringify(migrated.manuscript.blocks),sourceBefore);
});
