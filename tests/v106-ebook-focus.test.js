import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEbookPreviewHtml, buildEpubPackageData } from '../src/lib/epub-export.js';
import { ebookTocEntries } from '../src/lib/ebook-model.js';
import { runEpubPreflight } from '../src/lib/ebook-preflight.js';
import { migrateProject } from '../src/lib/project.js';

function b(index, kind, text, style='Normal') {
  return { id:`p-${index+1}`, index, kind, text, style:{name:style}, runs:[{text}], wordCount:text.trim()?text.trim().split(/\s+/).length:0 };
}

function sample({ cover=true }={}) {
  const blocks = [
    b(0,'front-back-heading','Copyright © 2026 3Dudes1Life Creative','Title'),
    b(1,'blank',''),
    b(2,'body','All rights reserved.'),
    b(3,'blank',''),
    b(4,'body','No part of this book may be reproduced.'),
    b(5,'front-back-heading','Dedication Page','Heading 1'),
    b(6,'body','For us.'),
    b(7,'chapter-title','Chapter 1: Home','Heading 1'),
    b(8,'chapter-opening','The story begins here.'),
    b(9,'body','Second paragraph.'),
    b(10,'chapter-title','Chapter 2: Morning','Heading 1'),
    b(11,'chapter-opening','Another beginning.'),
  ];
  return {
    id:'book-v106', title:'Fault Lines', author:'D.C.W.', version:15, appVersion:'1.0.5',
    source:{fileName:'book.docx',manuscriptHash:'abc'}, storyLock:{status:'verified'}, structureOverrides:{},
    manuscript:{blocks,chapters:[],stats:{chapters:2,words:blocks.reduce((n,x)=>n+x.wordCount,0)},metadata:{imageCount:0,tableCount:0,manualPageBreakCount:0}},
    design:{ebook:{language:'en',publisher:'3Dudes1Life Creative'}},
    editions:{ebook:{enabled:true,design:{language:'en',publisher:'3Dudes1Life Creative'},cover:cover?{fileName:'cover.jpg',mimeType:'image/jpeg',fileSize:1000,width:1600,height:2560,dataUrl:'data:image/jpeg;base64,/9j/2Q=='}:null}},
  };
}

test('1.0.6 migration enables visible chapters-only TOC and clean front matter without changing source blocks', () => {
  const p = sample();
  const before = JSON.stringify(p.manuscript.blocks);
  migrateProject(p);
  assert.equal(p.version,16);
  assert.equal(p.appVersion,'1.0.6');
  assert.equal(p.editions.ebook.design.visibleToc,true);
  assert.equal(p.editions.ebook.design.tocScope,'chapters');
  assert.equal(p.editions.ebook.design.frontMatterMode,'clean');
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});

test('default novel TOC contains every chapter but excludes copyright and dedication clutter', () => {
  const p = sample(); migrateProject(p);
  const toc = ebookTocEntries(p,p.editions.ebook.design);
  assert.deepEqual(toc.map(x=>x.label),['Chapter 1: Home','Chapter 2: Morning']);
});

test('visible Table of Contents is inserted in preview immediately before Chapter 1', () => {
  const p = sample(); migrateProject(p);
  const first = buildEbookPreviewHtml({project:p,sectionIndex:0});
  const tocIndex = first.sections.findIndex(x=>x.type==='toc');
  const chapterIndex = first.sections.findIndex(x=>x.type==='chapter');
  assert.ok(tocIndex >= 0);
  assert.equal(tocIndex + 1, chapterIndex);
  const tocPreview = buildEbookPreviewHtml({project:p,sectionIndex:tocIndex});
  assert.match(tocPreview.html,/Table of Contents/);
  assert.match(tocPreview.html,/Chapter 1: Home/);
  assert.doesNotMatch(tocPreview.html,/\bpage\s*1\b/i);
});

test('EPUB spine contains visible nav TOC before first chapter and landmarks identify TOC and bodymatter', () => {
  const p = sample(); migrateProject(p);
  const data = buildEpubPackageData({project:p});
  const opf = data.files.get('OEBPS/package.opf');
  const nav = data.files.get('OEBPS/nav.xhtml');
  assert.ok(opf.indexOf('idref="nav"') < opf.indexOf('idref="s3"') || /<itemref idref="nav"\/>[\s\S]*<itemref idref="s\d+"\/>/.test(opf));
  assert.match(nav,/epub:type="landmarks"/);
  assert.match(nav,/epub:type="toc" href="nav.xhtml#toc"/);
  assert.match(nav,/epub:type="bodymatter" href="text\/chapter-001.xhtml"/);
});

test('universal EPUB packages one internal cover-image and no duplicate HTML cover page', () => {
  const p = sample(); migrateProject(p);
  const data = buildEpubPackageData({project:p});
  const opf = data.files.get('OEBPS/package.opf');
  assert.match(opf,/properties="cover-image"/);
  assert.equal(data.files.has('OEBPS/images/cover.jpg'),true);
  assert.equal([...data.files.keys()].some(path=>/cover\.xhtml$/i.test(path)),false);
});

test('universal preflight blocks a missing cover and passes all five store cards with a compliant cover', () => {
  const missing = sample({cover:false}); migrateProject(missing);
  const bad = runEpubPreflight({project:missing,storyLockOk:true});
  assert.equal(bad.ready,false);
  assert.equal(bad.checks.find(x=>x.id==='cover').status,'error');
  const good = sample({cover:true}); migrateProject(good);
  const report = runEpubPreflight({project:good,storyLockOk:true});
  assert.equal(report.ready,true);
  assert.equal(report.storeReadiness.length,5);
  assert.equal(report.storeReadiness.every(x=>x.ready),true);
});

test('clean front matter collapses print-only blank paragraphs while preserving every source word', () => {
  const p = sample(); migrateProject(p);
  const preview = buildEbookPreviewHtml({project:p,sectionIndex:0});
  assert.match(preview.html,/Copyright © 2026 3Dudes1Life Creative/);
  assert.match(preview.html,/All rights reserved\./);
  assert.match(preview.html,/blank collapsed/);
  assert.doesNotMatch(preview.html,/blank preserved/);
});

test('chapter rhythm remains publisher-controlled after front-matter cleanup', () => {
  const p = sample(); migrateProject(p);
  const preview = buildEbookPreviewHtml({project:p,sectionIndex:0});
  const chapterIndex = preview.sections.findIndex(x=>x.type==='chapter');
  const chapter = buildEbookPreviewHtml({project:p,sectionIndex:chapterIndex});
  assert.match(chapter.css,/p\.body \{ margin:0 0 0\.7em 0;/);
  assert.match(chapter.html,/The story begins here\./);
  assert.match(chapter.html,/Second paragraph\./);
});
