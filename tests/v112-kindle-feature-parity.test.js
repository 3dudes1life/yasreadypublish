import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { autoSemanticRole, semanticRoleCounts, semanticRoleForBlock } from '../src/lib/semantic-styles.js';
import { setBlockPresentationOverride } from '../src/lib/presentation-overrides.js';
import { buildEpubPackageData } from '../src/lib/epub-export.js';
import { auditEpubPackage } from '../src/lib/epub-audit.js';
import { runEpubPreflight } from '../src/lib/ebook-preflight.js';
import { scanKindleQuality } from '../src/lib/kindle-quality.js';
import { canonicalizeManuscriptV2 } from '../src/lib/manuscript-rules.js';
import { sha256Hex } from '../src/lib/hash.js';
import { migrateProject, verifyProjectStoryLock } from '../src/lib/project.js';

function block(id, index, kind, text, style='Normal', extra={}) {
  return {
    id, index, kind, text,
    style:{name:style},
    runs: extra.runs || [{text}],
    mediaRefs: extra.mediaRefs || [],
    wordCount:text.trim()?text.trim().split(/\s+/).length:0,
  };
}

function sampleProject() {
  const media = [{
    id:'media-1', relId:'rId9', fileName:'note-photo.png', mimeType:'image/png', fileSize:68,
    sha256:'6a63f0292898d35f5d7e9c5e9f696c2d4513cb584691703d5086f527a1389d43', dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA',
  }];
  const notes = [{
    id:'1', type:'footnote',
    paragraphs:[{text:'This is the locked footnote.', runs:[{text:'This is the locked footnote.'}], wordCount:5}],
    wordCount:5,
  }];
  const blocks = [
    block('title',0,'heading','Tres Amigos, Una Vida','Title'),
    block('byline',1,'body','by D.C.W.'),
    block('chapter',2,'chapter-title','Chapter 1: Home','Heading 1'),
    block('opening',3,'chapter-opening','The story begins here.'),
    block('sub',4,'body','Three Days Later','Subheading'),
    block('quote',5,'body','Love had always asked them to be brave.','Block Quote'),
    block('letter',6,'body','Michael—meet me beneath the palms.','Written Note'),
    block('verse',7,'body','One road\nthree hearts\none life.','Poetry'),
    block('message',8,'text-message','[Juan]: You awake?'),
    block('break',9,'scene-break','* * *'),
    block('note-body',10,'body','The room went quiet.', 'Normal', {runs:[{text:'The room went quiet.'},{text:'',noteRef:{type:'footnote',id:'1'}}]}),
    block('image',11,'body','The photograph from that summer.', 'Normal', {mediaRefs:[{mediaId:'media-1',relId:'rId9',altText:'Three friends standing together beneath palm trees.',name:'note-photo.png'}]}),
  ];
  return migrateProject({
    id:'v112-sample', version:20, appVersion:'1.0.11', title:'Fault Lines', author:'D.C.W.',
    source:{fileName:'book.docx', manuscriptHash:'temporary'}, storyLock:{enabled:true,status:'verified',canonicalAlgorithm:'SHA-256',canonicalVersion:2},
    structureOverrides:{}, presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    manuscript:{
      blocks, chapters:[], notes, media,
      stats:{chapters:1,words:blocks.reduce((n,b)=>n+b.wordCount,0),paragraphs:blocks.length},
      metadata:{imageCount:1,imageReferenceCount:1,imageAltTextCount:1,footnoteCount:1,endnoteCount:0,noteReferenceCount:1,tableCount:0,manualPageBreakCount:0,canonicalVersion:2},
    },
    design:{ebook:{publisher:'3Dudes1Life Creative'}},
    editions:{ebook:{enabled:true,design:{publisher:'3Dudes1Life Creative',visibleToc:true,tocScope:'chapters',frontMatterMode:'clean'},cover:{fileName:'cover.jpg',mimeType:'image/jpeg',fileSize:100,width:1600,height:2560,dataUrl:'data:image/jpeg;base64,/9j/2Q=='}}},
  });
}

function chapterXhtml(project) {
  const data = buildEpubPackageData({project});
  return String(data.files.get('OEBPS/text/chapter-001.xhtml') || '');
}

