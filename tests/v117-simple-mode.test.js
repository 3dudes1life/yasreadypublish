import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateProject } from '../src/lib/project.js';

test('1.0.17 is a UX-only migration that keeps schema 25 and manuscript blocks byte-identical', () => {
  const legacy = {
    version:25, appVersion:'1.0.16', title:'Book', author:'Author',
    source:{ fileName:'book.docx', fileSize:1, manuscriptHash:'abc' },
    storyLock:{ status:'verified', canonicalVersion:2 },
    manuscript:{ blocks:[{id:'b1',kind:'body',text:'Exact words.',style:{name:'Normal'}}], chapters:[], notes:[], media:[], stats:{} },
    design:{ print:{}, ebook:{} },
    editions:{ paperback:{enabled:false,design:{}}, hardcover:{enabled:false,design:{}}, ebook:{enabled:true,design:{}} },
  };
  const before = JSON.stringify(legacy.manuscript.blocks);
  const next = migrateProject(structuredClone(legacy));
  assert.equal(next.version, 28);
  assert.equal(next.appVersion, '1.0.28');
  assert.equal(JSON.stringify(next.manuscript.blocks),before);
});

test('1.0.17 default UX exposes four simple steps and hides expert systems behind Advanced Tools', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url),'utf8');
  const css = readFileSync(new URL('../src/styles/app.css', import.meta.url),'utf8');
  for (const marker of ['Step 1 · Book','Step 2 · Style','Step 3 · Preview','Step 4 · Export','Advanced Tools','Make the book.','Look at the book, not the settings.','Your Kindle book is ready.','Fix safe issues']) {
    assert.match(main,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
  for (const marker of ['simple-steps','simple-theme-grid','simple-kindle-status','simple-advanced-panel','simple-export-card']) assert.match(css,new RegExp(marker));
  assert.doesNotMatch(main,/id="themeStudio" open/);
});
