import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEpubPackageData } from '../src/lib/epub-export.js';
import { auditEpubPackage } from '../src/lib/epub-audit.js';
import { coverGeometry, coverBrainChecks } from '../src/lib/cover-brain.js';
import { migrateProject } from '../src/lib/project.js';

function block(index, kind, text, style='Normal') {
  return { id:`p-${index+1}`, index, kind, text, style:{name:style}, runs:text?[{text}]:[], wordCount:text.trim()?text.trim().split(/\s+/).length:0 };
}

function project(version=29, appVersion='1.0.29') {
  const blocks=[
    block(0,'heading','Tres Amigos, Una Vida','Title'),
    block(1,'body','A Throuple Love Story - Fault Lines'),
    block(2,'blank',''),
    block(3,'body','D.C.W.'),
    block(4,'blank',''),
    block(5,'chapter-title','Chapter 1: Home','Heading 1'),
    block(6,'chapter-opening','The story begins here.'),
  ];
  return migrateProject({
    id:'v130',version,appVersion,title:'Fault Lines',author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'locked'},storyLock:{status:'verified'},structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    manuscript:{blocks,chapters:[],notes:[],media:[],stats:{chapters:1,words:20,paragraphs:blocks.length},metadata:{}},
    design:{print:{},ebook:{}},
    editions:{
      ebook:{enabled:true,design:{themeId:'tres-amigos-private',themeStudio:{themeId:'tres-amigos-private'},language:'en',publisher:'3Dudes1Life Creative',visibleToc:true,frontMatterMode:'clean'},cover:null},
      paperback:{enabled:true,design:{},pageCount:200,production:{configured:true,trimId:'6x9',ink:'black',paper:'cream',bleed:false}},
      hardcover:{enabled:false,design:{}},activePrint:'paperback',
    },
  });
}

test('1.0.30 production EPUB contains no hidden-content CSS/markup that can trigger Kindle E21018', () => {
  const p=project();
  const data=buildEpubPackageData({project:p});
  const css=String(data.files.get('OEBPS/styles.css') || '');
  const front=String(data.files.get('OEBPS/text/front-001.xhtml') || '');
  assert.match(front,/Tres Amigos, Una Vida/);
  assert.doesNotMatch(css,/display\s*:\s*none|visibility\s*:\s*hidden/i);
  assert.doesNotMatch(front,/\shidden(?:\s|=|>)|style=["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i);
  assert.doesNotMatch(front,/matter-source-blank/);
  const audit=auditEpubPackage({project:p});
  assert.equal(audit.checks.find((c)=>c.id==='audit-amazon-no-hidden-css')?.ok,true);
  assert.equal(audit.amazonHardMode.productionHiddenCss,false);
  assert.equal(audit.amazonHardMode.productionHiddenMarkup,false);
});

test('1.0.30 paperback Cover Brain calculates exact 6x9 cream geometry from final page count', () => {
  const g=coverGeometry({type:'paperback',production:{configured:true,trimId:'6x9',ink:'black',paper:'cream',bleed:false},pageCount:200,cover:{source:'generated'}});
  assert.equal(g.exact,true);
  assert.equal(g.spineWidth,0.5);
  assert.equal(g.width,12.75);
  assert.equal(g.height,9.25);
  assert.equal(g.barcode.width,2);
  assert.equal(g.barcode.height,1.2);
});

test('1.0.30 paperback Cover Brain enforces KDP spine-text eligibility at 80 pages', () => {
  const production={configured:true,trimId:'6x9',ink:'black',paper:'cream',bleed:false};
  const at79=coverBrainChecks({type:'paperback',production,pageCount:79,cover:{source:'generated',spineTitle:'Fault Lines'}});
  const at80=coverBrainChecks({type:'paperback',production,pageCount:80,cover:{source:'generated',spineTitle:'Fault Lines'}});
  assert.equal(at79.checks.find((c)=>c.id==='spine-text').status,'error');
  assert.equal(at80.checks.find((c)=>c.id==='spine-text').status,'pass');
});

test('1.0.30 hardcover Cover Brain requires Amazon-confirmed exact spine geometry before production', () => {
  const production={configured:true,trimId:'6x9',ink:'black',paper:'cream',bleed:false};
  const estimate=coverBrainChecks({type:'hardcover',production,pageCount:300,cover:{source:'generated'}});
  assert.equal(estimate.ready,false);
  assert.equal(estimate.geometry.exact,false);
  const exact=coverBrainChecks({type:'hardcover',production,pageCount:300,cover:{source:'generated',hardcoverSpineWidthIn:0.82,hardcoverGeometryConfirmed:true}});
  assert.equal(exact.geometry.exact,true);
  assert.equal(exact.checks.find((c)=>c.id==='geometry').status,'pass');
});

test('1.0.30 migration initializes Cover Brain and invalidates stale Kindle confirmations without touching manuscript', () => {
  const p=project(29,'1.0.29');
  const before=JSON.stringify(p.manuscript.blocks);
  p.editions.ebook.releaseGate={external:{kindlePreviewerOpened:true,enhancedTypesetting:true,kdpOnlinePreviewApproved:true},visualProof:{token:'old'},freeze:{token:'old'}};
  p.version=29; p.appVersion='1.0.29';
  const migrated=migrateProject(p);
  assert.equal(migrated.version,37);
  assert.equal(migrated.appVersion,'1.0.44');
  assert.equal(migrated.editions.paperback.coverBrain?.version,1);
  assert.equal(migrated.editions.ebook.releaseGate.external.kindlePreviewerOpened,false);
  assert.equal(migrated.editions.ebook.releaseGate.visualProof,null);
  assert.equal(JSON.stringify(migrated.manuscript.blocks),before);
});
