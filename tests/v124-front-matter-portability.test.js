import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEpubPackageData } from '../src/lib/epub-export.js';
import { migrateProject } from '../src/lib/project.js';

function b(index, kind, text, style='Normal') {
  return { id:`p-${index+1}`, index, kind, text, style:{name:style}, runs:[{text}], wordCount:text.trim()?text.trim().split(/\s+/).length:0 };
}

function fixture({sourcePublisher=false}={}) {
  const blocks = [
    b(0,'heading','Tres Amigos, Una Vida','Title'),
    b(1,'body','A Throuple Love Story - Fault Lines'),
    b(2,'body','by D.C.W.'),
    ...(sourcePublisher ? [b(3,'body','3Dudes1Life Creative')] : []),
    b(sourcePublisher?4:3,'front-back-heading','Copyright © 2026 3Dudes1Life Creative','Heading 1'),
    b(sourcePublisher?5:4,'blank',''),
    b(sourcePublisher?6:5,'body','All rights reserved.'),
    b(sourcePublisher?7:6,'blank',''),
    b(sourcePublisher?8:7,'body','No part of this book may be reproduced, distributed, or transmitted in any form or by any means.'),
    b(sourcePublisher?9:8,'blank',''),
    b(sourcePublisher?10:9,'body','ISBN:'),
    b(sourcePublisher?11:10,'body','979-8-9988269-3-1 (E-book)'),
    b(sourcePublisher?12:11,'body','979-8-9988269-4-8 (Paperback Print)'),
    b(sourcePublisher?13:12,'body','979-8-9988269-5-5 (Hardcover Print)'),
    b(sourcePublisher?14:13,'chapter-title','Chapter 1: Home','Heading 1'),
    b(sourcePublisher?15:14,'chapter-opening','The story starts here.'),
  ];
  return {
    id:'v124',version:25,appVersion:'1.0.23',title:'Fault Lines',author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'locked'},storyLock:{status:'verified'},structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    manuscript:{blocks,chapters:[],notes:[],media:[],stats:{chapters:1,words:100,paragraphs:blocks.length},metadata:{}},
    design:{ebook:{themeId:'tres-amigos-private',themeStudio:{themeId:'tres-amigos-private'},language:'en',publisher:'3Dudes1Life Creative',frontMatterMode:'clean'}},
    editions:{ebook:{enabled:true,design:{themeId:'tres-amigos-private',themeStudio:{themeId:'tres-amigos-private'},language:'en',publisher:'3Dudes1Life Creative',frontMatterMode:'clean'},releaseGate:{version:1,visualProof:{token:'old'},freeze:{token:'old'},safeFixRuns:[],reviewRuns:[]}},paperback:{enabled:false,design:{}},hardcover:{enabled:false,design:{}},activePrint:'paperback'},
  };
}

test('1.0.24 injects publisher metadata on Book 1 title page when source omits it', () => {
  const p=migrateProject(fixture());
  const before=JSON.stringify(p.manuscript.blocks);
  const data=buildEpubPackageData({project:p});
  const title=data.files.get('OEBPS/text/front-001.xhtml');
  assert.match(title,/matter-title-publisher/);
  assert.match(title,/data-yrp-generated="publisher"/);
  assert.match(title,/3Dudes1Life Creative/);
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});

test('1.0.24 does not duplicate publisher when it already exists in title source', () => {
  const p=migrateProject(fixture({sourcePublisher:true}));
  const data=buildEpubPackageData({project:p});
  const title=data.files.get('OEBPS/text/front-001.xhtml');
  assert.equal((title.match(/3Dudes1Life Creative/g)||[]).length,1);
  assert.doesNotMatch(title,/data-yrp-generated="publisher"/);
});

test('1.0.24 pins Book 1 title display to sans and keeps publisher serif while compacting copyright', () => {
  const p=migrateProject(fixture());
  const data=buildEpubPackageData({project:p});
  const css=data.files.get('OEBPS/styles.css');
  assert.match(css,/matter-book1-title \{[^}]*font-family:Arial,Helvetica,sans-serif !important/);
  assert.match(css,/matter-book1-title p \{ font-family:Arial,Helvetica,sans-serif !important;/);
  assert.match(css,/matter-title-line \{[^}]*font-family:Georgia,"Times New Roman",serif !important/);
  assert.match(css,/matter-book1-copyright \{[^}]*font-size:\.82em;[^}]*line-height:1\.28;[^}]*break-inside:avoid-page/);
  assert.match(css,/matter-flow\.matter-after-blank \{ margin-top:\.68em;/);
});

test('1.0.24 invalidates stale ebook proof after front matter renderer changes', () => {
  const raw=fixture();
  const before=JSON.stringify(raw.manuscript.blocks);
  const p=migrateProject(raw);
  assert.equal(p.appVersion, '1.0.31');
  assert.equal(p.editions.ebook.lastPreflight,null);
  assert.equal(p.editions.ebook.releaseGate.visualProof,null);
  assert.equal(p.editions.ebook.releaseGate.freeze,null);
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});
