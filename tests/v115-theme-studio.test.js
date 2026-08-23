import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateProject } from '../src/lib/project.js';
import { buildEpubPackageData } from '../src/lib/epub-export.js';
import { setEbookEditionDesign } from '../src/lib/editions.js';
import {
  EBOOK_THEME_FAMILIES,
  applyEbookThemeFamily,
  calculateBookDNA,
  ebookStyleUsage,
  normalizeEbookThemeStudio,
  setChapterHeadingOverride,
  sourceStyleRecords,
} from '../src/lib/ebook-theme-studio.js';

function block(id,index,kind,text,style='Normal') {
  return { id,index,kind,text,style:{name:style},runs:[{text}],wordCount:text.trim()?text.trim().split(/\s+/).length:0 };
}

function project() {
  const blocks=[
    block('title',0,'heading','Tres Amigos, Una Vida','Title'),
    block('chapter-1',1,'chapter-title','Chapter 1: Home','Heading 1'),
    block('opening-1',2,'chapter-opening','Morning found the house before any of them were ready for it.','Normal'),
    block('body-1',3,'body','Juan crossed the kitchen barefoot.','Normal'),
    block('message-1',4,'body','[Juan]: te amo. also i’m starving.','Special Message'),
    block('break-1',5,'scene-break','***','Scene Break'),
    block('body-2',6,'body','Later, the quiet gave them room to breathe.','Normal'),
    block('chapter-2',7,'chapter-title','Chapter 2: Morning Light','Heading 1'),
    block('opening-2',8,'chapter-opening','The next morning arrived softly.','Normal'),
    block('body-3',9,'body','The house felt different now.','Normal'),
  ];
  return migrateProject({
    id:'v115',version:23,appVersion:'1.0.14',title:'Fault Lines',author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'locked'},storyLock:{enabled:true,status:'verified',canonicalVersion:1},
    structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    manuscript:{blocks,chapters:[],notes:[],media:[],stats:{chapters:2,words:blocks.reduce((n,b)=>n+b.wordCount,0),paragraphs:blocks.length},metadata:{}},
    design:{ebook:{publisher:'3Dudes1Life Creative'}},
    editions:{ebook:{enabled:true,design:{publisher:'3Dudes1Life Creative',language:'en',visibleToc:true,tocScope:'chapters',frontMatterMode:'clean'},cover:null}},
  });
}

test('1.0.15 ships eight deliberate fiction theme families including the private Tres Amigos preset', () => {
  assert.equal(EBOOK_THEME_FAMILIES.length,8);
  assert.ok(EBOOK_THEME_FAMILIES.some((theme)=>theme.id==='tres-amigos-private' && theme.private));
  assert.deepEqual(EBOOK_THEME_FAMILIES.map((theme)=>theme.name),[
    'Classic Literary','Contemporary Romance','Minimal Modern','Dramatic','Soft Romance','Dark Romance','Clean Commercial','Tres Amigos — Private'
  ]);
});

test('1.0.15 migration advances the real 1.0.14 project without mutating Story-Locked manuscript blocks', () => {
  const p=project();
  const before=JSON.stringify(p.manuscript.blocks);
  const again=migrateProject(p);
  assert.equal(again.version,25);
  assert.equal(again.appVersion,'1.0.23');
  assert.equal(JSON.stringify(again.manuscript.blocks),before);
  assert.equal(again.editions.ebook.design.themeStudio.themeId,'tres-amigos-private');
});

test('1.0.15 applying a gallery family preserves book-specific mapping, artwork, and chapter overrides', () => {
  const p=project();
  const design=p.editions.ebook.design;
  const studio=normalizeEbookThemeStudio(design.themeStudio);
  studio.sourceStyleMap={'Special Message':'text-message'};
  studio.chapterArtwork={fileName:'heading.png',mimeType:'image/png',fileSize:4,width:10,height:10,dataUrl:'data:image/png;base64,iVBORw0KGgo=',altText:''};
  studio.chapterOverrides={'chapter-2':{alignment:'left'}};
  const before=JSON.stringify(p.manuscript.blocks);
  const themed=applyEbookThemeFamily({...design,themeStudio:studio},'soft-romance');
  assert.equal(themed.themeStudio.themeId,'soft-romance');
  assert.equal(themed.themeStudio.sourceStyleMap['Special Message'],'text-message');
  assert.equal(themed.themeStudio.chapterArtwork.fileName,'heading.png');
  assert.deepEqual(themed.themeStudio.chapterOverrides['chapter-2'],{alignment:'left'});
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});

