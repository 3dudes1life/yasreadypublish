import test from 'node:test';
import assert from 'node:assert/strict';
import { blankRenderMode } from '../src/lib/spacing-policy.js';
import { buildEbookPreviewHtml } from '../src/lib/epub-export.js';
import { migrateProject } from '../src/lib/project.js';

test('1.0.4 normalizes one-or-more body blanks to one visual spacer', () => {
  const blocks = [
    { id:'p-1', index:0, kind:'body', text:'One.' },
    { id:'p-2', index:1, kind:'blank', text:'' },
    { id:'p-3', index:2, kind:'blank', text:'' },
    { id:'p-4', index:3, kind:'body', text:'Two.' },
  ];
  assert.equal(blankRenderMode({ blocks, index:1, sectionType:'chapter', policy:'normalize' }), 'normalize');
  assert.equal(blankRenderMode({ blocks, index:2, sectionType:'chapter', policy:'normalize' }), 'collapse');
  assert.equal(blankRenderMode({ blocks, index:1, sectionType:'chapter', policy:'preserve' }), 'preserve');
  assert.equal(blankRenderMode({ blocks, index:1, sectionType:'chapter', policy:'collapse' }), 'collapse');
});

test('1.0.4 does not add normalized body space around chapter titles or front matter', () => {
  const chapterBlocks = [
    { id:'p-1', index:0, kind:'chapter-title', text:'Chapter 1: Home' },
    { id:'p-2', index:1, kind:'blank', text:'' },
    { id:'p-3', index:2, kind:'body', text:'Opening.' },
  ];
  assert.equal(blankRenderMode({ blocks:chapterBlocks, index:1, sectionType:'chapter', policy:'normalize' }), 'collapse');
  assert.equal(blankRenderMode({ blocks:chapterBlocks, index:1, sectionType:'front', policy:'normalize' }), 'preserve');
});

test('1.0.4 ebook keeps every source blank but normalizes a blank run visually', () => {
  const project = {
    id:'book-1', title:'Test', author:'D.C.W.',
    design:{ ebook:{ bodyBlankPolicy:'normalize', bodyBlankSpaceEm:0.7 } },
    manuscript:{
      blocks:[
        {id:'p-1',index:0,kind:'chapter-title',text:'Chapter 1: Home',wordCount:3,style:{name:'Heading 1'}},
        {id:'p-2',index:1,kind:'body',text:'First paragraph.',wordCount:2,style:{name:'Normal'}},
        {id:'p-3',index:2,kind:'blank',text:'',wordCount:0,style:{name:'Normal'}},
        {id:'p-4',index:3,kind:'blank',text:'',wordCount:0,style:{name:'Normal'}},
        {id:'p-5',index:4,kind:'body',text:'Second paragraph.',wordCount:2,style:{name:'Normal'}},
      ],
      chapters:[], stats:{words:7}, metadata:{}
    },
    structureOverrides:{}, source:{manuscriptHash:'hash'}
  };
  const preview = buildEbookPreviewHtml({ project, sectionIndex:1 });
  assert.match(preview.html, /id="p-3" class="blank normalized"/);
  assert.doesNotMatch(preview.html, /id="p-4"/);
  assert.match(preview.css, /p\.blank\.normalized \{ display:block;/);
  assert.match(preview.css, /p\.blank\.collapsed \{ display:none;/);
});

test('1.0.4 migration replaces legacy blank-dependent spacing with uniform rhythm without changing manuscript', () => {
  const project = {
    version:12, appVersion:'1.0.2',
    design:{ print:{templateId:'tres-amigos-book1',collapseBodyBlankParagraphs:true}, ebook:{collapseBodyBlankParagraphs:true} },
    structureOverrides:{},
    manuscript:{blocks:[{id:'p-1',index:0,kind:'body',text:'Exact story.',style:{name:'Normal'}},{id:'p-2',index:1,kind:'blank',text:'',style:{name:'Normal'}}],chapters:[],stats:{},metadata:{}},
    source:{}
  };
  const before = JSON.stringify(project.manuscript.blocks);
  migrateProject(project);
  assert.equal(project.version, 31);
  assert.equal(project.appVersion, '1.0.31');
  assert.equal(project.design.print.bodyBlankPolicy, 'collapse');
  assert.equal(project.design.ebook.bodyBlankPolicy, 'collapse');
  assert.equal(project.design.print.bodyBlankSpace, 0.12);
  assert.equal(project.design.print.paragraphGap, 0.12);
  assert.equal(project.design.ebook.bodyBlankSpaceEm, 0.7);
  assert.equal(project.design.ebook.paragraphGapEm, 0.7);
  assert.equal(JSON.stringify(project.manuscript.blocks), before);
});
