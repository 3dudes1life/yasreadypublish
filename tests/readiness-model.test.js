import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublishReadiness } from '../src/lib/readiness-model.js';

function project() {
  return {
    title:'Book', author:'Author', storyLock:{status:'verified'}, structureOverrides:{},
    manuscript:{blocks:[{id:'p-1',index:0,kind:'chapter-title',text:'Chapter 1: Home',wordCount:3,style:{name:'Heading 1'}}], chapters:[{number:1,title:'Chapter 1: Home',startIndex:0}], stats:{chapters:1,words:3,paragraphs:1}, metadata:{imageCount:0}},
    design:{print:{trimWidth:6,trimHeight:9,insideMargin:.75,outsideMargin:.5,topMargin:.5,bottomMargin:.75,bodyFontSize:12,chapterTitleSize:14,pageNumbers:'outside',pageNumberFontSize:9,runningHeaders:false,chapterStarts:'right'}, ebook:{language:'en'}}
  };
}

test('readiness guides from imported manuscript to proof', () => {
  const r = buildPublishReadiness({project:project(), preview:null, storyLockOk:true});
  assert.equal(r.steps.find(s=>s.id==='manuscript').status,'complete');
  assert.equal(r.steps.find(s=>s.id==='proof').status,'todo');
  assert.equal(r.paperbackReady,false);
});
