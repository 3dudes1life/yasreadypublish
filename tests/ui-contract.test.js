import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

const requiredBindings = [
  'chooseFile','saveMetadata','verifyLock','runFinalCheck','backupProject','restoreBackupButton',
  'saveDesign','applyTresTemplate','buildPreview','buildPreviewForExport','createPaperbackPdf',
  'openPrintMaster','downloadPrintMaster','downloadPreflightReport','saveEbookSettings','downloadEpub',
  'downloadEpubPreflight','prevEbookSection','nextEbookSection','jumpPageBtn','prevSpread','nextSpread',
  'prevChapter','nextChapter','libraryImport'
];

test('1.0 primary buttons are wired to interaction handlers', () => {
  for (const id of requiredBindings) {
    assert.match(main, new RegExp(`id=["']${id}["']`), `missing UI control #${id}`);
    assert.match(main, new RegExp(`querySelector\\(['"]#${id}['"]\\)`), `missing handler for #${id}`);
  }
});

test('1.0 sidebar views all route through renderMain', () => {
  for (const view of ['import','chapters','matter','repair','navigator','design','print','export','ebook','source','library']) {
    assert.match(main, new RegExp(`activeView === ['"]${view}['"]|navButton\\(['"]${view}['"]`), `missing view ${view}`);
  }
});


test('sidebar is re-rendered after project-state changes so controls do not stay stale or disabled', () => {
  assert.match(main, /sidebar\.outerHTML = renderSidebar\(\)/);
  assert.match(main, /bindEvents\(\)/);
});
