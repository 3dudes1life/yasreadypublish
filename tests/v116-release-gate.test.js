import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateProject } from '../src/lib/project.js';
import { setBlockPresentationOverride } from '../src/lib/presentation-overrides.js';
import {
  applySafeFixBatch,
  auditKindleAccessibility,
  buildKindleReleaseGate,
  freezeKindleRelease,
  kindleReleaseToken,
  markAllCurrentReviewsIntentional,
  markKindleVisualProofComplete,
  visualProofStatus,
} from '../src/lib/kindle-release-gate.js';
import { kindleReviewDecision } from '../src/lib/kindle-production-flow.js';

function block(id,index,kind,text,style='Normal') {
  return { id,index,kind,text,style:{name:style},runs:[{text}],wordCount:text.trim()?text.trim().split(/\s+/).length:0 };
}

function project() {
  const blocks=[
    block('title',0,'heading','Tres Amigos, Una Vida','Title'),
    block('chapter-1',1,'chapter-title','Chapter 1: Home','Heading 1'),
    block('opening-1',2,'chapter-opening','Morning found the house before any of them were ready for it.','Normal'),
    block('body-1',3,'body','Juan crossed the kitchen barefoot.','Normal'),
    block('chapter-2',4,'chapter-title','Chapter 2: Morning Light','Heading 1'),
    block('opening-2',5,'chapter-opening','The next morning arrived softly.','Normal'),
    block('body-2',6,'body','The house felt different now.','Normal'),
  ];
  return migrateProject({
    id:'v116',version:24,appVersion:'1.0.15',title:'Fault Lines',author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'locked'},storyLock:{enabled:true,status:'verified',canonicalVersion:1},
    structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    manuscript:{blocks,chapters:[],notes:[],media:[],stats:{chapters:2,words:blocks.reduce((n,b)=>n+b.wordCount,0),paragraphs:blocks.length},metadata:{}},
    design:{ebook:{publisher:'3Dudes1Life Creative'}},
    editions:{ebook:{enabled:true,design:{publisher:'3Dudes1Life Creative',language:'en',visibleToc:true,tocScope:'chapters',frontMatterMode:'clean'},cover:{fileName:'cover.jpg',mimeType:'image/jpeg',fileSize:100,width:1600,height:2560,dataUrl:'data:image/jpeg;base64,/9j/2Q=='},reviewDecisions:{}}},
  });
}

const quality=(issues=[],ready=true)=>({ready,score:100,issues,summary:{errors:issues.filter(x=>x.severity==='error').length,warnings:issues.filter(x=>x.severity==='warning').length},overrideCount:0});
const intelligence=(anomalies=[],ready=true)=>({ready,anomalies,summary:{errors:anomalies.filter(x=>x.severity==='error').length,review:anomalies.filter(x=>x.severity==='review').length,autoFixable:anomalies.filter(x=>x.fix).length}});
const report=()=>({ready:true,summary:{passes:20,warnings:0,errors:0},checks:[]});
const flow=()=>({hardReady:true,blockers:[],reviews:[],acknowledged:[]});

test('1.0.16 migrates the exact 1.0.15 project to schema 25 without touching manuscript blocks', () => {
  const p=project();
  const before=JSON.stringify(p.manuscript.blocks);
  assert.equal(p.version, 37);
  assert.equal(p.appVersion, '1.0.42');
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
  assert.equal(p.editions.ebook.releaseGate.version,1);
  assert.equal(p.editions.ebook.releaseGate.visualProof,null);
});

test('1.0.16 visual proof and release tokens invalidate after a design change', () => {
  const p=project();
  const token=kindleReleaseToken(p);
  markKindleVisualProofComplete(p);
  assert.equal(visualProofStatus(p).current,true);
  p.editions.ebook.design.paragraphGapEm=1.01;
  assert.notEqual(kindleReleaseToken(p),token);
  assert.equal(visualProofStatus(p).current,false);
});

test('1.0.16 Batch Safe Fix changes only presentation metadata and preserves Story Lock text', () => {
  const p=project();
  setBlockPresentationOverride(p,'ebook','body-1',{spaceAfter:4,semanticRole:'body'});
  const before=JSON.stringify(p.manuscript.blocks);
  const intel=intelligence([{id:'fix-one',severity:'review',label:'Odd spacing',message:'Reset it',blockId:'body-1',fix:{type:'reset-layout-override',blockId:'body-1',label:'Reset'}}]);
  const result=applySafeFixBatch(p,intel);
  assert.equal(result.applied.length,1);
  assert.equal(result.storyLockPreserved,true);
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
  assert.deepEqual(p.presentationOverrides.ebook['body-1'],{semanticRole:'body'});
});

test('1.0.16 batch review uses exact intentional-review tokens rather than blanket suppression', () => {
  const p=project();
  const q={id:'q1',severity:'warning',label:'Review spacing',message:'Current finding',blockId:'body-1',fingerprint:'a'};
  const i={id:'i1',severity:'review',label:'Review opening',message:'Current finding',blockId:'opening-1',fingerprint:'b'};
  const records=markAllCurrentReviewsIntentional(p,quality([q]),intelligence([i]));
  assert.equal(records.length,2);
  assert.ok(kindleReviewDecision(p,q));
  assert.equal(kindleReviewDecision(p,{...q,fingerprint:'changed'}),null);
});

test('1.0.16 accessibility audit inspects the finished EPUB package, navigation, headings, image semantics, and OPF metadata', () => {
  const p=project();
  const a11y=auditKindleAccessibility(p);
  assert.equal(a11y.errors,0);
  assert.equal(a11y.ready,true);
  assert.ok(a11y.checks.some((item)=>item.id==='toc-semantic' && item.status==='pass'));
  assert.ok(a11y.checks.some((item)=>item.id==='opf-accessibility' && item.status==='pass'));
  assert.ok(a11y.checks.some((item)=>item.id==='chapter-headings' && item.status==='pass'));
});

test('1.0.16 Release Gate requires current visual proof before freeze and stamps the exact release token', () => {
  const p=project();
  let gate=buildKindleReleaseGate({project:p,report:report(),quality:quality(),intelligence:intelligence(),flow:flow()});
  assert.equal(gate.freezeReady,false);
  assert.equal(gate.nextAction.type,'visual-proof');
  markKindleVisualProofComplete(p);
  gate=buildKindleReleaseGate({project:p,report:report(),quality:quality(),intelligence:intelligence(),flow:flow()});
  assert.equal(gate.freezeReady,true);
  const frozen=freezeKindleRelease(p,gate);
  assert.equal(frozen.token,gate.releaseToken);
  gate=buildKindleReleaseGate({project:p,report:report(),quality:quality(),intelligence:intelligence(),flow:flow()});
  assert.equal(gate.frozen,true);
});

test('1.0.16 UI exposes batch review, safe auto-fixes, accessibility, visual proof, release report, and Kindle freeze', () => {
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');
  for (const marker of ['Amazon Hard Mode · v1.0.27','Apply all safe fixes','Mark current reviews intentional','Mark visual proof complete','Lock EPUB build','Download Amazon report','NEXT AMAZON ACTION','Confirm Previewer opened','Confirm Enhanced Typesetting']) assert.match(main,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for (const marker of ['kindle-release-gate','release-gate-steps','release-accessibility','release-next-action']) assert.match(css,new RegExp(marker));
});
