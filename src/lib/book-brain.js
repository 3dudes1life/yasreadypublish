import { analyzeMatter } from './structure-model.js';
/**
 * YasReady Book Brain v1
 *
 * Story-Lock-safe manuscript interpretation. Book Brain never edits source
 * wording, runs, order, notes, or media. It only proposes/records semantic
 * structure and edition presentation metadata.
 */

export const BOOK_BRAIN_VERSION = 1;
export const BOOK_BRAIN_AUTO_THRESHOLD = 0.92;
export const BOOK_BRAIN_REVIEW_THRESHOLD = 0.72;

const MATTER_ROLES = new Set(['title','copyright','dedication','source-toc','acknowledgments','front','back']);
const SEMANTIC_ROLES = new Set(['subhead','block-quote','written-note','verse','text-message','scene-break']);

const clean = (value = '') => String(value || '').trim();
const lower = (value = '') => clean(value).toLowerCase();
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const roundedConfidence = (value) => Math.round(clamp01(value) * 100) / 100;

function styleName(block) {
  return lower(block?.style?.name || block?.styleName || '');
}

function isCentered(block) {
  return lower(block?.layout?.alignment) === 'center';
}

function italicRatio(block) {
  const runs = block?.runs || [];
  const total = runs.reduce((sum, run) => sum + String(run?.text || '').length, 0);
  if (!total) return 0;
  const italic = runs.reduce((sum, run) => sum + (run?.italic ? String(run?.text || '').length : 0), 0);
  return italic / total;
}

function boldRatio(block) {
  const runs = block?.runs || [];
  const total = runs.reduce((sum, run) => sum + String(run?.text || '').length, 0);
  if (!total) return 0;
  const bold = runs.reduce((sum, run) => sum + (run?.bold ? String(run?.text || '').length : 0), 0);
  return bold / total;
}

function hardBoundaryBefore(block, previous = null) {
  return Boolean(block?.layout?.pageBreakBefore || previous?.layout?.manualPageBreak);
}

