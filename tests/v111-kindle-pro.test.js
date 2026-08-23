import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateProject } from '../src/lib/project.js';
import { kindlePreviewTokens, normalizeKindlePreview } from '../src/lib/kindle-preview-model.js';
import { enhancedTypesettingAudit, kindleTorturePresets, scanKindleQuality } from '../src/lib/kindle-quality.js';
import { setBlockPresentationOverride } from '../src/lib/presentation-overrides.js';
import { auditEpubPackage } from '../src/lib/epub-audit.js';
import { buildEpubPackageData } from '../src/lib/epub-export.js';

function block(id,index,kind,text,style='Normal') {
  return { id,index,kind,text,style:{name:style},runs:[{text}],wordCount:text.trim()?text.trim().split(/\s+/).length:0 };
}

function project({ placeholder=false }={}) {
  const blocks=[
    block('t0',0,'heading','Tres Amigos, Una Vida','Title'),
    block('t1',1,'body','A Throuple Love Story'),
    block('t2',2,'body','by D.C.W.'),
    block('cr',3,'front-back-heading','Copyright © 2026 3Dudes1Life Creative','Heading 1'),
    block('cr2',4,'body','All rights reserved.'),
    ...(placeholder?[block('junk',5,'body','CHAPTERS PAGE')]:[]),
    block('c1',placeholder?6:5,'chapter-title','Chapter 1: Home','Heading 1'),
    block('p1',placeholder?7:6,'chapter-opening','First paragraph.'),
    block('p2',placeholder?8:7,'body','Second paragraph.'),
    block('c2',placeholder?9:8,'chapter-title','Chapter 2: Morning','Heading 1'),
    block('p3',placeholder?10:9,'chapter-opening','Another beginning.'),
    block('p4',placeholder?11:10,'body','Another paragraph.'),
  ];
  return migrateProject({
    id:'v111',version:20,appVersion:'1.0.10',title:'Tres Amigos, Una Vida: A Throuple Love Story — Fault Lines',author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'abc'},storyLock:{status:'verified'},structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    manuscript:{blocks,chapters:[],stats:{chapters:2,words:blocks.reduce((n,b)=>n+b.wordCount,0),paragraphs:blocks.length},metadata:{imageCount:0,tableCount:0,manualPageBreakCount:0}},
    design:{ebook:{publisher:'3Dudes1Life Creative'}},
    editions:{ebook:{enabled:true,design:{publisher:'3Dudes1Life Creative',visibleToc:true,tocScope:'chapters',frontMatterMode:'clean'},cover:{fileName:'cover.jpg',mimeType:'image/jpeg',fileSize:100,width:1600,height:2560,dataUrl:'data:image/jpeg;base64,/9j/2Q=='}}},
  });
}

test('1.0.11 preview calibrates Normal to an 11pt reference without forcing production EPUB body size', () => {
  const prefs=normalizeKindlePreview({fontScale:'m',referencePt:11});
  const tokens=kindlePreviewTokens(prefs);
  assert.equal(tokens.referencePt,11);
  assert.ok(Math.abs(tokens.referencePx - 14.6666667) < 0.01);
  const p=project();
  const css=String(buildEpubPackageData({project:p}).files.get('OEBPS/styles.css'));
  const body=css.match(/body\s*\{([^}]*)\}/i)?.[1] || '';
  assert.doesNotMatch(body,/font-size\s*:\s*[^;]*(?:px|pt)/i);
});

test('1.0.11 torture test ships small phone, normal Kindle, and large tablet views', () => {
  const presets=kindleTorturePresets(11);
  assert.deepEqual(presets.map(x=>x.id),['small-phone','normal-kindle','large-tablet']);
  assert.equal(presets[0].prefs.fontScale,'s');
  assert.equal(presets[1].prefs.fontScale,'m');
  assert.equal(presets[2].prefs.fontScale,'xl');
  assert.equal(presets.every(x=>x.prefs.referencePt===11),true);
});

test('1.0.11 whole-book Kindle Pro scan passes clean structure and finished package', () => {
  const p=project();
  const scan=scanKindleQuality(p);
  assert.equal(scan.summary.errors,0);
  assert.equal(scan.chapters,2);
  assert.equal(scan.tocChapters,2);
  assert.equal(scan.enhanced.errors,0);
  assert.equal(scan.packageAudit.ok,true);
  assert.ok(scan.score>=90);
});

test('1.0.11 quality scan catches placeholders and extreme local overrides without touching source text', () => {
  const p=project({placeholder:true});
  const before=JSON.stringify(p.manuscript.blocks);
  setBlockPresentationOverride(p,'ebook','p2',{spaceAfter:4.5});
  const scan=scanKindleQuality(p);
  assert.ok(scan.summary.errors>=1);
  assert.ok(scan.summary.warnings>=1);
  assert.ok(scan.issues.some(x=>x.id==='placeholders'));
  assert.ok(scan.issues.some(x=>x.id==='extreme-override-p2'));
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});

test('1.0.11 Enhanced Typesetting audit verifies flexible body CSS and reflowable package metadata', () => {
  const audit=enhancedTypesettingAudit(project());
  assert.equal(audit.errors,0);
  assert.equal(audit.checks.find(x=>x.id==='reader-font-size').ok,true);
  assert.equal(audit.checks.find(x=>x.id==='reflowable-layout').ok,true);
  assert.equal(audit.checks.find(x=>x.id==='no-fixed-position').ok,true);
});

test('1.0.11 finished EPUB autopsy verifies Story Lock metadata, nav targets, and spine targets', () => {
  const audit=auditEpubPackage({project:project()});
  assert.equal(audit.storyLockMetaOk,true);
  assert.equal(audit.navTargetsOk,true);
  assert.equal(audit.spineTargetsOk,true);
  assert.equal(audit.checks.find(x=>x.id==='audit-story-lock-meta').ok,true);
});

test('1.0.11 UI exposes Kindle Pro scan, calibrated 11pt reference, and 3-view torture test', () => {
  const main=readFileSync(new URL('../src/main.js', import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/styles/app.css', import.meta.url),'utf8');
  assert.match(main,/Kindle Pro consistency scan/);
  assert.match(main,/3-View Torture Test/);
  assert.match(main,/11 pt reference/);
  assert.match(main,/toggleKindleQaMatrix/);
  assert.match(main,/data-quality-section/);
  assert.match(css,/kindle-quality-card/);
  assert.match(css,/kindle-qa-matrix/);
});

test('1.0.11 migration advances safely while preserving manuscript blocks exactly', () => {
  const p=project();
  p.appVersion='1.0.10';
  const before=JSON.stringify(p.manuscript.blocks);
  const migrated=migrateProject(p);
  assert.equal(migrated.version,25);
  assert.equal(migrated.appVersion,'1.0.18');
  assert.equal(JSON.stringify(migrated.manuscript.blocks),before);
});
