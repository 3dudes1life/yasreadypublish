import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copyPaperbackDesignToHardcover, ensureEditions, getPrintEditionDesign,
  setActivePrintEdition, setEditionEnabled, setPrintEditionDesign,
} from '../src/lib/editions.js';

test('edition manager creates independent paperback, hardcover, and ebook outputs', () => {
  const project = { design:{ print:{ trimWidth:6, trimHeight:9, insideMargin:1.25 }, ebook:{} }, manuscript:{blocks:[{text:'Sacred words.'}]} };
  const before = JSON.stringify(project.manuscript);
  ensureEditions(project);
  assert.equal(project.editions.paperback.enabled, true);
  assert.equal(project.editions.hardcover.enabled, false);
  assert.equal(project.editions.ebook.enabled, true);
  assert.equal(JSON.stringify(project.manuscript), before);
});

test('paperback and hardcover design changes do not share pagination geometry', () => {
  const project = { design:{ print:{ trimWidth:6, trimHeight:9, insideMargin:1.25 }, ebook:{} } };
  ensureEditions(project);
  copyPaperbackDesignToHardcover(project);
  setPrintEditionDesign(project, 'hardcover', { ...getPrintEditionDesign(project,'hardcover'), insideMargin:1.05, trimWidth:5.5 });
  assert.equal(getPrintEditionDesign(project,'paperback').insideMargin, 1.25);
  assert.equal(getPrintEditionDesign(project,'paperback').trimWidth, 6);
  assert.equal(getPrintEditionDesign(project,'hardcover').insideMargin, 1.05);
  assert.equal(getPrintEditionDesign(project,'hardcover').trimWidth, 5.5);
});

test('project may be ebook-only with both print editions disabled', () => {
  const project = { design:{ print:{}, ebook:{} } };
  ensureEditions(project);
  setEditionEnabled(project, 'paperback', false);
  assert.equal(project.editions.paperback.enabled, false);
  assert.equal(project.editions.hardcover.enabled, false);
  assert.equal(project.editions.ebook.enabled, true);
});

test('active print edition can switch to hardcover without changing paperback design', () => {
  const project = { design:{ print:{ insideMargin:1.25 }, ebook:{} } };
  ensureEditions(project);
  copyPaperbackDesignToHardcover(project);
  setActivePrintEdition(project, 'hardcover');
  assert.equal(project.editions.activePrint, 'hardcover');
  assert.equal(getPrintEditionDesign(project,'paperback').insideMargin, 1.25);
});
