import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEbookPreviewHtml, buildEpubPackageData } from '../src/lib/epub-export.js';
import { migrateProject } from '../src/lib/project.js';
import { kindlePreviewTokens, kindleViewport, normalizeKindlePreview } from '../src/lib/kindle-preview-model.js';

function project() {
  return migrateProject({
    version:18,
    id:'v109-test',
    title:'Fault Lines',
    author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'abc'},
    storyLock:{status:'verified'},
    design:{ebook:{publisher:'3Dudes1Life Creative'}},
    editions:{ebook:{enabled:true,design:{publisher:'3Dudes1Life Creative'},cover:{fileName:'cover.jpg',mimeType:'image/jpeg',fileSize:4,width:1600,height:2560,dataUrl:'data:image/jpeg;base64,/9j/2Q=='}}},
    manuscript:{metadata:{imageCount:0},stats:{chapters:1,words:7,paragraphs:3},blocks:[
      {id:'c1',index:0,kind:'chapter-title',text:'Chapter 1: Home',wordCount:3,style:{name:'Heading 1'},runs:[{text:'Chapter 1: Home'}]},
      {id:'p1',index:1,kind:'chapter-opening',text:'First paragraph.',wordCount:2,style:{name:'Normal'},runs:[{text:'First paragraph.'}]},
      {id:'p2',index:2,kind:'body',text:'Second paragraph.',wordCount:2,style:{name:'Normal'},runs:[{text:'Second paragraph.'}]},
    ],chapters:[{number:1,title:'Chapter 1: Home',startIndex:0,paragraphCount:2,wordCount:7}]},
  });
}

test('Kindle preview presets normalize to supported device, orientation, text size and appearance', () => {
  assert.deepEqual(normalizeKindlePreview({device:'wat',orientation:'sideways',fontScale:'xxl',appearance:'blue',mode:'edit'}), {
    device:'ereader', orientation:'portrait', fontFace:'serif', fontScale:'m', appearance:'white', mode:'read', simulateEink:false, referencePt:11,
  });
  const portrait=kindleViewport({device:'phone',orientation:'portrait'});
  const landscape=kindleViewport({device:'phone',orientation:'landscape'});
  assert.equal(portrait.width,390);
  assert.equal(portrait.height,700);
  assert.equal(landscape.width,700);
  assert.equal(landscape.height,390);
  assert.equal(kindlePreviewTokens({device:'ereader'}).grayscale,false);
  assert.equal(kindlePreviewTokens({device:'ereader',simulateEink:true}).grayscale,true);
  assert.equal(kindlePreviewTokens({device:'phone'}).grayscale,false);
});

test('Read Mode preview contains no inspection hooks; Adjust Layout adds them', () => {
  const p=project();
  const base=buildEbookPreviewHtml({project:p,sectionIndex:0});
  const chapterIndex=base.sections.findIndex(item=>item.type==='chapter');
  const read=buildEbookPreviewHtml({project:p,sectionIndex:chapterIndex,inspectMode:false});
  const adjust=buildEbookPreviewHtml({project:p,sectionIndex:chapterIndex,inspectMode:true});
  assert.doesNotMatch(read.html,/data-yrp-block-id=/);
  assert.match(adjust.html,/data-yrp-block-id="p1"/);
  assert.match(adjust.html,/yrp-inspectable/);
});

test('Cover preview is a live simulator item while exported EPUB still has no duplicate cover XHTML', () => {
  const p=project();
  const preview=buildEbookPreviewHtml({project:p,sectionIndex:0});
  assert.equal(preview.section.type,'cover');
  assert.match(preview.html,/yrp-live-cover/);
  const epub=buildEpubPackageData({project:p});
  assert.equal(epub.files.has('OEBPS/images/cover.jpg'),true);
  assert.equal([...epub.files.keys()].some(path=>/cover\.xhtml$/i.test(path)),false);
});

test('1.0.9 migration leaves manuscript blocks byte-for-byte JSON identical', () => {
  const raw=project();
  const before=JSON.stringify(raw.manuscript.blocks);
  const migrated=migrateProject(raw);
  assert.equal(migrated.version,25);
  assert.equal(migrated.appVersion,'1.0.24');
  assert.equal(JSON.stringify(migrated.manuscript.blocks),before);
});
