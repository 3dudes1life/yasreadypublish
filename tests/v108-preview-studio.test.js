import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDevicePreviewHtml, buildEbookPreviewHtml, buildEpubPackageData } from '../src/lib/epub-export.js';
import { migrateProject } from '../src/lib/project.js';
import { setBlockPresentationOverride } from '../src/lib/presentation-overrides.js';

function project() {
  return migrateProject({
    version:17,
    id:'v108-test',
    title:'Fault Lines',
    author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'abc'},
    storyLock:{status:'verified'},
    design:{ebook:{publisher:'3Dudes1Life Creative'}},
    editions:{ebook:{enabled:true,design:{publisher:'3Dudes1Life Creative'},cover:{fileName:'cover.jpg',mimeType:'image/jpeg',fileSize:4,width:1600,height:2560,dataUrl:'data:image/jpeg;base64,/9j/2Q=='}}},
    manuscript:{metadata:{imageCount:0},stats:{chapters:1,words:8,paragraphs:3},blocks:[
      {id:'c1',index:0,kind:'chapter-title',text:'Chapter 1: Home',wordCount:3,style:{name:'Heading 1'},runs:[{text:'Chapter 1: Home'}]},
      {id:'p1',index:1,kind:'chapter-opening',text:'First paragraph.',wordCount:2,style:{name:'Normal'},runs:[{text:'First paragraph.'}]},
      {id:'p2',index:2,kind:'body',text:'Second paragraph.',wordCount:2,style:{name:'Normal'},runs:[{text:'Second paragraph.'}]},
    ],chapters:[{number:1,title:'Chapter 1: Home',startIndex:0,paragraphCount:2,wordCount:7}]},
  });
}

test('Preview Studio shows cover as item zero without adding a cover XHTML to EPUB', () => {
  const p=project();
  const preview=buildEbookPreviewHtml({project:p,sectionIndex:0});
  assert.equal(preview.sections[0].type,'cover');
  assert.match(preview.html,/yrp-cover-preview/);
  const epub=buildEpubPackageData({project:p});
  assert.equal([...epub.files.keys()].some(path=>/cover\.xhtml$/i.test(path)),false);
  assert.equal(epub.files.has('OEBPS/images/cover.jpg'),true);
});

test('ebook block presentation override changes preview and final XHTML but never source text', () => {
  const p=project();
  const before=JSON.stringify(p.manuscript.blocks);
  setBlockPresentationOverride(p,'ebook','p2',{spaceAfter:1.25,alignment:'center',firstLineIndent:0.5});
  const preview0=buildEbookPreviewHtml({project:p,sectionIndex:0});
  const chapterIndex=preview0.sections.findIndex(x=>x.type==='chapter');
  const preview=buildEbookPreviewHtml({project:p,sectionIndex:chapterIndex,inspectMode:true});
  assert.match(preview.html,/data-yrp-block-id="p2"/);
  assert.match(preview.html,/margin-bottom:1.25em/);
  assert.match(preview.html,/text-align:center/);
  const epub=buildEpubPackageData({project:p});
  const chapter=[...epub.files.entries()].find(([path])=>/chapter-001\.xhtml$/.test(path))[1];
  assert.match(chapter,/margin-bottom:1.25em/);
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});

test('device preview is standalone read-only proof with cover, TOC and reader controls', () => {
  const p=project();
  const html=buildDevicePreviewHtml({project:p});
  assert.match(html,/yrp-cover-preview/);
  assert.match(html,/Table of Contents/);
  assert.match(html,/Chapter 1: Home/);
  assert.match(html,/Reader appearance/);
  assert.doesNotMatch(html,/contenteditable/i);
  assert.doesNotMatch(html,/<textarea/i);
});

test('1.0.8 migration initializes presentation override buckets without changing manuscript', () => {
  const p=project();
  const before=JSON.stringify(p.manuscript.blocks);
  assert.equal(p.version, 31);
  assert.equal(p.appVersion, '1.0.31');
  assert.deepEqual(p.presentationOverrides,{ebook:{},paperback:{},hardcover:{}});
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});
