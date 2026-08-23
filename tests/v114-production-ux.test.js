import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ensureEditions } from '../src/lib/editions.js';
import { migrateProject } from '../src/lib/project.js';
import {
  buildKindleProductionFlow,
  clearKindleReviewDecision,
  kindleReviewDecision,
  markKindleReviewIntentional,
} from '../src/lib/kindle-production-flow.js';

function block(id,index,kind,text,style='Normal') {
  return { id,index,kind,text,style:{name:style},runs:[{text}],wordCount:text.trim()?text.trim().split(/\s+/).length:0 };
}

function project(overrides={}) {
  const blocks=[
    block('title',0,'heading','Tres Amigos, Una Vida','Title'),
    block('chapter',1,'chapter-title','Chapter 1: Home','Heading 1'),
    block('opening',2,'chapter-opening','The story begins here.'),
    block('body',3,'body','Three hearts moved through one life together.'),
  ];
  const raw={
    id:'v114',version:22,appVersion:'1.0.13',title:'Fault Lines',author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'locked'},storyLock:{enabled:true,status:'verified',canonicalVersion:1},
    structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    manuscript:{blocks,chapters:[],notes:[],media:[],stats:{chapters:1,words:blocks.reduce((n,b)=>n+b.wordCount,0),paragraphs:blocks.length},metadata:{}},
    design:{ebook:{publisher:'3Dudes1Life Creative'}},
    editions:{ebook:{enabled:true,design:{publisher:'3Dudes1Life Creative',language:'en',visibleToc:true,tocScope:'chapters',frontMatterMode:'clean'},cover:{fileName:'cover.jpg',mimeType:'image/jpeg',fileSize:100,width:1600,height:2560,dataUrl:'data:image/jpeg;base64,/9j/2Q=='}}},
    ...overrides,
  };
  return migrateProject(raw);
}

function report({ready=true, metadata=true, cover=true, nav=true, lock=true}={}) {
  const status=(ok)=>ok?'pass':'error';
  return {
    ready,
    checks:[
      {id:'cover',status:status(cover)},
      {id:'chapters',status:status(nav)},
      {id:'visible-toc',status:status(nav)},
      {id:'logical-toc',status:status(nav)},
      {id:'story-lock',status:status(lock)},
      {id:'source-coverage',status:status(lock)},
      {id:'metadata',status:status(metadata)},
    ],
    summary:{errors:ready?0:1,warnings:0},
  };
}

const quality=(issues=[], ready=true)=>({ready,score:100,issues,summary:{errors:issues.filter(x=>x.severity==='error').length,warnings:issues.filter(x=>x.severity!=='error').length},overrideCount:0});
const intelligence=(anomalies=[], ready=true)=>({ready,anomalies,summary:{errors:anomalies.filter(x=>x.severity==='error').length,review:anomalies.filter(x=>x.severity!=='error').length}});

test('1.0.14 intentional review decisions are exact-finding tokens, not blanket suppressions', () => {
  const p=project();
  const item={id:'spacing-body',severity:'review',label:'Body rhythm',message:'Review this spacing.',blockId:'body',sectionId:'chapter-001',fingerprint:'a'};
  const decision=markKindleReviewIntentional(p,item);
  assert.equal(decision.status,'intentional');
  assert.ok(kindleReviewDecision(p,item));
  assert.equal(kindleReviewDecision(p,{...item,message:'The finding changed.'}),null);
  assert.equal(kindleReviewDecision(p,{...item,fingerprint:'b'}),null);
  assert.equal(clearKindleReviewDecision(p,item.id),true);
  assert.equal(kindleReviewDecision(p,item),null);
});

test('1.0.14 only review findings can be marked intentional; errors and info cannot', () => {
  const p=project();
  const blocker={id:'broken-nav',severity:'error',label:'Broken navigation',message:'Fix required.'};
  const info={id:'note-count',severity:'info',label:'Notes present',message:'Informational only.'};
  assert.equal(markKindleReviewIntentional(p,blocker),null);
  assert.equal(markKindleReviewIntentional(p,info),null);
  assert.equal(Object.keys(p.editions.ebook.reviewDecisions).length,0);
});

