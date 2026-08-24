import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEpubPackageData } from '../src/lib/epub-export.js';
import { runEpubPreflight } from '../src/lib/ebook-preflight.js';
import { migrateProject } from '../src/lib/project.js';

function b(index, kind, text, style='Normal', mediaRefs=[]) {
  return { id:`p-${index+1}`, index, kind, text, style:{name:style}, runs:[{text}], mediaRefs, wordCount:text.trim()?text.trim().split(/\s+/).length:0 };
}

function project({ unsupportedImage=false }={}) {
  const blocks=[
    b(0,'heading','Tres Amigos, Una Vida','Title'),
    b(1,'body','A Throuple Love Story - Fault Lines'),
    b(2,'chapter-title','Chapter 1: Home','Heading 1'),
    b(3,'chapter-opening','The story begins here.','Normal',unsupportedImage?[{mediaId:'img-1',altText:'Decorative image'}]:[]),
  ];
  return migrateProject({
    id:'v126',version:26,appVersion:'1.0.25',title:'Fault Lines',author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'locked'},storyLock:{status:'verified'},structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    manuscript:{blocks,chapters:[],notes:[],media:unsupportedImage?[{id:'img-1',fileName:'art.svg',mimeType:'image/svg+xml',dataUrl:'data:image/svg+xml;base64,PHN2Zy8+'}]:[],stats:{chapters:1,words:20,paragraphs:blocks.length},metadata:{imageCount:unsupportedImage?1:0}},
    design:{ebook:{}},
    editions:{ebook:{enabled:true,design:{themeId:'tres-amigos-private',themeStudio:{themeId:'tres-amigos-private'},language:'en',publisher:'3Dudes1Life Creative',visibleToc:true,frontMatterMode:'clean'},cover:{fileName:'cover.jpg',mimeType:'image/jpeg',fileSize:100,width:1600,height:2560,dataUrl:'data:image/jpeg;base64,/9j/2Q=='}},paperback:{enabled:false,design:{}},hardcover:{enabled:false,design:{}},activePrint:'paperback'},
  });
}

test('1.0.26 separates Kindle logical navigation from the visible Contents page', () => {
  const data=buildEpubPackageData({project:project()});
  const opf=data.files.get('OEBPS/package.opf');
  const nav=data.files.get('OEBPS/nav.xhtml');
  const contents=data.files.get('OEBPS/text/contents.xhtml');
  assert.doesNotMatch(opf,/itemref idref="nav"/);
  assert.match(opf,/itemref idref="visible-toc"/);
  assert.match(opf,/id="visible-toc" href="text\/contents.xhtml"/);
  assert.match(contents,/href="chapter-001.xhtml"/);
  assert.doesNotMatch(nav,/hidden=|display\s*:\s*none/i);
});

test('1.0.26 adds Kindle compatibility metadata without exposing private YasReady OPF fields', () => {
  const opf=buildEpubPackageData({project:project()}).files.get('OEBPS/package.opf');
  assert.match(opf,/<meta name="cover" content="cover-image"\/>/);
  assert.match(opf,/<guide>[\s\S]*type="toc"[\s\S]*type="text"[\s\S]*<\/guide>/);
  assert.doesNotMatch(opf,/yasready:|yasready\.com\/vocab/);
});

test('1.0.26 Kindle preflight blocks image types Amazon says can fail conversion', () => {
  const p=project({unsupportedImage:true});
  const before=JSON.stringify(p.manuscript.blocks);
  const report=runEpubPreflight({project:p,storyLockOk:true});
  const images=report.checks.find((item)=>item.id==='images');
  assert.equal(images.status,'error');
  assert.match(images.message,/JPEG or PNG/);
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});

test('1.0.26 migration changes app compatibility state without changing Story Lock source', () => {
  const p=project();
  const before=JSON.stringify(p.manuscript.blocks);
  assert.equal(p.appVersion, '1.0.32');
  assert.equal(p.version, 32);
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});
