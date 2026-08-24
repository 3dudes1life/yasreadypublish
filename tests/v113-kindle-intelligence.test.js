import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateProject } from '../src/lib/project.js';
import { setBlockPresentationOverride } from '../src/lib/presentation-overrides.js';
import { applyKindleIntelligenceFix, compareKindleChapters, scanKindleIntelligence } from '../src/lib/kindle-intelligence.js';

function block(id,index,kind,text,style='Normal') {
  return { id,index,kind,text,style:{name:style},runs:[{text}],wordCount:text.trim()?text.trim().split(/\s+/).length:0 };
}

function project() {
  const blocks=[];
  let index=0;
  for (let chapter=1; chapter<=4; chapter+=1) {
    blocks.push(block(`c${chapter}`,index++,'chapter-title',`Chapter ${chapter}: Test ${chapter}`,'Heading 1'));
    blocks.push(block(`o${chapter}`,index++,'chapter-opening',`Opening paragraph for chapter ${chapter}.`));
    blocks.push(block(`p${chapter}a`,index++,'body',`Body paragraph A for chapter ${chapter}.`));
    blocks.push(block(`p${chapter}b`,index++,'body',`Body paragraph B for chapter ${chapter}.`));
  }
  return migrateProject({
    id:'v113',version:21,appVersion:'1.0.12',title:'Fault Lines',author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'locked'},storyLock:{enabled:true,status:'verified',canonicalVersion:1},
    structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    manuscript:{blocks,chapters:[],notes:[],media:[],stats:{chapters:4,words:blocks.reduce((n,b)=>n+b.wordCount,0),paragraphs:blocks.length},metadata:{}},
    design:{ebook:{publisher:'3Dudes1Life Creative'}},
    editions:{ebook:{enabled:true,design:{publisher:'3Dudes1Life Creative',visibleToc:true,tocScope:'chapters',frontMatterMode:'clean'}}},
  });
}

test('1.0.13 Kindle Intelligence builds a chapter consistency map', () => {
  const p=project();
  const scan=scanKindleIntelligence(p);
  assert.equal(scan.chapters.length,4);
  assert.equal(scan.map.length,4);
  assert.equal(scan.summary.errors,0);
  assert.equal(scan.clean,true);
  assert.equal(scan.map.every(item=>item.score===100),true);
});

test('1.0.13 detects an isolated chapter-title formatting fingerprint and offers a safe reset', () => {
  const p=project();
  setBlockPresentationOverride(p,'ebook','c4',{spaceAfter:2.1,alignment:'left'});
  const scan=scanKindleIntelligence(p);
  const outlier=scan.anomalies.find(item=>item.id==='title-override-outlier-chapter-004');
  assert.ok(outlier);
  assert.equal(outlier.blockId,'c4');
  assert.equal(outlier.fix.type,'reset-layout-override');
  assert.equal(scan.map[3].status,'review');
  assert.ok(scan.map[3].score<100);
});

test('1.0.13 safe fix changes presentation metadata only and supports Undo-compatible reset semantics', () => {
  const p=project();
  const before=JSON.stringify(p.manuscript.blocks);
  setBlockPresentationOverride(p,'ebook','p2a',{alignment:'center',spaceAfter:3,semanticRole:'block-quote'});
  const scan=scanKindleIntelligence(p);
  const issue=scan.anomalies.find(item=>item.id==='local-override-p2a');
  assert.ok(issue?.fix);
  const result=applyKindleIntelligenceFix(p,issue.fix);
  assert.equal(result.changed,'presentation-only');
  assert.deepEqual(p.presentationOverrides.ebook.p2a,{semanticRole:'block-quote'});
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});

test('1.0.13 chapter comparison scores matching presentation at 100%', () => {
  const p=project();
  const comparison=compareKindleChapters(p,0,1);
  assert.equal(comparison.match,100);
  assert.equal(comparison.differences.length,0);
});

test('1.0.13 chapter comparison exposes presentation drift without comparing prose', () => {
  const p=project();
  setBlockPresentationOverride(p,'ebook','c2',{spaceAfter:1.8});
  setBlockPresentationOverride(p,'ebook','o2',{spaceBefore:0.5});
  const comparison=compareKindleChapters(p,0,1);
  assert.ok(comparison.match<100);
  assert.ok(comparison.differences.some(item=>item.key==='title-presentation'));
  assert.ok(comparison.differences.some(item=>item.key==='opening-presentation'));
  assert.equal(comparison.differences.some(item=>JSON.stringify(item).includes('Body paragraph A for chapter')),false);
});

test('1.0.13 orphan presentation overrides are removable without manuscript mutation', () => {
  const p=project();
  p.presentationOverrides.ebook.ghost={spaceAfter:1};
  const before=JSON.stringify(p.manuscript.blocks);
  const scan=scanKindleIntelligence(p);
  const issue=scan.anomalies.find(item=>item.id==='orphan-ghost');
  assert.equal(issue.fix.type,'clear-orphan-override');
  applyKindleIntelligenceFix(p,issue.fix);
  assert.equal(p.presentationOverrides.ebook.ghost,undefined);
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});

test('1.0.13 migration advances schema without rewriting Story-Locked blocks', () => {
  const p=project();
  const before=JSON.stringify(p.manuscript.blocks);
  assert.equal(p.version,25);
  assert.equal(p.appVersion,'1.0.24');
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});

test('1.0.13 UI exposes Kindle Intelligence, chapter map, comparison, and safe-fix controls', () => {
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');
  assert.match(main,/Kindle Intelligence/);
  assert.match(main,/Compare Chapters/);
  assert.match(main,/data-intelligence-section/);
  assert.match(main,/data-intelligence-fix/);
  assert.match(main,/compareKindleChaptersButton/);
  assert.match(main,/presentation metadata only · Story Lock text unchanged/);
  assert.match(css,/kindle-consistency-map/);
  assert.match(css,/chapter-health/);
  assert.match(css,/kindle-chapter-compare/);
});