test('1.0.14 production flow prioritizes setup, then blockers, reviews, then visual proof', () => {
  const p=project();
  const missingMetadata=project({title:'',author:''});
  let flow=buildKindleProductionFlow({project:missingMetadata,report:report(),quality:quality(),intelligence:intelligence()});
  assert.equal(flow.nextAction.type,'metadata');

  const blocker={id:'broken',severity:'error',label:'Broken thing',message:'Fix it',blockId:'body'};
  flow=buildKindleProductionFlow({project:p,report:report(),quality:quality([blocker],false),intelligence:intelligence()});
  assert.equal(flow.nextAction.type,'issue');
  assert.equal(flow.blockers.length,1);

  const review={id:'review-one',severity:'review',label:'Review thing',message:'Look at it',blockId:'body',fingerprint:'x'};
  flow=buildKindleProductionFlow({project:p,report:report(),quality:quality([review],true),intelligence:intelligence()});
  assert.equal(flow.nextAction.type,'issue');
  assert.equal(flow.reviews.length,1);
  markKindleReviewIntentional(p,review);
  flow=buildKindleProductionFlow({project:p,report:report(),quality:quality([review],true),intelligence:intelligence()});
  assert.equal(flow.reviews.length,0);
  assert.equal(flow.acknowledged.length,1);
  assert.equal(flow.nextAction.type,'preview');
});

test('1.0.14 review decisions survive edition normalization', () => {
  const p=project();
  p.editions.ebook.reviewDecisions={'review-one':{status:'intentional',token:'abc',reviewedAt:'now'}};
  ensureEditions(p);
  assert.deepEqual(p.editions.ebook.reviewDecisions,{'review-one':{status:'intentional',token:'abc',reviewedAt:'now'}});
});

test('1.0.14 migration advances schema and creates review state without changing manuscript', () => {
  const p=project();
  const before=JSON.stringify(p.manuscript.blocks);
  assert.equal(p.version,25);
  assert.equal(p.appVersion,'1.0.18');
  assert.deepEqual(p.editions.ebook.reviewDecisions,{});
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});

test('1.0.14 production review workflow never mutates Story-Locked manuscript blocks', () => {
  const p=project();
  const before=JSON.stringify(p.manuscript.blocks);
  const review={id:'review-one',severity:'review',label:'Review thing',message:'Look at it',blockId:'body',fingerprint:'x'};
  markKindleReviewIntentional(p,review);
  buildKindleProductionFlow({project:p,report:report(),quality:quality([review]),intelligence:intelligence()});
  clearKindleReviewDecision(p,review.id);
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});

test('1.0.14 Production Studio exposes queue, next action, fast navigation, focus, and quick polish', () => {
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');
  for (const marker of ['Kindle Production Console · v1.0.14','Polish Queue','NEXT BEST ACTION','ebookNavigatorSearch','data-kindle-command','data-kindle-review-source','data-inspector-preset','Focus Preview','toggleKindleFocusPreview','⌘K']) assert.match(main,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for (const marker of ['kindle-production-console','kindle-workflow-bar-v114','focus-preview','inspector-quick-rhythm']) assert.match(css,new RegExp(marker));
});

test('1.0.14 Final Check includes Kindle Intelligence in the ebook release gate', () => {
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/const ebookIntelligence = scanKindleIntelligence\(state\.project\);/);
  assert.match(main,/ebookReport\.ready && ebookQuality\.ready && ebookIntelligence\.ready/);
  assert.match(main,/ebookIntelligence\.summary\.errors/);
  assert.match(main,/ebookIntelligence\.summary\.review/);
});


test('1.0.14 polish dedupe never lets an acknowledged duplicate hide an unresolved finding', () => {
  const p=project();
  const qualityItem={id:'quality-dupe',severity:'warning',label:'Shared finding',message:'Quality view',blockId:'body',fingerprint:'q'};
  const intelligenceItem={id:'intel-dupe',severity:'review',label:'Shared finding',message:'Intelligence view',blockId:'body',fingerprint:'i',fix:{type:'reset-layout-override',blockId:'body'}};
  markKindleReviewIntentional(p,qualityItem);
  const flow=buildKindleProductionFlow({project:p,report:report(),quality:quality([qualityItem]),intelligence:intelligence([intelligenceItem])});
  assert.equal(flow.unresolved.length,1);
  assert.equal(flow.unresolved[0].source,'intelligence');
  assert.equal(flow.unresolved[0].acknowledged,false);
  assert.ok(flow.unresolved[0].fix);
});
