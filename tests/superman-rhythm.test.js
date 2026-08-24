import test from 'node:test';
import assert from 'node:assert/strict';
import { blankRenderMode } from '../src/lib/spacing-policy.js';
import { buildEbookPreviewHtml } from '../src/lib/epub-export.js';
import { DEFAULT_EBOOK_DESIGN } from '../src/lib/ebook-model.js';

function build55ChapterProject() {
  const blocks=[]; let idx=0;
  for(let chapter=1;chapter<=55;chapter++){
    blocks.push({id:`p-${++idx}`,index:idx-1,kind:'chapter-title',text:`Chapter ${chapter}: Test`,wordCount:3,style:{name:'Heading 1'}});
    for(let p=1;p<=8;p++){
      if(chapter>=5 && p%3===0){
        blocks.push({id:`p-${++idx}`,index:idx-1,kind:'blank',text:'',wordCount:0,style:{name:'Normal'}});
        if(chapter%2===0) blocks.push({id:`p-${++idx}`,index:idx-1,kind:'blank',text:'',wordCount:0,style:{name:'Normal'}});
      }
      blocks.push({id:`p-${++idx}`,index:idx-1,kind:p===1?'chapter-opening':'body',text:`Chapter ${chapter} paragraph ${p}.`,wordCount:4,style:{name:'Normal'}});
    }
  }
  return {id:'stress',title:'Stress',author:'D.C.W.',source:{manuscriptHash:'hash'},structureOverrides:{},design:{ebook:{...DEFAULT_EBOOK_DESIGN}},manuscript:{blocks,chapters:[],stats:{words:blocks.reduce((n,b)=>n+b.wordCount,0)},metadata:{}}};
}

test('blank source markup after chapter 4 cannot alter uniform ebook paragraph rhythm', () => {
  const project=build55ChapterProject();
  const first=buildEbookPreviewHtml({project,sectionIndex:0});
  const late=buildEbookPreviewHtml({project,sectionIndex:40});
  assert.match(first.css,/p\.body \{ margin:0 0 0\.7em 0;/);
  assert.match(late.css,/p\.body \{ margin:0 0 0\.7em 0;/);
  assert.doesNotMatch(late.html,/class="blank collapsed"/);
});

test('collapse policy treats all chapter-body blanks the same regardless of chapter number', () => {
  const blocks=[{kind:'body'},{kind:'blank'},{kind:'body'}];
  assert.equal(blankRenderMode({blocks,index:1,sectionType:'chapter',policy:'collapse'}),'collapse');
  assert.equal(blankRenderMode({blocks,index:1,sectionType:'body',policy:'collapse'}),'collapse');
});
