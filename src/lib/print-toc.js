import { analyzeMatter } from './structure-model.js';
import { effectiveBlocks } from './structure-overrides.js';

const SOURCE_TOC_RE = /^(table of contents|contents)$/i;

export function detectSourcePrintToc(project) {
  const blocks = effectiveBlocks(project);
  const structure = analyzeMatter(blocks);
  const beforeChapter = structure.firstChapterIndex == null ? blocks : blocks.filter((block) => block.index < structure.firstChapterIndex);
  const heading = beforeChapter.find((block) => SOURCE_TOC_RE.test(String(block.text || '').trim()));
  return {
    detected: Boolean(heading),
    blockId: heading?.id || null,
    blockIndex: heading?.index ?? null,
    title: heading?.text?.trim() || null,
  };
}

export function shouldGeneratePrintToc(project, design = {}) {
  if (design.printToc === false) return { generate: false, reason: 'disabled', sourceToc: detectSourcePrintToc(project) };
  const sourceToc = detectSourcePrintToc(project);
  if (sourceToc.detected) return { generate: false, reason: 'source-toc-detected', sourceToc };
  return { generate: true, reason: 'generated', sourceToc };
}

export function chapterPageMap(pages = [], blocks = []) {
  const entries = [];
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const seen = new Set();
  for (const page of pages) {
    if (!page?.hasChapterTitle) continue;
    const fragment = (page.fragments || []).find((item) => item.kind === 'chapter-title');
    if (!fragment?.text || seen.has(fragment.sourceBlockId)) continue;
    seen.add(fragment.sourceBlockId);
    entries.push({
      id: fragment.sourceBlockId,
      title: (byId.get(fragment.sourceBlockId)?.text || fragment.text).trim(),
      bookPageNumber: page.bookPageNumber,
      physicalPage: page.number,
      type: 'chapter',
    });
  }
  return entries;
}

export function backMatterPageMap(project, pages = []) {
  const blocks = effectiveBlocks(project);
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const structure = analyzeMatter(blocks);
  if (structure.backMatterStartIndex == null) return [];
  const headingIds = new Set((structure.backMatterHeadings || []).map((block) => block.id));
  const entries = [];
  const seen = new Set();
  for (const page of pages) {
    for (const fragment of page.fragments || []) {
      if (!headingIds.has(fragment.sourceBlockId) || seen.has(fragment.sourceBlockId)) continue;
      seen.add(fragment.sourceBlockId);
      entries.push({
        id: fragment.sourceBlockId,
        title: (byId.get(fragment.sourceBlockId)?.text || fragment.text).trim(),
        bookPageNumber: page.bookPageNumber,
        physicalPage: page.number,
        type: 'back',
      });
    }
  }
  return entries;
}

export function buildPrintTocEntries({ project, pages = [], design = {} } = {}) {
  const blocks = effectiveBlocks(project);
  const chapters = chapterPageMap(pages, blocks);
  const back = design.tocIncludeBackMatter === false ? [] : backMatterPageMap(project, pages);
  return [...chapters, ...back].filter((entry) => entry.bookPageNumber != null);
}

export function printTocSignature(entries = []) {
  return entries.map((entry) => `${entry.id}:${entry.bookPageNumber}`).join('|');
}

export function verifyGeneratedPrintToc({ project, preview, design = {} } = {}) {
  const generated = preview?.generatedToc;
  const mode = shouldGeneratePrintToc(project, design);
  if (!mode.generate) {
    return {
      ok: true,
      skipped: true,
      reason: mode.reason,
      entries: 0,
      mismatches: [],
      sourceToc: mode.sourceToc,
    };
  }
  if (!generated?.enabled) {
    return { ok: false, skipped: false, reason: 'missing-generated-toc', entries: 0, mismatches: [], sourceToc: mode.sourceToc };
  }
  const expected = buildPrintTocEntries({ project, pages: preview.pages, design });
  const actualById = new Map((generated.entries || []).map((entry) => [entry.id, entry]));
  const mismatches = [];
  for (const entry of expected) {
    const actual = actualById.get(entry.id);
    if (!actual || actual.bookPageNumber !== entry.bookPageNumber || actual.title !== entry.title) {
      mismatches.push({ id: entry.id, expected: entry, actual: actual || null });
    }
  }
  if ((generated.entries || []).length !== expected.length) mismatches.push({ type: 'count', expected: expected.length, actual: generated.entries?.length || 0 });
  return {
    ok: mismatches.length === 0,
    skipped: false,
    reason: mismatches.length ? 'mismatch' : 'verified',
    entries: expected.length,
    mismatches,
    sourceToc: mode.sourceToc,
  };
}