function chapterCandidate(block) {
  const text = clean(block?.text);
  if (!text) return null;
  const style = styleName(block);
  if (/^(copyright|dedication|table of contents|contents|about the author|about the authors|acknowledg(?:e)?ments|preface|foreword|introduction|previously on|join the journey|also by|author(?:’|'|)s? note|stay connected|newsletter|resources)\b/i.test(text)) return null;
  if (block.kind === 'front-back-heading') return null;
  if (block.kind === 'chapter-title') return { confidence:0.995, reason:'Source already identifies this as a chapter start.' };
  if (/^(chapter|part|book)\s+(?:\d+|[ivxlcdm]+|[a-z]+)\b/i.test(text)) return { confidence:0.99, reason:'Chapter/part numbering pattern detected.' };
  if (/^(prologue|epilogue)\b/i.test(text)) return { confidence:0.99, reason:'Prologue/epilogue opening detected.' };
  if (text.length < 180 && /heading\s*1|chapter(?:\s+title|\s+heading)?|book\s+title/i.test(style)) return { confidence:0.95, reason:'Short Heading 1/chapter-style paragraph detected.' };
  if (text.length < 100 && block?.layout?.pageBreakBefore && isCentered(block) && (boldRatio(block) > 0.7 || /heading/i.test(style))) {
    return { confidence:0.82, reason:'Short centered page-opening heading looks like a chapter start.' };
  }
  return null;
}

function semanticCandidate(block, section = 'body') {
  if (!block || section !== 'body') return null;
  const value = clean(block.text);
  if (!value) return null;
  const style = styleName(block);

  if (block.kind === 'text-message' || /^\[[^\]]+\]\s*:/.test(value)) {
    return { role:'text-message', confidence:0.995, reason:'Bracketed sender/message pattern detected.' };
  }
  if (/^\[[^\]]+\]\s+\S/.test(value)) {
    return { role:'text-message', confidence:0.94, reason:'Bracketed sender label detected.' };
  }
  if (/^(?:\*\s*\*\s*\*|#\s*#\s*#|~\s*~\s*~|—\s*—\s*—|•\s*•\s*•|◆|✦|⁂|❦)$/.test(value)) {
    return { role:'scene-break', confidence:0.99, reason:'Standalone scene-break ornament detected.' };
  }
  if (/\b(text message|sms|chat|message bubble|conversation)\b/i.test(style)) {
    return { role:'text-message', confidence:0.97, reason:'Word style identifies a text conversation.' };
  }
  if (/\b(block ?quote|quotation|quote)\b/i.test(style)) return { role:'block-quote', confidence:0.96, reason:'Word quote style detected.' };
  if (/\b(written note|letter|correspondence|epigraph|note text)\b/i.test(style)) return { role:'written-note', confidence:0.96, reason:'Word note/letter style detected.' };
  if (/\b(verse|poetry|poem|stanza)\b/i.test(style)) return { role:'verse', confidence:0.96, reason:'Word poetry/verse style detected.' };
  if (/\b(subhead|subheading|heading\s*[23]|heading two|heading three)\b/i.test(style) && value.length < 220) {
    return { role:'subhead', confidence:0.95, reason:'Short subheading style detected.' };
  }
  if (block.kind === 'heading' && value.length < 180) return { role:'subhead', confidence:0.86, reason:'Short heading inside a chapter detected.' };
  if (/^(dear\s+\S|from:|to:|subject:)/i.test(value) && (italicRatio(block) > 0.45 || Number(block?.layout?.leftTwips || 0) > 180)) {
    return { role:'written-note', confidence:0.82, reason:'Letter/note opening with inset or italic treatment detected.' };
  }
  return null;
}

function legalScore(block) {
  const text = lower(block?.text);
  let score = 0;
  if (/^copyright\b|©|\(c\)/i.test(text)) score += 5;
  if (/all rights reserved/.test(text)) score += 4;
  if (/isbn/.test(text)) score += 3;
  if (/no part of this book|reproduced|permission of the publisher/.test(text)) score += 3;
  if (/work of fiction|resemblance to actual persons/.test(text)) score += 3;
  if (/printed in|first edition|cover design/.test(text)) score += 2;
  return score;
}

function dedicationSignal(block) {
  const text = clean(block?.text);
  if (!text) return 0;
  let score = 0;
  if (/^dedication(?:\s+page)?$/i.test(text)) score += 8;
  if (/^(to\s+(?:all|everyone|those|the|my|our)|for\s+(?:all|everyone|those|the|my|our))\b/i.test(text)) score += 4;
  if (/this one(?:’|'|)s for you/i.test(text)) score += 5;
  if (/love (?:is|doesn|should)|keep choosing|define (?:the )?love|being yourself/i.test(text)) score += 2;
  if (isCentered(block)) score += 2;
  if (italicRatio(block) > 0.6) score += 2;
  if ((block.wordCount || 0) <= 45) score += 1;
  return score;
}

function matterStartInterpretation(block, role, confidence, reason, sourceKind = '') {
  return {
    id:`matter:${block.id}:${role}`,
    category:'matter',
    blockId:block.id,
    suggestion:role,
    label: role === 'source-toc' ? 'Table of Contents' : role[0].toUpperCase() + role.slice(1),
    confidence:roundedConfidence(confidence),
    reason,
    text:clean(block.text).slice(0, 180),
    sourceKind:sourceKind || block.kind || '',
  };
}

function structureInterpretation(block, kind, confidence, reason) {
  return {
    id:`structure:${block.id}:${kind}`,
    category:'structure',
    blockId:block.id,
    suggestion:kind,
    label:kind === 'chapter-title' ? 'Chapter start' : kind,
    confidence:roundedConfidence(confidence),
    reason,
    text:clean(block.text).slice(0, 180),
    sourceKind:block.kind || '',
  };
}

function semanticInterpretation(block, role, confidence, reason) {
  return {
    id:`semantic:${block.id}:${role}`,
    category:'semantic',
    blockId:block.id,
    suggestion:role,
    label:role.replaceAll('-', ' '),
    confidence:roundedConfidence(confidence),
    reason,
    text:clean(block.text).slice(0, 180),
    sourceKind:block.kind || '',
  };
}

function interpretationState(entry, decisions = {}) {
  const decision = decisions?.[entry.id];
  if (decision === 'accepted') return 'accepted';
  if (decision === 'ignored') return 'ignored';
  return entry.confidence >= BOOK_BRAIN_AUTO_THRESHOLD ? 'auto' : entry.confidence >= BOOK_BRAIN_REVIEW_THRESHOLD ? 'review' : 'low';
}

function inferredFirstChapterIndex(blocks, entries) {
  const ids = new Set(entries.filter((entry) => entry.category === 'structure' && entry.suggestion === 'chapter-title' && entry.confidence >= BOOK_BRAIN_REVIEW_THRESHOLD).map((entry) => entry.blockId));
  const hit = blocks.find((block) => ids.has(block.id));
  return hit?.index ?? null;
}

function frontMatterInterpretations(blocks, firstChapterIndex) {
  if (firstChapterIndex == null || firstChapterIndex <= 0) return [];
  const front = blocks.filter((block) => block.index < firstChapterIndex);
  const nonblank = front.filter((block) => clean(block.text) || block.mediaRefs?.length);
  if (!nonblank.length) return [];
  const out = [];

  // The first meaningful front-matter content is the title-page start unless
  // it is clearly legal/copyright content. Position is intentionally strong:
  // poorly styled source files often have no useful Word style at all.
  const first = nonblank[0];
  if (legalScore(first) < 5) out.push(matterStartInterpretation(first, 'title', 0.94, 'First meaningful content before the book body is treated as the title page.'));

  const copyright = nonblank.find((block) => legalScore(block) >= 5);
  if (copyright) out.push(matterStartInterpretation(copyright, 'copyright', Math.min(0.995, 0.9 + legalScore(copyright) * 0.012), 'Copyright/legal language detected.'));

  const toc = nonblank.find((block) => /^(table of contents|contents)\b/i.test(clean(block.text)));
  if (toc) out.push(matterStartInterpretation(toc, 'source-toc', 0.995, 'Table of Contents label detected.'));

  const explicitDedication = nonblank.find((block) => /^dedication(?:\s+page)?\b/i.test(clean(block.text)));
  if (explicitDedication) {
    out.push(matterStartInterpretation(explicitDedication, 'dedication', 0.995, 'Dedication page label detected.'));
  } else {
    const copyrightIndex = copyright?.index ?? -1;
    const tocIndex = toc?.index ?? firstChapterIndex;
    const possible = front.filter((block) => block.index > copyrightIndex && block.index < tocIndex && clean(block.text));
    let best = null;
    for (let i = 0; i < possible.length; i += 1) {
      const block = possible[i];
      const prev = blocks[block.index - 1] || null;
      let score = dedicationSignal(block);
      if (hardBoundaryBefore(block, prev)) score += 4;
      // A run of blank source paragraphs is a weaker page/section signal.
      let blanks = 0;
      for (let j = block.index - 1; j >= Math.max(copyrightIndex + 1, block.index - 4); j -= 1) {
        if (blocks[j]?.kind === 'blank') blanks += 1;
        else break;
      }
      if (blanks >= 2) score += 2;
      if (!best || score > best.score) best = { block, score };
    }
    if (best?.score >= 8) {
      const confidence = best.score >= 12 ? 0.96 : best.score >= 10 ? 0.93 : 0.86;
      out.push(matterStartInterpretation(best.block, 'dedication', confidence, 'Short centered/italic dedication language detected after the legal page.'));
    }
  }
  return out;
}

export function analyzeBookBrain(project) {
  const blocks = project?.manuscript?.blocks || [];
  const previous = project?.bookBrain || {};
  const decisions = previous.reviewDecisions && typeof previous.reviewDecisions === 'object' ? { ...previous.reviewDecisions } : {};
  const interpretations = [];
  const sourceStructure = analyzeMatter(blocks);
  const hasSourceChapters = sourceStructure.firstChapterIndex != null;

  for (const block of blocks) {
    const candidate = chapterCandidate(block);
    if (!candidate) continue;
    const explicitSourceChapter = block.kind === 'chapter-title';
    const explicitTextChapter = /^(chapter|part|book)\s+(?:\d+|[ivxlcdm]+|[a-z]+)\b|^(prologue|epilogue)\b/i.test(clean(block.text));
    const outsideKnownBody = hasSourceChapters && (
      block.index < sourceStructure.firstChapterIndex
      || (sourceStructure.backMatterStartIndex != null && block.index >= sourceStructure.backMatterStartIndex)
    );
    // Once the source already gives us a trustworthy chapter body, Book Brain
    // must not promote a title-page/back-matter Heading 1 into a new chapter.
    // Explicit chapter/prologue/epilogue wording is still respected.
    if (outsideKnownBody && !explicitSourceChapter && !explicitTextChapter) continue;
    interpretations.push(structureInterpretation(block, 'chapter-title', candidate.confidence, candidate.reason));
  }

  const firstChapterIndex = inferredFirstChapterIndex(blocks, interpretations);
  interpretations.push(...frontMatterInterpretations(blocks, firstChapterIndex));

  for (const block of blocks) {
    if (firstChapterIndex == null || block.index < firstChapterIndex) continue;
    if (sourceStructure.backMatterStartIndex != null && block.index >= sourceStructure.backMatterStartIndex) continue;
    const candidate = semanticCandidate(block, 'body');
    if (candidate) interpretations.push(semanticInterpretation(block, candidate.role, candidate.confidence, candidate.reason));
  }

  const unique = new Map();
  for (const entry of interpretations) if (!unique.has(entry.id)) unique.set(entry.id, entry);
  const entries = [...unique.values()].map((entry) => ({ ...entry, state:interpretationState(entry, decisions) }));
  const meaningful = entries.filter((entry) => entry.state !== 'low' && entry.state !== 'ignored');
  const confidence = meaningful.length
    ? Math.round((meaningful.reduce((sum, entry) => sum + entry.confidence, 0) / meaningful.length) * 100)
    : 0;
  const countSuggestion = (category, suggestion) => entries.filter((entry) => entry.category === category && entry.suggestion === suggestion && entry.state !== 'ignored').length;
  const matterRoles = new Set(entries.filter((entry) => entry.category === 'matter' && entry.state !== 'ignored').map((entry) => entry.suggestion));
  const review = entries.filter((entry) => entry.state === 'review');
  const auto = entries.filter((entry) => entry.state === 'auto' || entry.state === 'accepted');

  return {
    version:BOOK_BRAIN_VERSION,
    analyzedAt:new Date().toISOString(),
    sourceKind:'docx',
    confidence,
    status:review.length ? 'review' : 'ready',
    reviewDecisions:decisions,
    interpretations:entries,
    pageStarts:{},
    summary:{
      chapters:countSuggestion('structure','chapter-title'),
      titlePages:matterRoles.has('title') ? 1 : 0,
      copyrightPages:matterRoles.has('copyright') ? 1 : 0,
      dedicationPages:matterRoles.has('dedication') ? 1 : 0,
      tocPages:matterRoles.has('source-toc') ? 1 : 0,
      textMessages:countSuggestion('semantic','text-message'),
      sceneBreaks:countSuggestion('semantic','scene-break'),
      writtenNotes:countSuggestion('semantic','written-note'),
      subheads:countSuggestion('semantic','subhead'),
      autoApplied:auto.length,
      reviewCount:review.length,
    },
  };
}

function applyInterpretation(project, entry) {
  if (!entry || !project) return false;
  if (entry.category === 'structure') {
    const source = project.manuscript?.blocks?.find((block) => block.id === entry.blockId);
    if (!source) return false;
    project.bookBrain = project.bookBrain || {};
    project.bookBrain.inferredKinds = project.bookBrain.inferredKinds || {};
    // Manual Structure Repair always wins. Book Brain lives in its own inferred
    // layer so automatic understanding never masquerades as an author override.
    if (!project.structureOverrides?.[entry.blockId] && source.kind !== entry.suggestion) {
      project.bookBrain.inferredKinds[entry.blockId] = entry.suggestion;
    }
    return true;
  }
  if (entry.category === 'semantic' && SEMANTIC_ROLES.has(entry.suggestion)) {
    project.bookBrain = project.bookBrain || {};
    project.bookBrain.semanticRoles = project.bookBrain.semanticRoles || {};
    const explicit = project.presentationOverrides?.ebook?.[entry.blockId]?.semanticRole;
    if (!explicit || explicit === 'auto') project.bookBrain.semanticRoles[entry.blockId] = entry.suggestion;
    return true;
  }
  if (entry.category === 'matter' && MATTER_ROLES.has(entry.suggestion)) {
    project.bookBrain = project.bookBrain || {};
    project.bookBrain.pageStarts = project.bookBrain.pageStarts || {};
    project.bookBrain.pageStarts[entry.blockId] = { role:entry.suggestion, confidence:entry.confidence, reason:entry.reason };
    return true;
  }
  return false;
}

export function applyBookBrain(project, analysisInput = null) {
  if (!project) return null;
  const analysis = analysisInput || analyzeBookBrain(project);
  const existingDecisions = project.bookBrain?.reviewDecisions || analysis.reviewDecisions || {};
  project.bookBrain = {
    ...analysis,
    reviewDecisions:{ ...existingDecisions },
    pageStarts:{},
    inferredKinds:{},
    semanticRoles:{},
  };
  let applied = 0;
  for (const entry of project.bookBrain.interpretations || []) {
    const decision = project.bookBrain.reviewDecisions?.[entry.id];
    const shouldApply = decision === 'accepted' || (decision !== 'ignored' && entry.confidence >= BOOK_BRAIN_AUTO_THRESHOLD);
    if (shouldApply && applyInterpretation(project, entry)) applied += 1;
  }
  project.bookBrain.summary = { ...(project.bookBrain.summary || {}), autoApplied:applied };
  return project.bookBrain;
}

export function reanalyzeBookBrain(project) {
  if (!project) return null;
  const decisions = { ...(project.bookBrain?.reviewDecisions || {}) };
  const analysis = analyzeBookBrain(project);
  analysis.reviewDecisions = decisions;
  return applyBookBrain(project, analysis);
}

export function bookBrainMatterStart(project, blockId) {
  const raw = project?.bookBrain?.pageStarts?.[blockId];
  if (!raw || !MATTER_ROLES.has(raw.role)) return null;
  return raw;
}

export function bookBrainReviewItems(project) {
  return (project?.bookBrain?.interpretations || []).filter((entry) => {
    const decision = project?.bookBrain?.reviewDecisions?.[entry.id];
    return entry.confidence >= BOOK_BRAIN_REVIEW_THRESHOLD && entry.confidence < BOOK_BRAIN_AUTO_THRESHOLD && !decision;
  });
}

export function decideBookBrainInterpretation(project, interpretationId, decision) {
  if (!project?.bookBrain) throw new Error('Book Brain analysis is not available.');
  if (!['accepted','ignored'].includes(decision)) throw new Error('Unsupported Book Brain review decision.');
  const entry = (project.bookBrain.interpretations || []).find((item) => item.id === interpretationId);
  if (!entry) throw new Error('Unknown Book Brain interpretation.');
  project.bookBrain.reviewDecisions = project.bookBrain.reviewDecisions || {};
  project.bookBrain.reviewDecisions[interpretationId] = decision;
  entry.state = decision;
  if (decision === 'accepted') applyInterpretation(project, entry);
  project.bookBrain.summary.reviewCount = bookBrainReviewItems(project).length;
  project.bookBrain.status = project.bookBrain.summary.reviewCount ? 'review' : 'ready';
  return entry;
}
