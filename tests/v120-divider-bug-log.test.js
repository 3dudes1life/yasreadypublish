import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateProject } from '../src/lib/project.js';
import { addBug, loadBugLog, setBugStatus, deleteBug } from '../src/lib/bug-log.js';

function project(themeId='tres-amigos-private', divider='flourish') {
  return { version:25, appVersion:'1.0.19', title:'x', source:{manuscriptHash:'x'}, storyLock:{}, manuscript:{blocks:[],chapters:[],notes:[],media:[],stats:{},metadata:{}}, presentationOverrides:{ebook:{},paperback:{},hardcover:{}}, structureOverrides:{}, design:{print:{},ebook:{}}, editions:{ ebook:{enabled:true,design:{themeId,themeStudio:{themeId,chapterDivider:divider,chapterHeadingLayout:'number-title'},chapterTopEm:8,chapterAfterEm:5.5},reviewDecisions:{},releaseGate:{version:1}}, paperback:{enabled:false,design:{}}, hardcover:{enabled:false,design:{}}, activePrint:'paperback' } };
}

test('1.0.20 removes only the legacy Tres Amigos chapter flourish', () => {
  const p=migrateProject(project());
  assert.equal(p.appVersion, '1.0.36');
  assert.equal(p.editions.ebook.design.themeStudio.chapterDivider,'none');
  const other=migrateProject(project('contemporary-romance','flourish'));
  assert.equal(other.editions.ebook.design.themeStudio.chapterDivider,'flourish');
});

test('bug log is local, compact, and supports open/fixed/delete', () => {
  const memory=new Map();
  const storage={getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,v)};
  const bug=addBug({summary:'Star appeared',notes:'chapter opening',version:'1.0.20'},storage);
  assert.equal(loadBugLog(storage).length,1);
  setBugStatus(bug.id,'fixed',storage);
  assert.equal(loadBugLog(storage)[0].status,'fixed');
  deleteBug(bug.id,storage);
  assert.equal(loadBugLog(storage).length,0);
});
