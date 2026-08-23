import { getEbookCover } from './editions.js';

function tokenFor(item = {}) {
  return JSON.stringify([
    item.id || '',
    item.severity || '',
    item.label || '',
    item.message || '',
    item.blockId || '',
    item.sectionId || '',
    item.fingerprint || '',
  ]);
}

export function ensureKindleReviewState(project) {
  if (!project) return {};
  project.editions = project.editions || {};
  project.editions.ebook = project.editions.ebook || {};
  const current = project.editions.ebook.reviewDecisions;
  if (!current || typeof current !== 'object' || Array.isArray(current)) project.editions.ebook.reviewDecisions = {};
  return project.editions.ebook.reviewDecisions;
}

export function kindleReviewDecision(project, item) {
  if (!item?.id) return null;
  const decisions = ensureKindleReviewState(project);
  const record = decisions[item.id];
  if (!record || record.token !== tokenFor(item)) return null;
  return record;
}

export function markKindleReviewIntentional(project, item) {
  if (!project || !item?.id || !['warning', 'review'].includes(item.severity)) return null;
  const decisions = ensureKindleReviewState(project);
  const record = {
    status: 'intentional',
    token: tokenFor(item),
    reviewedAt: new Date().toISOString(),
  };
  decisions[item.id] = record;
  return record;
}

export function clearKindleReviewDecision(project, itemId) {
  const decisions = ensureKindleReviewState(project);
  if (!itemId || !decisions[itemId]) return false;
  delete decisions[itemId];
  return true;
}

function issueRecord(source, item, acknowledged = false) {
  return {
    source,
    id: item.id,
    severity: item.severity || 'info',
    label: item.label || 'Review item',
    message: item.message || '',
    blockId: item.blockId || null,
    sectionId: item.sectionId || null,
    fix: item.fix || null,
    fingerprint: item.fingerprint || '',
    acknowledged,
  };
}

function dedupeQueue(items) {
  const byKey = new Map();
  const rank = { error: 0, warning: 1, review: 1, info: 2 };
  for (const item of items) {
    const key = [item.blockId || '', item.sectionId || '', item.label].join('|');
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, item);
      continue;
    }
    // Never let an acknowledged duplicate hide an unresolved finding. If both
    // are active, prefer the stricter severity and then the item with a safe fix.
    const currentRank = rank[current.severity] ?? 2;
    const nextRank = rank[item.severity] ?? 2;
    const replace = (current.acknowledged && !item.acknowledged)
      || (current.acknowledged === item.acknowledged && nextRank < currentRank)
      || (current.acknowledged === item.acknowledged && nextRank === currentRank && !current.fix && item.fix);
    if (replace) byKey.set(key, item);
  }
  return [...byKey.values()];
}

export function buildKindlePolishQueue(project, quality, intelligence) {
  const queue = [];
  for (const item of quality?.issues || []) {
    if (item.severity === 'info') continue;
    queue.push(issueRecord('quality', item, Boolean(kindleReviewDecision(project, item))));
  }
  for (const item of intelligence?.anomalies || []) {
    if (item.severity === 'info') continue;
    queue.push(issueRecord('intelligence', item, Boolean(kindleReviewDecision(project, item))));
  }
  return dedupeQueue(queue).sort((a, b) => {
    const rank = { error: 0, warning: 1, review: 1, info: 2 };
    return (rank[a.severity] ?? 2) - (rank[b.severity] ?? 2);
  });
}

function reportCheck(report, id) {
  return report?.checks?.find((item) => item.id === id) || null;
}

export function buildKindleProductionFlow({ project, report, quality, intelligence }) {
  const design = project?.editions?.ebook?.design || project?.design?.ebook || {};
  const metadataReady = Boolean(project?.title?.trim() && project?.author?.trim() && design.language?.trim());
  const coverReady = reportCheck(report, 'cover')?.status === 'pass' && Boolean(getEbookCover(project));
  const navReady = ['chapters', 'visible-toc', 'logical-toc'].every((id) => reportCheck(report, id)?.status === 'pass');
  const lockReady = ['story-lock', 'source-coverage'].every((id) => reportCheck(report, id)?.status === 'pass');
  const setup = [
    { id: 'metadata', label: 'Metadata', ready: metadataReady, action: 'metadata', detail: metadataReady ? 'Title, author, language' : 'Finish title, author, and language' },
    { id: 'cover', label: 'Cover', ready: coverReady, action: 'cover', detail: coverReady ? 'Internal cover attached once' : 'Attach the Kindle cover' },
    { id: 'navigation', label: 'Navigation', ready: navReady, action: 'preflight', detail: navReady ? 'Contents + Go To navigation' : 'Repair Kindle navigation' },
    { id: 'story-lock', label: 'Story Lock', ready: lockReady, action: 'verify-lock', detail: lockReady ? 'Source coverage verified' : 'Verify Story Lock and coverage' },
  ];

  const queue = buildKindlePolishQueue(project, quality, intelligence);
  const unresolved = queue.filter((item) => !item.acknowledged);
  const blockers = unresolved.filter((item) => item.severity === 'error');
  const reviews = unresolved.filter((item) => item.severity !== 'error');
  const acknowledged = queue.filter((item) => item.acknowledged);
  const setupMissing = setup.filter((item) => !item.ready);
  const hardReady = Boolean(report?.ready && quality?.ready && intelligence?.ready && setupMissing.length === 0);
  const ready = hardReady && blockers.length === 0;

  let nextAction;
  if (setupMissing.length) {
    const item = setupMissing[0];
    nextAction = { type: item.action, label: `Finish ${item.label}`, detail: item.detail };
  } else if (blockers.length) {
    nextAction = { type: 'issue', issue: blockers[0], label: 'Fix next blocker', detail: blockers[0].label };
  } else if (reviews.length) {
    nextAction = { type: 'issue', issue: reviews[0], label: 'Review next item', detail: reviews[0].label };
  } else if (ready) {
    nextAction = { type: 'preview', label: 'Final visual proof', detail: 'Run the torture test, then export the exact EPUB.' };
  } else {
    nextAction = { type: 'preflight', label: 'Open preflight', detail: 'Review the remaining technical gate.' };
  }

  const setupScore = setup.filter((item) => item.ready).length * 10;
  const qualityScore = Math.round((quality?.score || 0) * 0.45);
  const intelligencePenalty = Math.min(15, blockers.length * 10 + reviews.length * 2);
  const score = Math.max(0, Math.min(100, setupScore + qualityScore + 15 - intelligencePenalty));

  return {
    ready,
    hardReady,
    score,
    setup,
    queue,
    unresolved,
    blockers,
    reviews,
    acknowledged,
    nextAction,
    stats: {
      setupReady: setup.filter((item) => item.ready).length,
      setupTotal: setup.length,
      blockers: blockers.length,
      reviews: reviews.length,
      acknowledged: acknowledged.length,
      localFixes: quality?.overrideCount || 0,
    },
  };
}