test('1.0.12 auto-detects fiction semantic roles from source kinds and Word styles', () => {
  const p=sampleProject();
  const byId=new Map(p.manuscript.blocks.map(b=>[b.id,b]));
  assert.equal(autoSemanticRole(byId.get('sub'),'chapter'),'subhead');
  assert.equal(autoSemanticRole(byId.get('quote'),'chapter'),'block-quote');
  assert.equal(autoSemanticRole(byId.get('letter'),'chapter'),'written-note');
  assert.equal(autoSemanticRole(byId.get('verse'),'chapter'),'verse');
  assert.equal(autoSemanticRole(byId.get('message'),'chapter'),'text-message');
  assert.equal(autoSemanticRole(byId.get('break'),'chapter'),'scene-break');
  const counts=semanticRoleCounts(p, [{type:'chapter',blocks:p.manuscript.blocks.slice(2)}]);
  assert.equal(counts.subhead,1);
  assert.equal(counts['block-quote'],1);
  assert.equal(counts['written-note'],1);
  assert.equal(counts.verse,1);
  assert.equal(counts['text-message'],1);
  assert.equal(counts['scene-break'],1);
});

test('1.0.12 explicit semantic overrides change final markup without changing source wording', () => {
  const p=sampleProject();
  const before=JSON.stringify(p.manuscript.blocks);
  setBlockPresentationOverride(p,'ebook','quote',{semanticRole:'written-note'});
  assert.equal(semanticRoleForBlock(p,p.manuscript.blocks.find(b=>b.id==='quote'),'chapter'),'written-note');
  const xhtml=chapterXhtml(p);
  assert.match(xhtml,/<aside id="quote" class="written-note"/);
  assert.match(xhtml,/Love had always asked them to be brave\./);
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});

test('1.0.12 scene-break ornaments are presentation-only and keep locked source marks in XHTML', () => {
  const p=sampleProject();
  p.editions.ebook.design.sceneBreakTreatment='diamond';
  const before=p.manuscript.blocks.find(b=>b.id==='break').text;
  const xhtml=chapterXhtml(p);
  assert.match(xhtml,/class="scene-source-hidden">\* \* \*<\/span>/);
  assert.match(xhtml,/class="scene-ornament" aria-hidden="true">◆<\/span>/);
  assert.equal(p.manuscript.blocks.find(b=>b.id==='break').text,before);
});

test('1.0.12 packages inline manuscript images and audits their manifest/file coverage', () => {
  const p=sampleProject();
  const data=buildEpubPackageData({project:p});
  const opf=String(data.files.get('OEBPS/package.opf'));
  const xhtml=chapterXhtml(p);
  assert.match(opf,/id="manuscript-image-1" href="images\/manuscript-001\.png" media-type="image\/png"/);
  assert.equal(data.files.has('OEBPS/images/manuscript-001.png'),true);
  assert.match(xhtml,/src="\.\.\/images\/manuscript-001\.png"/);
  assert.match(xhtml,/alt="Three friends standing together beneath palm trees\."/);
  const audit=auditEpubPackage({project:p});
  assert.equal(audit.manuscriptMediaOk,true);
  assert.equal(audit.checks.find(x=>x.id==='audit-manuscript-media').ok,true);
});

test('1.0.12 preflight blocks missing inline image assets instead of silently dropping them', () => {
  const p=sampleProject();
  p.manuscript.media=[];
  const report=runEpubPreflight({project:p,storyLockOk:true});
  const images=report.checks.find(x=>x.id==='images');
  assert.equal(images.status,'error');
  assert.equal(report.ready,false);
});

test('1.0.12 renders linked footnotes/endnotes and the finished package resolves note targets', () => {
  const p=sampleProject();
  const xhtml=chapterXhtml(p);
  assert.match(xhtml,/epub:type="noteref"/);
  assert.match(xhtml,/href="#note-footnote-1"/);
  assert.match(xhtml,/epub:type="footnote" class="ebook-note" id="note-footnote-1"/);
  assert.match(xhtml,/This is the locked footnote\./);
  const audit=auditEpubPackage({project:p});
  assert.equal(audit.noteTargetsOk,true);
  assert.equal(audit.checks.find(x=>x.id==='audit-note-targets').ok,true);
});

