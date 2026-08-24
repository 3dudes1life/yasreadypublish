import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProjectFromImport, migrateProject } from '../src/lib/project.js';
import { buildEpubPackageData } from '../src/lib/epub-export.js';

function block(index, kind, text, style='Normal') {
  return { id:`p-${index+1}`, index, kind, text, style:{name:style}, runs:[{text}], wordCount:text.trim()?text.trim().split(/\s+/).length:0 };
}

function parsedFixture() {
  const blocks = [
    block(0,'front-back-heading','Dedication Page','Heading 1'),
    block(1,'blank',''),
    block(2,'body','First dedication paragraph.'),
    block(3,'blank',''),
    block(4,'body','Second dedication paragraph.'),
    block(5,'blank',''),
    block(6,'body','Third dedication paragraph.'),
    block(7,'chapter-title','Chapter 1: Home','Heading 1'),
    block(8,'chapter-opening','The story starts here.'),
  ];
  return { blocks, chapters:[], notes:[], media:[], stats:{chapters:1,words:20,paragraphs:blocks.length}, metadata:{canonicalVersion:2}, canonicalText:blocks.map(b=>b.text).join('\n') };
}

test('1.0.24 new imports assume no edition until the author chooses one', async () => {
  const parsed=parsedFixture();
  const bytes=new TextEncoder().encode('fake-docx').buffer;
  const project=await createProjectFromImport({
    file:{name:'book.docx',size:9,type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',lastModified:1},
    arrayBuffer:bytes,
    parsed,
  });
  assert.equal(project.appVersion,'1.0.24');
  assert.equal(project.editions.ebook.enabled,false);
  assert.equal(project.editions.paperback.enabled,false);
  assert.equal(project.editions.hardcover.enabled,false);
});

test('1.0.24 migration preserves existing edition choices and manuscript text', () => {
  const parsed=parsedFixture();
  const raw={
    id:'existing',version:25,appVersion:'1.0.22',title:'Book',author:'Author',
    source:{fileName:'book.docx',manuscriptHash:'locked'},storyLock:{status:'verified'},structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    manuscript:{blocks:parsed.blocks,chapters:[],notes:[],media:[],stats:parsed.stats,metadata:{}},
    design:{print:{},ebook:{}},
    editions:{paperback:{enabled:false,design:{}},hardcover:{enabled:false,design:{}},ebook:{enabled:true,design:{}},activePrint:'paperback'},
  };
  const before=JSON.stringify(raw.manuscript.blocks);
  const p=migrateProject(raw);
  assert.equal(p.appVersion,'1.0.24');
  assert.equal(p.editions.ebook.enabled,true);
  assert.equal(p.editions.paperback.enabled,false);
  assert.equal(p.editions.hardcover.enabled,false);
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});

test('1.0.24 dedication paragraphs get real visual separation without changing source wording', () => {
  const parsed=parsedFixture();
  const raw={
    id:'dedication',version:25,appVersion:'1.0.22',title:'Book',author:'Author',
    source:{fileName:'book.docx',manuscriptHash:'locked'},storyLock:{status:'verified'},structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    manuscript:{blocks:parsed.blocks,chapters:[],notes:[],media:[],stats:parsed.stats,metadata:{}},
    design:{ebook:{themeId:'tres-amigos-private',themeStudio:{themeId:'tres-amigos-private'},frontMatterMode:'clean',language:'en'}},
    editions:{ebook:{enabled:true,design:{themeId:'tres-amigos-private',themeStudio:{themeId:'tres-amigos-private'},frontMatterMode:'clean',language:'en'}},paperback:{enabled:false,design:{}},hardcover:{enabled:false,design:{}},activePrint:'paperback'},
  };
  const p=migrateProject(raw);
  const before=p.manuscript.blocks.map(b=>b.text).join('|');
  const data=buildEpubPackageData({project:p});
  const css=data.files.get('OEBPS/styles.css');
  assert.match(css,/matter-book1-dedication \.matter-flow \{ margin:0 0 1\.75em;/);
  assert.match(css,/matter-dedication-lead \{ margin-bottom:2em;/);
  assert.equal(p.manuscript.blocks.map(b=>b.text).join('|'),before);
});

test('1.0.24 Simple Mode exposes format picker and post-Kindle print handoff', () => {
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/What are you making\?/);
  assert.match(main,/Nothing is assumed after upload/);
  assert.ok(main.includes('data-edition-enabled="${id}"'));
  assert.match(main,/Want to make another edition\?/);
  assert.match(main,/Continue with Paperback/);
  assert.match(main,/Continue with Hardcover/);
  assert.match(main,/data-continue-print/);
});
