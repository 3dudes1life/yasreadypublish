import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBookBrain, reanalyzeBookBrain } from '../src/lib/book-brain.js';
import { effectiveStats } from '../src/lib/structure-overrides.js';
import { scanKindleQuality } from '../src/lib/kindle-quality.js';
import { auditEpubPackage } from '../src/lib/epub-audit.js';
import { normalizePrintProduction, printEligibility, printTrimOptions, applyPrintBrainToDesign } from '../src/lib/print-brain.js';
import { migrateProject } from '../src/lib/project.js';
import { TRES_AMIGOS_TEMPLATE } from '../src/lib/print-model.js';

const words = (text='') => text.trim() ? text.trim().split(/\s+/).length : 0;
const block = (id,index,text,kind='body',style='Normal',extra={}) => ({
  id,index,text,kind,style:{name:style},wordCount:words(text),runs:[{text}],layout:extra.layout || {},mediaRefs:[],numbering:extra.numbering || null,
});

function chapterBoundaryProject() {
  const blocks = [
    block('c1',0,'Chapter 1: Home','chapter-title','Heading 1'),
    block('b1',1,'The story begins.','chapter-opening'),
    block('c2',2,'Chapter 2: Morning','chapter-title','Heading 1'),
    block('b2',3,'The story continues.','chapter-opening'),
    block('back',4,'Join the Journey','front-back-heading','Heading 1'),
    block('back2',5,'A short back-matter heading','heading','Heading 1'),
  ];
  return {
    id:'qa128',version:27,appVersion:'1.0.27',title:'Book',author:'Author',
    source:{manuscriptHash:'hash'},storyLock:{status:'verified',canonicalVersion:1},
    manuscript:{blocks,chapters:[{blockId:'c1'},{blockId:'c2'}],notes:[],media:[],stats:{chapters:2},metadata:{tableCount:0,hyperlinkCount:0}},
    structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    design:{print:{...TRES_AMIGOS_TEMPLATE},ebook:{}},
    editions:{paperback:{enabled:false},hardcover:{enabled:false},ebook:{enabled:true},activePrint:'paperback'},
  };
}

test('1.0.28 Book Brain does not promote fuzzy back matter headings into chapters', () => {
  const p=chapterBoundaryProject();
  applyBookBrain(p);
  assert.equal(effectiveStats(p).chapters,2);
  assert.equal(p.bookBrain.inferredKinds.back2,undefined);
});

test('1.0.28 migration reanalyzes stale Book Brain inferred chapter state without touching source text', () => {
  const p=chapterBoundaryProject();
  p.bookBrain={ reviewDecisions:{}, inferredKinds:{back2:'chapter-title'}, semanticRoles:{}, pageStarts:{}, interpretations:[], summary:{} };
  const before=JSON.stringify(p.manuscript.blocks);
  const migrated=migrateProject(p);
  assert.equal(migrated.version, 33);
  assert.equal(migrated.appVersion,'1.0.33');
  assert.equal(JSON.stringify(migrated.manuscript.blocks),before);
  assert.equal(migrated.bookBrain.inferredKinds.back2,undefined);
  assert.equal(effectiveStats(migrated).chapters,2);
});

test('1.0.28 Kindle quality compares the finished EPUB to effective structure, not frozen parser stats', () => {
  const p=chapterBoundaryProject();
  applyBookBrain(p);
  const q=scanKindleQuality(p);
  assert.equal(q.issues.some((item)=>item.id==='chapter-count'),false);
  assert.equal(q.issues.some((item)=>item.id==='toc-count'),false);
});

test('1.0.28 front/back matter numbering does not produce a fake nested-list blocker', () => {
  const p=chapterBoundaryProject();
  p.manuscript.blocks.splice(4,0,block('fm-list',4,'1. Publisher item','body','Normal',{numbering:{numId:'1',ilvl:'0',numFmt:'decimal'}}));
  p.manuscript.blocks.forEach((b,i)=>b.index=i);
  applyBookBrain(p);
  const audit=auditEpubPackage({project:p});
  const list=audit.checks.find((item)=>item.id==='audit-amazon-lists');
  assert.equal(list.ok,true);
  assert.doesNotMatch(list.message,/0 nested item\(s\).*needs review/i);
});