test('1.0.12 canonical v2 Story Lock covers note wording and embedded-media fingerprints', async () => {
  const p=sampleProject();
  p.source.manuscriptHash=await sha256Hex(canonicalizeManuscriptV2(p.manuscript.blocks,p.manuscript.notes,p.manuscript.media));
  assert.equal((await verifyProjectStoryLock(p)).ok,true);
  p.manuscript.notes[0].paragraphs[0].text='Changed note text';
  assert.equal((await verifyProjectStoryLock(p)).ok,false);
  p.manuscript.notes[0].paragraphs[0].text='This is the locked footnote.';
  assert.equal((await verifyProjectStoryLock(p)).ok,true);
  const originalMediaHash=p.manuscript.media[0].sha256;
  p.manuscript.media[0].sha256='changed-media-sha';
  assert.equal((await verifyProjectStoryLock(p)).ok,false);
  p.manuscript.media[0].sha256=originalMediaHash;
  p.source.manuscriptHash=await sha256Hex(canonicalizeManuscriptV2(p.manuscript.blocks,p.manuscript.notes,p.manuscript.media));
  p.manuscript.media[0].dataUrl='data:image/png;base64,AA==';
  const tampered=await verifyProjectStoryLock(p);
  assert.equal(tampered.ok,false);
  assert.equal(tampered.mediaMismatches.length,1);
});

test('1.0.12 migration preserves legacy Story Lock algorithm/hash and manuscript blocks exactly', () => {
  const blocks=[block('c',0,'chapter-title','Chapter 1: Home','Heading 1'),block('p',1,'chapter-opening','Hello world.')];
  const legacy={
    id:'legacy',version:20,appVersion:'1.0.11',title:'Legacy',author:'D.C.W.',
    source:{fileName:'legacy.docx',manuscriptHash:'legacy-hash'},storyLock:{canonicalVersion:1,status:'verified'},
    structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    manuscript:{blocks,chapters:[],stats:{chapters:1,words:2,paragraphs:2},metadata:{imageCount:0}},
    editions:{ebook:{enabled:true,design:{publisher:'3Dudes1Life Creative'}}},design:{ebook:{}},
  };
  const before=JSON.stringify(legacy.manuscript.blocks);
  const migrated=migrateProject(legacy);
  assert.equal(migrated.version,25);
  assert.equal(migrated.appVersion,'1.0.17');
  assert.equal(migrated.storyLock.canonicalVersion,1);
  assert.equal(migrated.source.manuscriptHash,'legacy-hash');
  assert.equal(JSON.stringify(migrated.manuscript.blocks),before);
  assert.deepEqual(migrated.manuscript.notes,[]);
  assert.deepEqual(migrated.manuscript.media,[]);
});

test('1.0.12 Kindle Pro scan reports semantic style, note, and inline-image coverage', () => {
  const p=sampleProject();
  const scan=scanKindleQuality(p);
  assert.equal(scan.semanticCounts.subhead,1);
  assert.equal(scan.semanticCounts['block-quote'],1);
  assert.equal(scan.noteCount,1);
  assert.equal(scan.mediaCount,1);
  assert.ok(scan.issues.some(x=>x.id==='semantic-styles'));
  assert.ok(scan.issues.some(x=>x.id==='notes-present'));
  assert.ok(scan.issues.some(x=>x.id==='media-present'));
});

test('1.0.12 UI exposes the semantic style palette and Story-Lock-safe Content style inspector', () => {
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');
  assert.match(main,/Semantic Style Palette/);
  assert.match(main,/Content style/);
  assert.match(main,/saveEbookSemanticStyles/);
  assert.match(main,/ebookOverrideSemanticRole/);
  assert.match(main,/Semantic presentation only\. Source wording stays locked\./);
  assert.match(css,/kindle-style-palette/);
  assert.match(css,/semantic-count-grid/);
  assert.match(css,/inspector-semantic-role/);
});

test('1.0.12 repeated references to one note receive unique XHTML reference ids', () => {
  const p=sampleProject();
  const second=block('note-body-2',12,'body','He remembered it again.','Normal',{runs:[{text:'He remembered it again.'},{text:'',noteRef:{type:'footnote',id:'1'}}]});
  p.manuscript.blocks.push(second);
  p.manuscript.stats.paragraphs=p.manuscript.blocks.length;
  p.manuscript.stats.words+=second.wordCount;
  p.manuscript.metadata.noteReferenceCount=2;
  const xhtml=chapterXhtml(p);
  const refIds=[...xhtml.matchAll(/id="(noteref-footnote-1-[^"]+)"/g)].map(m=>m[1]);
  assert.equal(refIds.length,2);
  assert.equal(new Set(refIds).size,2);
  const audit=auditEpubPackage({project:p});
  assert.equal(audit.uniqueXhtmlIdsOk,true);
  assert.equal(audit.localFragmentsOk,true);
});