test('1.0.15 Smart Word Style Mapper can remap a named source style into final semantic markup without changing text', () => {
  const p=project();
  const before=JSON.stringify(p.manuscript.blocks);
  const design=p.editions.ebook.design;
  const studio=normalizeEbookThemeStudio(design.themeStudio);
  studio.sourceStyleMap={'Special Message':'text-message'};
  setEbookEditionDesign(p,{...design,themeStudio:studio,textMessageStyle:'transcript'});
  const data=buildEpubPackageData({project:p});
  const chapter=String(data.files.get('OEBPS/text/chapter-001.xhtml'));
  assert.match(chapter,/class="text-message/);
  assert.match(chapter,/\[Juan\]: te amo\. also i’m starving\./);
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
  const styles=sourceStyleRecords(p);
  assert.ok(styles.some((record)=>record.name==='Special Message' && record.count===1));
});

test('1.0.15 chapter override sits between global theme and paragraph override and is export-visible only', () => {
  const p=project();
  const before=JSON.stringify(p.manuscript.blocks);
  const studio=setChapterHeadingOverride(p,'chapter-2',{alignment:'left',spaceBefore:2.2,spaceAfter:1.1,sizeEm:1.9});
  setEbookEditionDesign(p,{...p.editions.ebook.design,themeStudio:studio});
  const data=buildEpubPackageData({project:p});
  const chapter=String(data.files.get('OEBPS/text/chapter-002.xhtml'));
  assert.match(chapter,/margin-top:2\.2em/);
  assert.match(chapter,/margin-bottom:1\.1em/);
  assert.match(chapter,/text-align:left/);
  assert.match(chapter,/font-size:1\.9em/);
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});

test('1.0.15 custom scene-break artwork is packaged in the EPUB while locked source marks remain in XHTML', () => {
  const p=project();
  const design=p.editions.ebook.design;
  const studio=normalizeEbookThemeStudio(design.themeStudio);
  studio.sceneBreakArtwork={fileName:'break.png',mimeType:'image/png',fileSize:8,width:40,height:12,dataUrl:'data:image/png;base64,iVBORw0KGgo=',altText:''};
  setEbookEditionDesign(p,{...design,sceneBreakTreatment:'custom-image',themeStudio:studio});
  const data=buildEpubPackageData({project:p});
  assert.ok(data.files.has('OEBPS/images/theme-scene-break-artwork.png'));
  const opf=String(data.files.get('OEBPS/package.opf'));
  assert.match(opf,/theme-scene-break-artwork/);
  const chapter=String(data.files.get('OEBPS/text/chapter-001.xhtml'));
  assert.match(chapter,/scene-source-hidden">\*\*\*</);
  assert.match(chapter,/scene-break-artwork/);
});

test('1.0.15 Book DNA reports semantic features and local/chapter overrides as separate layers', () => {
  const p=project();
  p.presentationOverrides.ebook['body-1']={spaceAfter:1};
  const studio=setChapterHeadingOverride(p,'chapter-2',{alignment:'left'});
  setEbookEditionDesign(p,{...p.editions.ebook.design,themeStudio:studio});
  const dna=calculateBookDNA(p,{anomalies:[{severity:'review'}]});
  assert.equal(dna.localOverrides,1);
  assert.equal(dna.chapterOverrides,1);
  assert.equal(dna.outliers,1);
  assert.ok(dna.semanticFeatures>=4);
  assert.ok(dna.adherence<100);
});

test('1.0.15 style usage index finds every matching semantic location for whole-book review', () => {
  const p=project();
  const studio=normalizeEbookThemeStudio(p.editions.ebook.design.themeStudio);
  studio.sourceStyleMap={'Special Message':'text-message'};
  setEbookEditionDesign(p,{...p.editions.ebook.design,themeStudio:studio});
  const messages=ebookStyleUsage(p,'text-message');
  const chapters=ebookStyleUsage(p,'chapter-heading');
  assert.deepEqual(messages.map((item)=>item.blockId),['message-1']);
  assert.deepEqual(chapters.map((item)=>item.blockId),['chapter-1','chapter-2']);
});

test('1.0.15 UI exposes Theme Studio, Book DNA, Style Gallery, mapper, artwork, scope hierarchy, and whole-book usage review', () => {
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');
  for (const marker of ['Theme Studio · v1.0.15','Book Theme Builder','Style Gallery','Smart Word Style Mapper','Show me every place using this style','Theme style','Chapter override','Paragraph override','themeChapterArtworkInput','themeSceneArtworkInput','saveThemeStudio']) assert.match(main,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for (const marker of ['theme-studio-v115','theme-gallery-grid','theme-builder-layout','theme-dna-compact','theme-mapper-row','theme-usage-row']) assert.match(css,new RegExp(marker));
});
