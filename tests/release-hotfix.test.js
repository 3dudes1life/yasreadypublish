import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateProject } from '../src/lib/project.js';

test('1.0.4 retains 1.0.1 migration and the old Tres Amigos paragraph gap and Contents parity without touching manuscript text', () => {
  const project = {
    version: 10,
    appVersion: '1.0.0',
    design: { print: { templateId: 'tres-amigos-book1', paragraphGap: 0.333 }, ebook: {} },
    structureOverrides: {},
    manuscript: { blocks: [{ id:'p-1', index:0, kind:'body', text:'Exact story text.', style:{name:'Normal'} }], chapters:[], stats:{}, metadata:{} },
    source: { manuscriptHash: 'unchanged' },
  };
  const before = project.manuscript.blocks[0].text;
  migrateProject(project);
  assert.equal(project.version, 25);
  assert.equal(project.appVersion, '1.0.22');
  assert.equal(project.design.print.paragraphGap, 0.12);
  assert.equal(project.design.print.tocStartSide, 'left');
  assert.equal(project.manuscript.blocks[0].text, before);
});

test('1.0.4 preserves a deliberately customized paragraph gap', () => {
  const project = {
    version: 10,
    appVersion: '1.0.0',
    design: { print: { templateId: 'tres-amigos-book1', paragraphGap: 0.1 }, ebook: {} },
    structureOverrides: {},
    manuscript: { blocks: [], chapters:[], stats:{}, metadata:{} },
    source: {},
  };
  migrateProject(project);
  assert.equal(project.design.print.paragraphGap, 0.1);
  assert.equal(project.design.print.tocStartSide, 'left');
});
