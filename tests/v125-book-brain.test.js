import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBookBrain, applyBookBrain, bookBrainReviewItems, decideBookBrainInterpretation } from '../src/lib/book-brain.js';
import { buildEbookSections } from '../src/lib/ebook-model.js';
import { migrateProject } from '../src/lib/project.js';

const run = (text, italic=false, bold=false) => [{ text, italic, bold }];
const block = (id,index,text,kind='body',extra={}) => ({
  id,index,text,kind,wordCount:text.trim() ? text.trim().split(/\s+/).length : 0,
  runs:extra.runs || run(text, Boolean(extra.italic), Boolean(extra.bold)),
  style:extra.style || { name:'' },
  layout:{ alignment:extra.alignment || '', pageBreakBefore:Boolean(extra.pageBreakBefore), manualPageBreak:Boolean(extra.manualPageBreak), ...(extra.layout || {}) },
  mediaRefs:[],
});

function messyProject() {
  const blocks = [
    block('p1',0,'TRES AMIGOS, UNA VIDA','body',{alignment:'center'}),
    block('p2',1,'A Throuple Love Story','body',{alignment:'center'}),
    block('p3',2,'D.C.W.','body',{alignment:'center'}),
    block('p4',3,'','blank'),
    block('p5',4,'Copyright © 2026 3Dudes1Life Creative','body',{pageBreakBefore:true,alignment:'center'}),
    block('p6',5,'All rights reserved.','body',{alignment:'center'}),
    block('p7',6,'ISBN: 979-8-0000000-0-0','body',{alignment:'center'}),
    block('p8',7,'','blank'),
    block('p9',8,'To everyone who was ever told their love was too different.','body',{pageBreakBefore:true,alignment:'center',italic:true}),
    block('p10',9,"This one's for you.",'body',{alignment:'center',italic:true}),
    block('p11',10,'','blank'),
    block('p12',11,'Table of Contents','body',{pageBreakBefore:true,alignment:'center'}),
    block('p13',12,'Chapter 1: Home','body',{pageBreakBefore:true,alignment:'center'}),
    block('p14',13,'The key turned with a soft click.','body'),
    block('p15',14,'[Juan]: We made it.','body'),
    block('p16',15,'* * *','body',{alignment:'center'}),
    block('p17',16,'A Small Heading','heading'),
    block('p18',17,'Then the story continued.','body'),
  ];
  return {
    id:'brain-test', version:25, appVersion:'1.0.24', title:'Messy Book', author:'D.C.W.',
    source:{ manuscriptHash:'hash' }, storyLock:{ canonicalVersion:1 },
    manuscript:{ blocks, chapters:[], notes:[], media:[], stats:{}, metadata:{} },
    structureOverrides:{}, presentationOverrides:{ ebook:{}, paperback:{}, hardcover:{} },
    design:{ print:{}, ebook:{} },
    editions:{ paperback:{enabled:false}, hardcover:{enabled:false}, ebook:{enabled:true}, activePrint:'paperback' },
  };
}

test('1.0.25 Book Brain understands a poorly styled DOCX without changing source text', () => {
  const project = messyProject();
  const before = JSON.stringify(project.manuscript.blocks);
  const brain = applyBookBrain(project);
  assert.equal(JSON.stringify(project.manuscript.blocks), before);
  assert.equal(brain.summary.chapters, 1);
  assert.equal(project.structureOverrides.p13, undefined);
  assert.equal(project.bookBrain.inferredKinds.p13, 'chapter-title');
  assert.equal(project.bookBrain.pageStarts.p1.role, 'title');
  assert.equal(project.bookBrain.pageStarts.p5.role, 'copyright');
  assert.equal(project.bookBrain.pageStarts.p9.role, 'dedication');
  assert.equal(project.bookBrain.pageStarts.p12.role, 'source-toc');
  assert.equal(project.presentationOverrides.ebook.p15, undefined);
  assert.equal(project.bookBrain.semanticRoles.p15, 'text-message');
  assert.equal(project.bookBrain.semanticRoles.p16, 'scene-break');
  assert.ok(project.bookBrain.confidence >= 90);
});

test('1.0.25 Book Brain page roles split unlabeled front matter into semantic ebook sections', () => {
  const project = messyProject();
  applyBookBrain(project);
  const sections = buildEbookSections(project).sections;
  const roles = sections.filter((section) => section.type === 'front').map((section) => section.role);
  assert.deepEqual(roles.slice(0,4), ['title','copyright','dedication','source-toc']);
  assert.equal(sections.find((section) => section.role === 'dedication').blocks[0].id, 'p9');
  assert.equal(sections.find((section) => section.type === 'chapter').blocks[0].id, 'p13');
});

test('1.0.25 Book Brain refuses to auto-apply an ambiguous in-chapter heading', () => {
  const project = messyProject();
  applyBookBrain(project);
  const reviews = bookBrainReviewItems(project);
  const subhead = reviews.find((item) => item.blockId === 'p17' && item.suggestion === 'subhead');
  assert.ok(subhead);
  assert.equal(project.bookBrain.semanticRoles.p17, undefined);
  decideBookBrainInterpretation(project, subhead.id, 'accepted');
  assert.equal(project.bookBrain.semanticRoles.p17, 'subhead');
  assert.equal(bookBrainReviewItems(project).some((item) => item.id === subhead.id), false);
});

test('1.0.25 migration adds Book Brain while preserving manuscript source and edition choices', () => {
  const project = messyProject();
  project.editions.ebook.enabled = true;
  const before = JSON.stringify(project.manuscript.blocks);
  const migrated = migrateProject(project);
  assert.equal(migrated.version, 37);
  assert.equal(migrated.appVersion, '1.0.41');
  assert.equal(migrated.editions.ebook.enabled, true);
  assert.equal(JSON.stringify(migrated.manuscript.blocks), before);
  assert.equal(migrated.bookBrain.version, 2);
  assert.ok(migrated.bookBrain.summary.chapters >= 1);
});

test('Book Brain analysis itself is non-mutating until apply is requested', () => {
  const project = messyProject();
  const before = JSON.stringify(project);
  const report = analyzeBookBrain(project);
  assert.ok(report.interpretations.length > 0);
  assert.equal(JSON.stringify(project), before);
});
