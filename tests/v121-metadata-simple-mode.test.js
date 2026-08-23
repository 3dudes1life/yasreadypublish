import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateProject } from '../src/lib/project.js';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('1.0.22 exposes required Kindle metadata in Simple Mode', () => {
  for (const marker of ['id="simpleBookDetails"','id="projectTitle"','id="projectAuthor"','id="projectLanguage"','id="projectPublisher"','Save book details']) {
    assert.ok(main.includes(marker), `missing ${marker}`);
  }
  assert.ok(main.includes("document.querySelector('#simpleBookDetails')?.scrollIntoView") || main.includes("const card = document.querySelector('#simpleBookDetails')"));
});

test('1.0.22 migration preserves manuscript and schema while bumping app version', () => {
  const manuscript = { blocks:[{id:'b1',kind:'paragraph',text:'Exact words stay exact.'}], chapters:[], notes:[], media:[], stats:{}, metadata:{} };
  const p = migrateProject({
    version:25, appVersion:'1.0.20', title:'Book', author:'Author',
    source:{manuscriptHash:'hash'}, storyLock:{status:'verified'}, manuscript,
    presentationOverrides:{ebook:{},paperback:{},hardcover:{}}, structureOverrides:{},
    design:{print:{},ebook:{}},
    editions:{ebook:{enabled:true,design:{language:'en',publisher:'Imprint',themeId:'tres-amigos-private',themeStudio:{themeId:'tres-amigos-private',chapterDivider:'none'}},reviewDecisions:{},releaseGate:{version:1}},paperback:{enabled:false,design:{}},hardcover:{enabled:false,design:{}},activePrint:'paperback'}
  });
  assert.equal(p.appVersion,'1.0.22');
  assert.equal(p.version,25);
  assert.equal(p.manuscript.blocks[0].text,'Exact words stay exact.');
  assert.equal(p.editions.ebook.design.language,'en');
  assert.equal(p.editions.ebook.design.publisher,'Imprint');
});
