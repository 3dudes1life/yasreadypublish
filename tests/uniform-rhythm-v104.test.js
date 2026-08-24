import test from 'node:test';
import assert from 'node:assert/strict';
import { TRES_AMIGOS_TEMPLATE } from '../src/lib/print-model.js';
import { DEFAULT_EBOOK_DESIGN } from '../src/lib/ebook-model.js';
import { blankRenderMode } from '../src/lib/spacing-policy.js';
import { migrateProject } from '../src/lib/project.js';

const blocks = [
  {id:'a', index:0, kind:'body', text:'One'},
  {id:'b', index:1, kind:'blank', text:''},
  {id:'c', index:2, kind:'blank', text:''},
  {id:'d', index:3, kind:'body', text:'Two'},
];

test('1.0.4 Tres Amigos uses uniform story paragraph rhythm', () => {
  assert.equal(TRES_AMIGOS_TEMPLATE.paragraphGap, 0.12);
  assert.equal(TRES_AMIGOS_TEMPLATE.bodyBlankPolicy, 'collapse');
  assert.equal(DEFAULT_EBOOK_DESIGN.paragraphGapEm, 0.7);
  assert.equal(DEFAULT_EBOOK_DESIGN.bodyBlankPolicy, 'collapse');
});

test('1.0.4 body source blanks collapse so they cannot change chapter rhythm', () => {
  assert.equal(blankRenderMode({blocks,index:1,sectionType:'chapter',policy:'collapse'}), 'collapse');
  assert.equal(blankRenderMode({blocks,index:2,sectionType:'chapter',policy:'collapse'}), 'collapse');
  assert.equal(blankRenderMode({blocks,index:1,sectionType:'front',policy:'collapse'}), 'preserve');
});

test('1.0.4 migrates existing Tres Amigos editions without altering manuscript text', () => {
  const manuscript = {blocks:[{id:'p-1',index:0,kind:'body',text:'Exact story.'}],chapters:[],stats:{},metadata:{}};
  const before = JSON.stringify(manuscript.blocks);
  const project = {
    version:13, appVersion:'1.0.4', title:'Book', author:'D.C.W.', manuscript, structureOverrides:{},
    design:{print:{templateId:'tres-amigos-book1',name:'Tres Amigos Series · Book 1',paragraphGap:0,bodyBlankPolicy:'normalize'}, ebook:{paragraphGapEm:0,bodyBlankPolicy:'normalize'}},
    editions:{
      paperback:{enabled:true,type:'paperback',design:{templateId:'tres-amigos-book1',name:'Tres Amigos Series · Book 1',paragraphGap:0,bodyBlankPolicy:'normalize'}},
      hardcover:{enabled:false,type:'hardcover',design:{templateId:'tres-amigos-hardcover',name:'Tres Amigos Series · Hardcover',paragraphGap:0,bodyBlankPolicy:'normalize'}},
      ebook:{enabled:true,type:'ebook',design:{paragraphGapEm:0,bodyBlankPolicy:'normalize'}},
      activePrint:'paperback'
    }
  };
  migrateProject(project);
  assert.equal(project.version, 34);
  assert.equal(project.editions.paperback.design.paragraphGap,0.12);
  assert.equal(project.editions.paperback.design.bodyBlankPolicy,'collapse');
  assert.equal(project.editions.hardcover.design.paragraphGap,0.12);
  assert.equal(project.editions.ebook.design.paragraphGapEm,0.7);
  assert.equal(project.editions.ebook.design.bodyBlankPolicy,'collapse');
  assert.equal(JSON.stringify(project.manuscript.blocks), before);
});
