import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateProject } from '../src/lib/project.js';
import { normalizeEbookDesign } from '../src/lib/ebook-model.js';
import { ebookThemeFamily } from '../src/lib/ebook-theme-studio.js';
import { buildEpubPackageData } from '../src/lib/epub-export.js';

function block(id,index,kind,text,style='Normal') {
  return {id,index,kind,text,style:{name:style},runs:[{text}],wordCount:text.trim()?text.trim().split(/\s+/).length:0};
}

function v118Project({ top=6.2, after=5.4 } = {}) {
  const blocks=[
    block('c1',0,'chapter-title','Chapter 10: Ocean Air and Questions','Heading 1'),
    block('o1',1,'chapter-opening','Sunday mornings were slow and easy in their household.','Normal'),
    block('b1',2,'body','Juan lifted his coffee and smiled.','Normal'),
  ];
  return {
    id:'v119',version:25,appVersion:'1.0.18',title:'Tres Amigos',author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'locked'},storyLock:{enabled:true,status:'verified',canonicalVersion:1},
    structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    manuscript:{blocks,chapters:[],notes:[],media:[],stats:{},metadata:{}},
    design:{ebook:{}},
    editions:{ebook:{enabled:true,design:normalizeEbookDesign({
      chapterTopEm:top,chapterAfterEm:after,
      themeStudio:{themeId:'tres-amigos-private',chapterHeadingLayout:'number-title'},
    }),cover:null,releaseGate:{version:1,visualProof:null,freeze:null,safeFixRuns:[],reviewRuns:[]}}},
  };
}

test('1.0.19 Tres Amigos defaults match the measured Book 1 Kindle opening rhythm', () => {
  const theme=ebookThemeFamily('tres-amigos-private');
  const design=normalizeEbookDesign({});
  assert.equal(theme.design.chapterTopEm,8.0);
  assert.equal(theme.design.chapterAfterEm,5.5);
  assert.equal(design.chapterTopEm,8.0);
  assert.equal(design.chapterAfterEm,5.5);
  assert.equal(design.themeStudio.chapterHeadingLayout,'number-title');
  assert.equal(design.themeStudio.chapterNameItalic,true);
});

test('1.0.19 migrates only the untouched 1.0.18 Tres Amigos spacing pair', () => {
  const legacy=v118Project();
  const before=JSON.stringify(legacy.manuscript.blocks);
  const migrated=migrateProject(legacy);
  assert.equal(migrated.appVersion,'1.0.20');
  assert.equal(migrated.version,25);
  assert.equal(migrated.editions.ebook.design.chapterTopEm,8.0);
  assert.equal(migrated.editions.ebook.design.chapterAfterEm,5.5);
  assert.equal(JSON.stringify(migrated.manuscript.blocks),before);
  assert.ok(migrated.editions.ebook.releaseGate);

  const customTop=migrateProject(v118Project({top:7.1,after:5.4}));
  assert.equal(customTop.editions.ebook.design.chapterTopEm,7.1);
  assert.equal(customTop.editions.ebook.design.chapterAfterEm,5.4);

  const customAfter=migrateProject(v118Project({top:6.2,after:4.8}));
  assert.equal(customAfter.editions.ebook.design.chapterTopEm,6.2);
  assert.equal(customAfter.editions.ebook.design.chapterAfterEm,4.8);
});

test('1.0.19 exported EPUB carries the new Tres Amigos spacing without rewriting the heading', () => {
  const p=migrateProject(v118Project());
  const before=JSON.stringify(p.manuscript.blocks);
  const data=buildEpubPackageData({project:p});
  const css=String(data.files.get('OEBPS/styles.css'));
  const xhtml=String(data.files.get('OEBPS/text/chapter-001.xhtml'));
  assert.match(css,/padding-top:8(?:\.0)?em/);
  assert.match(css,/margin-bottom:5\.5em/);
  assert.match(xhtml,/class="chapter-label">Chapter 10: <\/span>/);
  assert.match(xhtml,/class="chapter-name">Ocean Air and Questions<\/span>/);
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});

test('1.0.19 Simple Mode uses the same Book 1 spacing target', () => {
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/chapterTopEm: layout === 'number-title' \? Math\.max\(Number\(design\.chapterTopEm\) \|\| 0, 8\.0\)/);
  assert.match(main,/chapterAfterEm: layout === 'number-title' \? Math\.max\(Number\(design\.chapterAfterEm\) \|\| 0, 5\.5\)/);
});
