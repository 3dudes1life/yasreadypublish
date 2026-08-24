import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditEpubPackage } from '../src/lib/epub-audit.js';
import { buildEbookSections, detectEbookPlaceholders } from '../src/lib/ebook-model.js';
import { buildEpubPackageData } from '../src/lib/epub-export.js';
import { runEpubPreflight } from '../src/lib/ebook-preflight.js';
import { kindlePreviewTokens, normalizeKindlePreview } from '../src/lib/kindle-preview-model.js';
import { migrateProject } from '../src/lib/project.js';

function b(index, kind, text, style='Normal') {
  return { id:`p-${index+1}`, index, kind, text, style:{name:style}, runs:[{text}], wordCount:text.trim()?text.trim().split(/\s+/).length:0 };
}

function sample({ placeholder=false }={}) {
  const blocks = [
    b(0,'heading','Tres Amigos, Una Vida','Title'),
    b(1,'body','A Throuple Love Story'),
    b(2,'body','by D.C.W.'),
    b(3,'front-back-heading','Copyright © 2026 3Dudes1Life Creative','Heading 1'),
    b(4,'blank',''),
    b(5,'body','All rights reserved.'),
    b(6,'body','No part of this book may be reproduced, distributed,'),
    b(7,'body','or transmitted in any form or by any means, including'),
    b(8,'body','photocopying, recording, or other electronic or mechanical'),
    b(9,'body','methods, without the prior written permission of the publisher,'),
    b(10,'body','except in the case of brief quotations embodied in critical'),
    b(11,'body','reviews and certain other noncommercial uses permitted by'),
    b(12,'heading','copyright law.','Heading 2'),
    b(13,'front-back-heading','Dedication Page','Heading 1'),
    b(14,'body','For all the throuples out there.'),
    ...(placeholder ? [b(15,'body','CHAPTERS PAGE')] : []),
    b(placeholder ? 16 : 15,'chapter-title','Chapter 1: Home','Heading 1'),
    b(placeholder ? 17 : 16,'chapter-opening','The story begins here.'),
    b(placeholder ? 18 : 17,'body','Second paragraph.'),
    b(placeholder ? 19 : 18,'chapter-title','Chapter 2: Morning','Heading 1'),
    b(placeholder ? 20 : 19,'chapter-opening','Another beginning.'),
  ];
  return migrateProject({
    id:'v110-test', version:19, appVersion:'1.0.9', title:'Fault Lines', author:'D.C.W.',
    source:{fileName:'book.docx', manuscriptHash:'abc'}, storyLock:{status:'verified'}, structureOverrides:{},
    manuscript:{blocks, chapters:[], stats:{chapters:2, words:blocks.reduce((n,x)=>n+x.wordCount,0), paragraphs:blocks.length}, metadata:{imageCount:0, tableCount:0, manualPageBreakCount:0}},
    design:{ebook:{publisher:'3Dudes1Life Creative'}},
    editions:{ebook:{enabled:true, design:{publisher:'3Dudes1Life Creative', visibleToc:true, tocScope:'chapters', frontMatterMode:'clean'}, cover:{fileName:'cover.jpg',mimeType:'image/jpeg',fileSize:1000,width:1600,height:2560,dataUrl:'data:image/jpeg;base64,/9j/2Q=='}}},
  });
}

test('1.0.10 keeps copyright law continuation inside the copyright section instead of creating a fake section', () => {
  const p = sample();
  const sections = buildEbookSections(p).sections;
  const fronts = sections.filter((s)=>s.type==='front');
  assert.equal(fronts.length,3);
  const copyright = fronts.find((s)=>s.role==='copyright');
  assert.ok(copyright);
  assert.equal(copyright.blocks.at(-1).text,'copyright law.');
  assert.equal(fronts.some((s)=>s.title.toLowerCase()==='copyright law.'),false);
});

test('1.0.10 reflows print line-wraps into clean copyright paragraphs while preserving source block IDs', () => {
  const p = sample();
  const data = buildEpubPackageData({project:p});
  const xhtml = data.files.get('OEBPS/text/front-002.xhtml');
  assert.match(xhtml,/No part of this book may be reproduced, distributed,[\s\S]*copyright law\./);
  assert.match(xhtml,/id="p-7"/);
  assert.match(xhtml,/id="p-13"/);
  assert.doesNotMatch(xhtml,/<h2[^>]*>copyright law\.<\/h2>/i);
});

test('1.0.10 production EPUB contains no Preview Studio CSS/classes/hooks', () => {
  const p = sample();
  const data = buildEpubPackageData({project:p});
  const production = [...data.files.entries()].filter(([path])=>/\.(?:xhtml|css|opf|ncx)$/.test(path)).map(([,value])=>String(value)).join('\n');
  assert.doesNotMatch(production,/yrp-inspectable|yrp-selected|yrp-cover-preview|data-yrp-block-id|yrp-live-cover/);
  assert.equal(auditEpubPackage({project:p}).checks.find((x)=>x.id==='audit-preview-leak').ok,true);
});

test('1.0.10 finished-package audit passes a clean Kindle sample', () => {
  const p = sample();
  const audit = auditEpubPackage({project:p});
  assert.equal(audit.ok,true);
  assert.equal(audit.chapterFiles,2);
  assert.equal(audit.chapterNavLinks,2);
  assert.equal(audit.coverItems,1);
});

test('1.0.10 flags source placeholders and blocks KDP EPUB instead of silently deleting words', () => {
  const p = sample({placeholder:true});
  const before = JSON.stringify(p.manuscript.blocks);
  const placeholders = detectEbookPlaceholders(p);
  assert.deepEqual(placeholders.map((x)=>x.text),['CHAPTERS PAGE']);
  const report = runEpubPreflight({project:p,storyLockOk:true});
  assert.equal(report.ready,false);
  assert.equal(report.checks.find((x)=>x.id==='placeholders').status,'error');
  assert.equal(JSON.stringify(p.manuscript.blocks),before);
});

test('1.0.10 Kindle simulator defaults to color and enables grayscale only when e-ink is explicitly requested', () => {
  const normal = normalizeKindlePreview({device:'ereader'});
  assert.equal(normal.simulateEink,false);
  assert.equal(kindlePreviewTokens(normal).grayscale,false);
  assert.equal(kindlePreviewTokens({...normal,simulateEink:true}).grayscale,true);
});

test('1.0.10 migration reaches current schema while preserving manuscript blocks exactly', () => {
  const raw = sample();
  raw.version = 19;
  raw.appVersion = '1.0.9';
  const before = JSON.stringify(raw.manuscript.blocks);
  migrateProject(raw);
  assert.equal(raw.version, 28);
  assert.equal(raw.appVersion, '1.0.28');
  assert.equal(JSON.stringify(raw.manuscript.blocks),before);
});

test('1.0.10 Preview Studio uses the fixed three-pane workbench with adjacent inspector, live controls, and undo/redo', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url),'utf8');
  const css = readFileSync(new URL('../src/styles/app.css', import.meta.url),'utf8');
  assert.match(main,/preview-studio-grid-v110/);
  assert.match(main,/ebookInspectorSlot/);
  assert.match(main,/undoEbookFormatting/);
  assert.match(main,/redoEbookFormatting/);
  assert.match(main,/ebook-live-control/);
  assert.match(main,/data-kindle-pref-key/);
  assert.match(css,/grid-template-columns:150px minmax\(350px,1fr\) 230px/);
  assert.match(css,/position:sticky/);
  assert.doesNotMatch(main,/class="kindle-device-top"/);
});
