import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrintTocEntries, detectSourcePrintToc, shouldGeneratePrintToc, verifyGeneratedPrintToc } from '../src/lib/print-toc.js';
import { TRES_AMIGOS_TEMPLATE } from '../src/lib/print-model.js';

function block(index, kind, text, style='Normal') {
  return { id:`p-${index+1}`, index, kind, text, style:{name:style}, wordCount:text.trim().split(/\s+/).filter(Boolean).length };
}

function project({ sourceToc=false }={}) {
  const blocks = [
    block(0,'front-back-heading','Copyright'),
    ...(sourceToc ? [block(1,'front-back-heading','Table of Contents','Heading 1')] : []),
    block(sourceToc ? 2 : 1,'chapter-title','Chapter 1: Home','Heading 1'),
    block(sourceToc ? 3 : 2,'chapter-opening','Opening one.'),
    block(sourceToc ? 4 : 3,'chapter-title','Chapter 2: Us','Heading 1'),
    block(sourceToc ? 5 : 4,'chapter-opening','Opening two.'),
    block(sourceToc ? 6 : 5,'front-back-heading','About the Authors','Heading 1'),
    block(sourceToc ? 7 : 6,'body','Bio.'),
  ];
  return { manuscript:{blocks}, design:{print:{...TRES_AMIGOS_TEMPLATE}}, structureOverrides:{} };
}

function pages(p) {
  const ids = p.manuscript.blocks.reduce((m,b)=>(m[b.text]=b.id,m),{});
  return [
    { number:1, bookPageNumber:null, hasChapterTitle:false, fragments:[{sourceBlockId:ids.Copyright,kind:'front-back-heading',text:'Copyright'}] },
    { number:3, bookPageNumber:1, hasChapterTitle:true, fragments:[{sourceBlockId:ids['Chapter 1: Home'],kind:'chapter-title',text:'Chapter 1: Home'}] },
    { number:9, bookPageNumber:7, hasChapterTitle:true, fragments:[{sourceBlockId:ids['Chapter 2: Us'],kind:'chapter-title',text:'Chapter 2: Us'}] },
    { number:15, bookPageNumber:13, hasChapterTitle:false, fragments:[{sourceBlockId:ids['About the Authors'],kind:'front-back-heading',text:'About the Authors'}] },
  ];
}

test('automatic print TOC uses final printed chapter and back-matter page numbers', () => {
  const p = project();
  const entries = buildPrintTocEntries({project:p,pages:pages(p),design:TRES_AMIGOS_TEMPLATE});
  assert.deepEqual(entries.map((e)=>[e.title,e.bookPageNumber]), [
    ['Chapter 1: Home',1],
    ['Chapter 2: Us',7],
    ['About the Authors',13],
  ]);
});

test('source TOC is detected so generated TOC does not duplicate or delete it', () => {
  const p = project({sourceToc:true});
  assert.equal(detectSourcePrintToc(p).detected,true);
  const mode = shouldGeneratePrintToc(p,TRES_AMIGOS_TEMPLATE);
  assert.equal(mode.generate,false);
  assert.equal(mode.reason,'source-toc-detected');
});

test('generated TOC integrity verifies against final preview map', () => {
  const p = project();
  const pg = pages(p);
  const entries = buildPrintTocEntries({project:p,pages:pg,design:TRES_AMIGOS_TEMPLATE});
  const preview = {pages:pg,generatedToc:{enabled:true,entries}};
  const result = verifyGeneratedPrintToc({project:p,preview,design:TRES_AMIGOS_TEMPLATE});
  assert.equal(result.ok,true);
  assert.equal(result.entries,3);
});

test('stale generated TOC page numbers fail integrity', () => {
  const p = project();
  const pg = pages(p);
  const entries = buildPrintTocEntries({project:p,pages:pg,design:TRES_AMIGOS_TEMPLATE});
  entries[1] = {...entries[1],bookPageNumber:999};
  const result = verifyGeneratedPrintToc({project:p,preview:{pages:pg,generatedToc:{enabled:true,entries}},design:TRES_AMIGOS_TEMPLATE});
  assert.equal(result.ok,false);
});
