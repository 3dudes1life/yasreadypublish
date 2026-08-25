import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBookBrain } from '../src/lib/book-brain.js';
import { buildEbookSections } from '../src/lib/ebook-model.js';
import { buildEpubPackageData } from '../src/lib/epub-export.js';
import { auditEpubPackage } from '../src/lib/epub-audit.js';
import { effectiveStats } from '../src/lib/structure-overrides.js';
import { migrateProject } from '../src/lib/project.js';

const words = (text='') => text.trim() ? text.trim().split(/\s+/).length : 0;
function block(id,index,text,kind='body',style='Normal',extra={}) {
  return {
    id,index,text,kind,style:{name:style},wordCount:words(text),
    runs: extra.runs || (text ? [{text, italic:Boolean(extra.italic), bold:Boolean(extra.bold)}] : []),
    layout:{alignment:extra.alignment || 'left',pageBreakBefore:Boolean(extra.pageBreakBefore),manualPageBreak:Boolean(extra.manualPageBreak)},
    mediaRefs:[],numbering:null,
  };
}

function project(version=31, appVersion='1.0.31') {
  const blocks = [
    block('c1',0,'Chapter 1: Home','chapter-title','Heading 1'),
    block('b1',1,'The story begins here.','chapter-opening'),
    block('book-two',2,'BOOK TWO','heading','Heading 1',{alignment:'center',pageBreakBefore:true}),
    block('bio-tag',3,'explores something they know especially well:','body','Normal',{alignment:'center',italic:true}),
    block('bio-lead',4,'Finding love is only the beginning.'),
    block('bio-body',5,"When they’re not writing, Daniel, Caleb, and Will can usually be found working on one of far too many creative projects, planning their next adventure, spending time at home with their animals, or dreaming about the future they’re still building together."),
    block('bio-social',6,'Follow their world: @3dudes1life'),
    block('bio-site',7,'Visit: www.3dudes1life.com'),
    block('journey-head',8,'Join the Journey!','front-back-heading','Heading 1',{alignment:'center',pageBreakBefore:true}),
    block('journey-sub',9,'You made Book Two happen.','body','Normal',{alignment:'center',bold:true}),
    block('journey-1',10,'When Tres Amigos, Una Vida first entered the world, readers found them, rooted for them, and asked what came next.'),
    block('journey-2',11,'Recommend the books to someone who needs this story.'),
    block('journey-social',12,'Tag us on social media: @tresamigosunavida'),
    block('journey-hash',13,'Use hashtag: #TresAmigosUnaVida'),
    block('journey-site',14,'Visit: www.tresamigosunavida.com'),
  ];
  return {
    id:'v132-backmatter',version,appVersion,title:'Tres Amigos, Una Vida - A Throuple Love Story - Fault Lines',author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'locked'},storyLock:{status:'verified',canonicalVersion:1},
    manuscript:{blocks,chapters:[{blockId:'c1'}],notes:[],media:[],stats:{chapters:1,words:blocks.reduce((s,b)=>s+b.wordCount,0),paragraphs:blocks.length},metadata:{tableCount:0,hyperlinkCount:0}},
    structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    design:{print:{},ebook:{}},
    editions:{
      ebook:{enabled:true,design:{themeId:'tres-amigos-private',themeStudio:{themeId:'tres-amigos-private'},language:'en',publisher:'3Dudes1Life Creative',visibleToc:true,frontMatterMode:'clean'},cover:null},
      paperback:{enabled:false,design:{}},hardcover:{enabled:false,design:{}},activePrint:'paperback',
    },
  };
}

test('1.0.32 Book Brain recognizes author-bio back matter and does not turn BOOK TWO into a phantom chapter', () => {
  const p=project();
  applyBookBrain(p);
  assert.equal(effectiveStats(p).chapters,1);
  assert.equal(p.bookBrain.inferredKinds['book-two'],undefined);
  assert.equal(p.bookBrain.summary.aboutAuthorsPages,1);
  assert.equal(p.bookBrain.summary.journeyPages,1);
});