test('1.0.28 Print Brain models KDP paperback and all five hardcover trims', () => {
  assert.equal(printTrimOptions('hardcover').length,5);
  const paperback=normalizePrintProduction({configured:true,trimId:'6x9',ink:'black',paper:'cream'},'paperback');
  const p=printEligibility({type:'paperback',production:paperback,pageCount:572});
  assert.equal(p.range.max,776);
  assert.equal(p.pageCountOk,true);
  assert.equal(p.requiredInside,0.75);
  const hc=printEligibility({type:'hardcover',production:{configured:true,trimId:'7x10',ink:'black',paper:'cream'},pageCount:300});
  assert.equal(hc.range.available,true);
  assert.equal(hc.range.max,550);
});

test('1.0.28 Print Brain applies KDP-safe geometry without shrinking roomier house margins', () => {
  const d=applyPrintBrainToDesign({...TRES_AMIGOS_TEMPLATE,insideMargin:1.25,outsideMargin:0.3},{configured:true,trimId:'6x9',ink:'black',paper:'cream',bleed:true},'paperback',572);
  assert.equal(d.trimWidth,6);
  assert.equal(d.trimHeight,9);
  assert.equal(d.insideMargin,1.25);
  assert.equal(d.outsideMargin,0.375);
});


test('1.0.30 compatibility migration invalidates stale pre-1.0.30 Kindle confirmations', () => {
  const p=chapterBoundaryProject();
  p.version=28;
  p.appVersion='1.0.28';
  p.bookBrain={ reviewDecisions:{}, inferredKinds:{}, semanticRoles:{}, pageStarts:{}, interpretations:[], summary:{} };
  p.editions.ebook.releaseGate={
    version:2,
    visualProof:{token:'proof-token',at:'2026-08-23T00:00:00.000Z'},
    freeze:{token:'freeze-token',at:'2026-08-23T00:00:00.000Z'},
    safeFixRuns:[],reviewRuns:[],
    external:{kindlePreviewerOpened:true,enhancedTypesetting:true,kdpOnlinePreviewApproved:false},
  };
  const migrated=migrateProject(p);
  assert.equal(migrated.editions.ebook.releaseGate.visualProof, null);
  assert.equal(migrated.editions.ebook.releaseGate.freeze, null);
  assert.equal(migrated.editions.ebook.releaseGate.external?.kindlePreviewerOpened,false);
  assert.equal(migrated.editions.ebook.releaseGate.external?.enhancedTypesetting,false);
});

test('1.0.30 migration is stable on reload and preserves current release-gate confirmations', () => {
  const p=chapterBoundaryProject();
  p.version=30;
  p.appVersion='1.0.30';
  p.bookBrain={ reviewDecisions:{}, inferredKinds:{}, semanticRoles:{}, pageStarts:{}, interpretations:[], summary:{} };
  p.editions.ebook.releaseGate={
    version:2,
    visualProof:{token:'proof-token',at:'2026-08-23T00:00:00.000Z'},
    freeze:{token:'freeze-token',at:'2026-08-23T00:00:00.000Z'},
    safeFixRuns:[],reviewRuns:[],
    external:{kindlePreviewerOpened:true,enhancedTypesetting:true,kdpOnlinePreviewApproved:false},
  };
  const migrated=migrateProject(p);
  assert.equal(migrated.editions.ebook.releaseGate.visualProof, null);
  assert.equal(migrated.editions.ebook.releaseGate.freeze, null);
  assert.equal(migrated.editions.ebook.releaseGate.external?.kindlePreviewerOpened,false);
  assert.equal(migrated.editions.ebook.releaseGate.external?.enhancedTypesetting,false);
});
