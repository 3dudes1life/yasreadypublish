import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldCollapseSourceBlank } from '../src/lib/spacing-policy.js';
import { buildEbookPreviewHtml } from '../src/lib/epub-export.js';
import { migrateProject } from '../src/lib/project.js';

test('1.0.2 collapses empty source paragraphs only inside story chapters', () => {
  const blank = { id:'p-2', index:1, kind:'blank', text:'', style:{name:'Normal'} };
  assert.equal(shouldCollapseSourceBlank({ block: blank, sectionType:'body', enabled:true }), true);
  assert.equal(shouldCollapseSourceBlank({ block: blank, sectionType:'chapter', enabled:true }), true);
  assert.equal(shouldCollapseSourceBlank({ block: blank, sectionType:'front', enabled:true }), false);
  assert.equal(shouldCollapseSourceBlank({ block: blank, sectionType:'back', enabled:true }), false);
  assert.equal(shouldCollapseSourceBlank({ block: blank, sectionType:'chapter', enabled:false }), false);
  assert.equal(shouldCollapseSourceBlank({ block: { ...blank, kind:'body', text:'Keep me.' }, sectionType:'chapter', enabled:true }), false);
});

test('1.0.2 ebook keeps blank source block in XHTML but renders it collapsed', () => {
  const project = {
    id:'book-1', title:'Test', author:'D.C.W.',
    design:{ ebook:{ collapseBodyBlankParagraphs:true } },
    manuscript:{
      blocks:[
        {id:'p-1',index:0,kind:'chapter-title',text:'Chapter 1: Home',wordCount:3,style:{name:'Heading 1'}},
        {id:'p-2',index:1,kind:'body',text:'First paragraph.',wordCount:2,style:{name:'Normal'}},
        {id:'p-3',index:2,kind:'blank',text:'',wordCount:0,style:{name:'Normal'}},
        {id:'p-4',index:3,kind:'body',text:'Second paragraph.',wordCount:2,style:{name:'Normal'}},
      ],
      chapters:[], stats:{words:7}, metadata:{}
    },
    structureOverrides:{}, source:{manuscriptHash:'hash'}
  };
  const preview = buildEbookPreviewHtml({ project, sectionIndex:0 });
  assert.match(preview.html, /id="p-3" class="blank collapsed"/);
  assert.match(preview.css, /p\.blank\.collapsed \{ display: none;/);
  assert.match(preview.html, /First paragraph\./);
  assert.match(preview.html, /Second paragraph\./);
});

test('1.0.2 project migration enables collapsed chapter blanks without changing manuscript', () => {
  const project = {
    version:11, appVersion:'1.0.1',
    design:{ print:{templateId:'tres-amigos-book1'}, ebook:{} },
    structureOverrides:{},
    manuscript:{blocks:[{id:'p-1',index:0,kind:'body',text:'Exact story.',style:{name:'Normal'}},{id:'p-2',index:1,kind:'blank',text:'',style:{name:'Normal'}}],chapters:[],stats:{},metadata:{}},
    source:{}
  };
  const before = JSON.stringify(project.manuscript.blocks);
  migrateProject(project);
  assert.equal(project.version, 12);
  assert.equal(project.appVersion, '1.0.2');
  assert.equal(project.design.print.collapseBodyBlankParagraphs, true);
  assert.equal(project.design.ebook.collapseBodyBlankParagraphs, true);
  assert.equal(JSON.stringify(project.manuscript.blocks), before);
});