test('1.0.32 ebook sections split About the Authors and Join the Journey even when the author heading was lost', () => {
  const p=project();
  applyBookBrain(p);
  const {sections}=buildEbookSections(p);
  const about=sections.find((s)=>s.role==='about-authors');
  const journey=sections.find((s)=>s.role==='join-journey');
  assert.ok(about,'About the Authors section should be inferred');
  assert.ok(journey,'Join the Journey section should be recognized');
  assert.equal(about.title,'About the Authors');
  assert.equal(journey.title,'Join the Journey');
  assert.equal(about.blocks[0].id,'book-two');
  assert.equal(journey.blocks[0].id,'journey-head');
});

test('1.0.32 EPUB renders designed back matter with separate source paragraphs and no hidden-content traps', () => {
  const p=project();
  applyBookBrain(p);
  const data=buildEpubPackageData({project:p});
  const aboutSection=data.sections.find((s)=>s.role==='about-authors');
  const journeySection=data.sections.find((s)=>s.role==='join-journey');
  assert.ok(aboutSection && journeySection);
  const about=String(data.files.get(`OEBPS/${aboutSection.href}`)||'');
  const journey=String(data.files.get(`OEBPS/${journeySection.href}`)||'');
  const css=String(data.files.get('OEBPS/styles.css')||'');
  assert.match(about,/data-yrp-generated="about-authors"[^>]*>About the Authors<\/h1>/);
  assert.match(about,/>BOOK TWO<\/p>/);
  assert.match(about,/>Finding love is only the beginning\.<\/p>/);
  assert.match(about,/When they’re not writing, Daniel, Caleb, and Will/);
  assert.equal((about.match(/matter-back-paragraph/g)||[]).length >= 5,true);
  assert.match(journey,/>Join the Journey!<\/h1>/);
  assert.match(journey,/You made Book Two happen\./);
  assert.match(journey,/Recommend the books to someone who needs this story\.<\/p>/);
  for (const output of [css,about,journey]) {
    assert.doesNotMatch(output,/display\s*:\s*none|visibility\s*:\s*hidden|\shidden(?:\s|=|>)/i);
  }
  const audit=auditEpubPackage({project:p});
  assert.equal(audit.checks.find((c)=>c.id==='audit-amazon-no-hidden-css')?.ok,true);
});

test('1.0.32 migration repairs stale Chapter 56 inference without changing Story Lock manuscript text', () => {
  const p=project(31,'1.0.31');
  p.bookBrain={version:1,reviewDecisions:{},inferredKinds:{'book-two':'chapter-title'},semanticRoles:{},pageStarts:{},interpretations:[],summary:{chapters:2}};
  p.editions.ebook.releaseGate={version:2,visualProof:{token:'old'},freeze:{token:'old'},external:{kindlePreviewerOpened:true,enhancedTypesetting:true,kdpOnlinePreviewApproved:false}};
  const before=JSON.stringify(p.manuscript.blocks);
  const migrated=migrateProject(p);
  assert.equal(migrated.version,37);
  assert.equal(migrated.appVersion,'1.0.41');
  assert.equal(JSON.stringify(migrated.manuscript.blocks),before);
  assert.equal(migrated.bookBrain.inferredKinds['book-two'],undefined);
  assert.equal(effectiveStats(migrated).chapters,1);
  assert.equal(migrated.bookBrain.summary.aboutAuthorsPages,1);
  assert.equal(migrated.bookBrain.summary.journeyPages,1);
  assert.equal(migrated.editions.ebook.releaseGate.external.kindlePreviewerOpened,false);
});

test('1.0.32 recognizes Join the Journey followed by About the Authors in either back-matter order', () => {
  const p=project();
  const lead=p.manuscript.blocks.slice(0,2);
  const about=p.manuscript.blocks.slice(2,8);
  const journey=p.manuscript.blocks.slice(8);
  p.manuscript.blocks=[...lead,...journey,...about].map((b,index)=>({...b,index}));
  p.manuscript.stats.paragraphs=p.manuscript.blocks.length;
  applyBookBrain(p);
  const {sections}=buildEbookSections(p);
  const roles=sections.filter((s)=>s.type==='back').map((s)=>s.role);
  assert.ok(roles.includes('join-journey'));
  assert.ok(roles.includes('about-authors'));
  assert.equal(effectiveStats(p).chapters,1);
  assert.equal(p.bookBrain.summary.aboutAuthorsPages,1);
  assert.equal(p.bookBrain.summary.journeyPages,1);
});
