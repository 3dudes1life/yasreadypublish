import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeProjectBackup, parseProjectBackup } from '../src/lib/project-backup.js';
import { sha256Hex } from '../src/lib/hash.js';

async function projectFixture() {
  const blocks = [{ id:'p-1', index:0, kind:'chapter-title', text:'Chapter 1: Home', runs:[], style:{name:'Heading 1'}, wordCount:3 }, { id:'p-2', index:1, kind:'body', text:'Every exact word stays here.', runs:[], style:{name:'Normal'}, wordCount:5 }];
  const canonical = blocks.map(b => b.text).join('\u2029');
  return {
    id:'original', version:10, appVersion:'1.0.0', title:'Book', author:'Author', createdAt:'2026-01-01T00:00:00Z', updatedAt:'2026-01-01T00:00:00Z',
    source:{ fileName:'book.docx', fileSize:100, manuscriptHash:await sha256Hex(canonical), sourceFileHash:'abc' },
    storyLock:{enabled:true,status:'verified'}, structureOverrides:{},
    manuscript:{ blocks, chapters:[{number:1,title:'Chapter 1: Home',startIndex:0,paragraphCount:1,wordCount:5}], stats:{chapters:1,words:8,paragraphs:2}, metadata:{} },
    design:{print:{},ebook:{}}
  };
}

test('project backup round-trip preserves exact manuscript text and verifies Story Lock', async () => {
  const original = await projectFixture();
  const restored = await parseProjectBackup(serializeProjectBackup(original));
  assert.notEqual(restored.id, original.id);
  assert.deepEqual(restored.manuscript.blocks.map(b => b.text), original.manuscript.blocks.map(b => b.text));
  assert.equal(restored.source.manuscriptHash, original.source.manuscriptHash);
  assert.equal(restored.storyLock.status, 'verified');
});

test('tampered backup is blocked by Story Lock', async () => {
  const original = await projectFixture();
  const payload = JSON.parse(serializeProjectBackup(original));
  payload.project.manuscript.blocks[1].text = 'Changed text';
  await assert.rejects(() => parseProjectBackup(JSON.stringify(payload)), /Story Lock failed/);
});
