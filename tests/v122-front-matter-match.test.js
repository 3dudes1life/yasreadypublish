import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEpubPackageData } from '../src/lib/epub-export.js';
import { migrateProject } from '../src/lib/project.js';

function b(index, kind, text, style='Normal', runs=null) {
  return { id:`p-${index+1}`, index, kind, text, style:{name:style}, runs:runs || [{text}], wordCount:text.trim()?text.trim().split(/\s+/).length:0 };
}

function rawProject(themeId='tres-amigos-private') {
  const blocks = [
    b(0,'heading','Tres Amigos, Una Vida','Title'),
    b(1,'body','A Throuple Love Story - Fault Lines'),
    b(2,'body','by D.C.W.'),
    b(3,'body','3Dudes1Life Creative'),
    b(4,'front-back-heading','Copyright © 2026 3Dudes1Life Creative','Heading 1'),
    b(5,'blank',''),
    b(6,'body','All rights reserved.'),
    b(7,'blank',''),
    b(8,'body','No part of this book may be reproduced, distributed,'),
    b(9,'body','or transmitted in any form or by any means.'),
    b(10,'blank',''),
    b(11,'body','First Edition'),
    b(12,'body','ISBN:'),
    b(13,'body','979-8-9988269-3-1 (E-book)'),
    b(14,'front-back-heading','Dedication Page','Heading 1'),
    b(15,'blank',''),
    b(16,'body','To everyone who has ever been told their love was too different.'),
    b(17,'blank',''),
    b(18,'body',"Love doesn't need permission."),
    b(19,'blank',''),
    b(20,'body',"This one's for you.",'Normal',[{text:"This one's for you.",bold:true,italic:true}]),
    b(21,'chapter-title','Chapter 1: Home','Heading 1'),
    b(22,'chapter-opening','The story starts here.'),
  ];
  return {
    id:'v122', version:25, appVersion:'1.0.21', title:'Fault Lines', author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'abc'}, storyLock:{status:'verified'}, structureOverrides:{},
    manuscript:{blocks,chapters:[],notes:[],media:[],stats:{chapters:1,words:100,paragraphs:blocks.length},metadata:{}},
    design:{ebook:{themeId,themeStudio:{themeId},language:'en',publisher:'3Dudes1Life Creative',frontMatterMode:'clean'}},
    editions:{ebook:{enabled:true,design:{themeId,themeStudio:{themeId},language:'en',publisher:'3Dudes1Life Creative',frontMatterMode:'clean'},releaseGate:{version:1,visualProof:{token:'old'},freeze:{token:'old'},safeFixRuns:[],reviewRuns:[]}}},
  };
}

test('1.0.22 applies Book 1 title-page hierarchy only as presentation', () => {
  const p=migrateProject(rawProject());
  const before=p.manuscript.blocks.map(x=>x.text).join('|');
  const data=buildEpubPackageData({project:p});
  const title=data.files.get('OEBPS/text/front-001.xhtml');
  const css=data.files.get('OEBPS/styles.css');
  assert.match(title,/matter-title-page matter-book1-title/);
  assert.match(title,/Tres Amigos, Una Vida/);
  assert.match(title,/A Throuple Love Story - Fault Lines/);
  assert.match(title,/by D\.C\.W\./);
  assert.match(title,/3Dudes1Life Creative/);
  assert.match(css,/matter-book1-title/);
  assert.match(css,/letter-spacing:\.14em/);
  assert.equal(p.manuscript.blocks.map(x=>x.text).join('|'),before);
});

test('1.0.22 renders copyright as centered legal matter, not a giant heading', () => {
  const p=migrateProject(rawProject());
  const data=buildEpubPackageData({project:p});
  const xhtml=data.files.get('OEBPS/text/front-002.xhtml');
  assert.match(xhtml,/matter-book1-copyright/);
  assert.match(xhtml,/matter-copyright-lead/);
  assert.match(xhtml,/Copyright © 2026 3Dudes1Life Creative/);
  assert.doesNotMatch(xhtml,/<h2[^>]*matter-heading/i);
});

test('1.0.22 renders dedication as the quiet centered italic Book 1 page', () => {
  const p=migrateProject(rawProject());
  const data=buildEpubPackageData({project:p});
  const xhtml=data.files.get('OEBPS/text/front-003.xhtml');
  const css=data.files.get('OEBPS/styles.css');
  assert.match(xhtml,/matter-book1-dedication/);
  assert.match(xhtml,/matter-dedication-lead/);
  assert.match(xhtml,/Dedication Page/);
  assert.match(xhtml,/This one&apos;s for you\./);
  assert.doesNotMatch(xhtml,/<h2[^>]*matter-heading/i);
  assert.match(css,/matter-book1-dedication[\s\S]*font-style:italic/);
  assert.match(css,/matter-book1-dedication strong[\s\S]*font-weight:400/);
});

test('1.0.22 leaves other theme families on the generic clean front-matter renderer', () => {
  const p=migrateProject(rawProject('minimal-modern'));
  const data=buildEpubPackageData({project:p});
  const copyright=data.files.get('OEBPS/text/front-002.xhtml');
  assert.doesNotMatch(copyright,/matter-book1-copyright/);
  assert.match(copyright,/<h2[^>]*matter-heading/);
});

test('1.0.22 invalidates stale ebook proof/freeze state without changing manuscript source', () => {
  const raw=rawProject();
  const before=JSON.stringify(raw.manuscript.blocks);
  const p=migrateProject(raw);
  assert.equal(p.appVersion, '1.0.29');
  assert.equal(p.version, 29);
  assert.equal(p.editions.ebook.lastPreflight,null);
  assert.equal(p.editions.ebook.releaseGate.visualProof,null);
  assert.equal(p.editions.ebook.releaseGate.freeze,null);
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});
