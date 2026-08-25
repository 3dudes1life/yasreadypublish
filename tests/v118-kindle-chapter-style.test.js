import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateProject } from '../src/lib/project.js';
import { normalizeEbookThemeStudio, splitChapterHeading } from '../src/lib/ebook-theme-studio.js';
import { buildEpubPackageData } from '../src/lib/epub-export.js';

function block(id,index,kind,text,style='Normal') { return {id,index,kind,text,style:{name:style},runs:[{text}],wordCount:text.trim()?text.trim().split(/\s+/).length:0}; }
function project() {
  const blocks=[block('c1',0,'chapter-title','Chapter 10: Ocean Air and Questions','Heading 1'),block('o1',1,'chapter-opening','Sunday mornings were slow and easy in their household.','Normal'),block('b1',2,'body','Juan lifted his coffee and smiled.','Normal')];
  return migrateProject({id:'v118',version:25,appVersion:'1.0.17',title:'Tres Amigos',author:'D.C.W.',source:{fileName:'book.docx',manuscriptHash:'locked'},storyLock:{enabled:true,status:'verified',canonicalVersion:1},structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},manuscript:{blocks,chapters:[],notes:[],media:[],stats:{},metadata:{}},design:{ebook:{}},editions:{ebook:{enabled:true,design:{},cover:null}}});
}

test('1.0.18 splits a combined source heading without changing a single source character', () => {
  const source='Chapter 10: Ocean Air and Questions';
  const split=splitChapterHeading(source);
  assert.equal(split.split,true);
  assert.equal(split.label + split.title,source);
  assert.equal(split.label,'Chapter 10: ');
  assert.equal(split.title,'Ocean Air and Questions');
});

test('1.0.18 Tres Amigos defaults to Kindle-style number + title with generous opening space', () => {
  const studio=normalizeEbookThemeStudio({themeId:'tres-amigos-private'});
  assert.equal(studio.chapterHeadingLayout,'number-title');
  assert.equal(studio.chapterNameItalic,true);
  const p=project();
  assert.equal(p.appVersion, '1.0.41');
  assert.ok(p.editions.ebook.design.chapterTopEm >= 6.2);
  assert.ok(p.editions.ebook.design.chapterAfterEm >= 5.4);
});

test('1.0.18 exported EPUB contains separate label/title presentation and exact locked wording', () => {
  const p=project();
  const before=JSON.stringify(p.manuscript.blocks);
  const data=buildEpubPackageData({project:p});
  const xhtml=String(data.files.get('OEBPS/text/chapter-001.xhtml'));
  const css=String(data.files.get('OEBPS/styles.css'));
  assert.match(xhtml,/chapter-layout-number-title/);
  assert.match(xhtml,/class="chapter-label">Chapter 10: <\/span>/);
  assert.match(xhtml,/class="chapter-name">Ocean Air and Questions<\/span>/);
  assert.match(css,/\.chapter-label/);
  assert.match(css,/text-transform:uppercase/);
  assert.match(css,/\.chapter-name/);
  assert.match(css,/font-style:italic/);
  assert.match(css,/p\.chapter-opening, p\.paragraph-after-break \{ text-indent: 0; \}/);
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});


test('1.0.18 upgrades only untouched old Tres Amigos chapter spacing and preserves custom spacing', () => {
  const legacy=project();
  legacy.version=25; legacy.appVersion='1.0.17';
  legacy.editions.ebook.design.chapterTopEm=4.2;
  legacy.editions.ebook.design.chapterAfterEm=2.4;
  delete legacy.editions.ebook.design.themeStudio.chapterHeadingLayout;
  const before=JSON.stringify(legacy.manuscript.blocks);
  const migrated=migrateProject(legacy);
  assert.equal(migrated.editions.ebook.design.chapterTopEm,8.0);
  assert.equal(migrated.editions.ebook.design.chapterAfterEm,5.5);
  assert.equal(JSON.stringify(migrated.manuscript.blocks),before);

  const custom=project();
  custom.version=25; custom.appVersion='1.0.17';
  custom.editions.ebook.design.chapterTopEm=7.1;
  custom.editions.ebook.design.chapterAfterEm=3.3;
  delete custom.editions.ebook.design.themeStudio.chapterHeadingLayout;
  const kept=migrateProject(custom);
  assert.equal(kept.editions.ebook.design.chapterTopEm,7.1);
  assert.equal(kept.editions.ebook.design.chapterAfterEm,3.3);
});

test('1.0.18 UI exposes a simple chapter-opening choice while keeping deep controls advanced', () => {
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');
  for (const marker of ['Chapter opening','How should chapter headings look?','data-chapter-heading-layout="number-title"','CHAPTER 10:','Ocean Air and Questions','themeChapterLayout','Chapter number size','Chapter title size']) assert.match(main,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for (const marker of ['simple-chapter-opening','simple-chapter-options','simple-chapter-option','theme-sample-label','theme-sample-name']) assert.match(css,new RegExp(marker));
});
