import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateProject } from '../src/lib/project.js';
import { runEpubPreflight } from '../src/lib/ebook-preflight.js';
import { buildEpubPackageData } from '../src/lib/epub-export.js';

function b(index, kind, text, style='Normal') {
  return { id:`p-${index+1}`, index, kind, text, style:{name:style}, runs:[{text}], wordCount:text.trim()?text.trim().split(/\s+/).length:0 };
}

function sample() {
  const blocks = [
    b(0,'front-back-heading','Copyright © 2026 3Dudes1Life Creative','Title'),
    b(1,'body','All rights reserved.'),
    b(2,'chapter-title','Chapter 1: Home','Heading 1'),
    b(3,'chapter-opening','The story begins here.'),
    b(4,'body','Second paragraph.'),
    b(5,'chapter-title','Chapter 2: Morning','Heading 1'),
    b(6,'chapter-opening','Another beginning.'),
  ];
  return {
    id:'book-v107', title:'Tres Amigos, Una Vida: A Throuple Love Story — Fault Lines', author:'D.C.W.', version:16, appVersion:'1.0.6',
    source:{fileName:'book.docx',manuscriptHash:'abc'}, storyLock:{status:'verified'}, structureOverrides:{},
    manuscript:{blocks,chapters:[],stats:{chapters:2,words:blocks.reduce((n,x)=>n+x.wordCount,0)},metadata:{imageCount:0,tableCount:0,manualPageBreakCount:0}},
    design:{ebook:{language:'en',publisher:'3Dudes1Life Creative',bodyAlignment:'left',fontFamily:'sans'}},
    editions:{ebook:{enabled:true,design:{language:'en',publisher:'3Dudes1Life Creative',bodyAlignment:'left',fontFamily:'sans',visibleToc:true,tocScope:'chapters',frontMatterMode:'clean'},cover:{fileName:'cover.jpg',mimeType:'image/jpeg',fileSize:1000,width:1600,height:2560,dataUrl:'data:image/jpeg;base64,/9j/2Q=='}}},
  };
}

test('1.0.7 migration makes Kindle reader defaults authoritative without changing manuscript blocks', () => {
  const p = sample();
  const before = JSON.stringify(p.manuscript.blocks);
  migrateProject(p);
  assert.equal(p.version,22);
  assert.equal(p.appVersion,'1.0.13');
  assert.equal(p.editions.ebook.design.fontFamily,'reader');
  assert.equal(p.editions.ebook.design.bodyAlignment,'reader');
  assert.equal(p.editions.ebook.design.visibleToc,true);
  assert.equal(p.editions.ebook.design.tocScope,'chapters');
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});

test('Kindle preflight is KDP-focused and no longer exposes retailer-specific readiness', () => {
  const p = sample(); migrateProject(p);
  const report = runEpubPreflight({project:p,storyLockOk:true});
  assert.equal(report.target,'Amazon KDP / Kindle');
  assert.equal(report.kdp.ready,true);
  assert.equal(Object.hasOwn(report,'storeReadiness'),false);
  assert.equal(report.checks.some((x)=>/Apple|Kobo|Google|NOOK|B&N/i.test(x.label)),false);
});

test('Kindle EPUB leaves body line height and alignment to reader defaults', () => {
  const p = sample(); migrateProject(p);
  const data = buildEpubPackageData({project:p});
  const css = data.files.get('OEBPS/styles.css');
  const bodyRule = css.match(/body \{([^}]*)\}/)?.[1] || '';
  assert.doesNotMatch(bodyRule,/line-height/);
  assert.doesNotMatch(bodyRule,/text-align/);
  assert.match(css,/p\.body \{ margin:0 0 0\.7em 0; text-indent: 1\.35em;/);
});

test('Kindle EPUB keeps visible linked Contents in spine and internal cover metadata', () => {
  const p = sample(); migrateProject(p);
  const data = buildEpubPackageData({project:p});
  const opf = data.files.get('OEBPS/package.opf');
  const nav = data.files.get('OEBPS/nav.xhtml');
  assert.match(opf,/itemref idref="nav"/);
  assert.match(opf,/properties="cover-image"/);
  assert.match(nav,/epub:type="toc"/);
  assert.match(nav,/Chapter 1: Home/);
  assert.match(nav,/epub:type="bodymatter"/);
});

test('1.0.7 ebook UI is Kindle-first and removes multi-store clutter', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main,/Kindle \/ eBook/);
  assert.match(main,/Download KDP EPUB/);
  assert.match(main,/Amazon KDP · Reflowable EPUB 3/);
  assert.doesNotMatch(main,/Apple Books|Kobo Writing Life|Google Play Books|B&N NOOK/);
});
