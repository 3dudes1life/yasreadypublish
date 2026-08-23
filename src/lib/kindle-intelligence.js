import { buildEbookSections } from './ebook-model.js';
import { ensurePresentationOverrides, getBlockPresentationOverride, clearBlockPresentationOverride, setBlockPresentationOverride } from './presentation-overrides.js';
import { semanticRoleForBlock } from './semantic-styles.js';

const BODYISH = new Set(['body', 'chapter-opening', 'text-message', 'heading']);

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function styleName(block) {
  return String(block?.style?.name || 'Normal').trim() || 'Normal';
}

function sortedObject(input = {}) {
  return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)));
}

function dominantEntry(counts = {}) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || [null, 0];
}

function signature(value = {}) {
  return JSON.stringify(sortedObject(value));
}

function overrideShape(value = null) {
  if (!value) return {};
  const out = {};
  if (value.spaceBefore != null) out.spaceBefore = num(value.spaceBefore);
  if (value.spaceAfter != null) out.spaceAfter = num(value.spaceAfter);
  if (value.firstLineIndent != null) out.firstLineIndent = num(value.firstLineIndent);
  if (value.alignment) out.alignment = value.alignment;
  if (value.suppressIndent != null) out.suppressIndent = Boolean(value.suppressIndent);
  if (value.semanticRole) out.semanticRole = value.semanticRole;
  return out;
}

function chapterBlocks(section = {}) {
  return (section.blocks || []).filter((block) => block.kind !== 'blank');
}

function chapterProfile(project, section, index) {
  ensurePresentationOverrides(project);
  const blocks = chapterBlocks(section);
  const sourceStyles = {};
  const semanticRoles = {};
  const overrideKinds = {};
  const overrideIds = [];
  const bodyBlocks = [];
  let chapterTitle = null;
  let openingCount = 0;
  let sceneBreaks = 0;

  for (const block of blocks) {
    if (block.kind === 'chapter-title') chapterTitle = chapterTitle || block;
    if (block.kind === 'chapter-opening') openingCount += 1;
    if (block.kind === 'scene-break') sceneBreaks += 1;
    if (BODYISH.has(block.kind)) bodyBlocks.push(block);
    const style = styleName(block);
    sourceStyles[style] = (sourceStyles[style] || 0) + 1;
    if (block.kind !== 'chapter-title') {
      const role = semanticRoleForBlock(project, block, 'chapter');
      semanticRoles[role] = (semanticRoles[role] || 0) + 1;
    }
    const override = getBlockPresentationOverride(project, 'ebook', block.id);
    if (override) {
      overrideIds.push(block.id);
      overrideKinds[block.kind] = (overrideKinds[block.kind] || 0) + 1;
    }
  }

  const [dominantStyle, dominantStyleCount] = dominantEntry(sourceStyles);
  const titleOverride = chapterTitle ? overrideShape(getBlockPresentationOverride(project, 'ebook', chapterTitle.id)) : {};
  const openingBlock = blocks.find((block) => block.kind !== 'chapter-title');
  const openingOverride = openingBlock ? overrideShape(getBlockPresentationOverride(project, 'ebook', openingBlock.id)) : {};

  return {
    chapterIndex: index,
    sectionId: section.id,
    title: section.title,
    href: section.href,
    wordCount: section.wordCount || 0,
    paragraphCount: bodyBlocks.length,
    sourceBlockCount: blocks.length,
    chapterTitleCount: blocks.filter((block) => block.kind === 'chapter-title').length,
    openingCount,
    openingKind: openingBlock?.kind || null,
    sceneBreaks,
    dominantStyle,
    dominantStyleCount,
    sourceStyles: sortedObject(sourceStyles),
    semanticRoles: sortedObject(semanticRoles),
    overrideCount: overrideIds.length,
    overrideIds,
    overrideKinds: sortedObject(overrideKinds),
    titleBlockId: chapterTitle?.id || null,
    titleOverride,
    titleOverrideSignature: signature(titleOverride),
    openingBlockId: openingBlock?.id || null,
    openingOverride,
    openingOverrideSignature: signature(openingOverride),
  };
}

function anomaly({ id, chapterIndex = null, sectionId = null, blockId = null, severity = 'review', label, message, fix = null, fingerprint = null }) {
  return { id, chapterIndex, sectionId, blockId, severity, label, message, fix, fingerprint };
}

function scoreChapter(profile, anomalies) {
  const mine = anomalies.filter((item) => item.chapterIndex === profile.chapterIndex);
  let score = 100;
  for (const item of mine) score -= item.severity === 'error' ? 28 : item.severity === 'review' ? 11 : 3;
  return Math.max(0, score);
}

function chapterPresentationAnomalies(project, profiles) {
  const anomalies = [];
  const titleSignatureCounts = {};
  const openingSignatureCounts = {};
  for (const profile of profiles) {
    titleSignatureCounts[profile.titleOverrideSignature] = (titleSignatureCounts[profile.titleOverrideSignature] || 0) + 1;
    openingSignatureCounts[profile.openingOverrideSignature] = (openingSignatureCounts[profile.openingOverrideSignature] || 0) + 1;
  }
  const [dominantTitleSig, dominantTitleCount] = dominantEntry(titleSignatureCounts);
  const [dominantOpeningSig, dominantOpeningCount] = dominantEntry(openingSignatureCounts);
  const chapterCount = profiles.length;

  for (const profile of profiles) {
    if (profile.chapterTitleCount !== 1) {
      anomalies.push(anomaly({
        id: `chapter-title-count-${profile.sectionId}`,
        chapterIndex: profile.chapterIndex,
        sectionId: profile.sectionId,
        blockId: profile.titleBlockId,
        severity: 'error',
        label: 'Chapter title structure differs',
        message: `${profile.title} has ${profile.chapterTitleCount} chapter-title blocks; the rest of the book expects one.`,
      }));
    }
    if (profile.openingCount !== 1) {
      anomalies.push(anomaly({
        id: `chapter-opening-count-${profile.sectionId}`,
        chapterIndex: profile.chapterIndex,
        sectionId: profile.sectionId,
        blockId: profile.openingBlockId,
        severity: 'review',
        label: 'Chapter opening treatment differs',
        message: `${profile.title} has ${profile.openingCount} chapter-opening blocks. Confirm the first story paragraph is classified consistently.`,
      }));
    }

    if (chapterCount >= 3 && profile.titleOverrideSignature !== dominantTitleSig && titleSignatureCounts[profile.titleOverrideSignature] <= 2 && dominantTitleCount >= Math.ceil(chapterCount * 0.6)) {
      anomalies.push(anomaly({
        id: `title-override-outlier-${profile.sectionId}`,
        chapterIndex: profile.chapterIndex,
        sectionId: profile.sectionId,
        blockId: profile.titleBlockId,
        severity: 'review',
        label: 'Chapter heading formatting outlier',
        message: `${profile.title} uses a local chapter-heading presentation that differs from the dominant book pattern.`,
        fix: profile.titleBlockId ? { type: 'reset-layout-override', blockId: profile.titleBlockId, label: 'Match book heading' } : null,
        fingerprint: profile.titleOverrideSignature,
      }));
    }

    if (chapterCount >= 3 && profile.openingOverrideSignature !== dominantOpeningSig && openingSignatureCounts[profile.openingOverrideSignature] <= 2 && dominantOpeningCount >= Math.ceil(chapterCount * 0.6)) {
      anomalies.push(anomaly({
        id: `opening-override-outlier-${profile.sectionId}`,
        chapterIndex: profile.chapterIndex,
        sectionId: profile.sectionId,
        blockId: profile.openingBlockId,
        severity: 'review',
        label: 'Opening paragraph formatting outlier',
        message: `${profile.title}'s opening paragraph has a local presentation override that differs from the dominant chapter-opening pattern.`,
        fix: profile.openingBlockId ? { type: 'reset-layout-override', blockId: profile.openingBlockId, label: 'Match book opening' } : null,
        fingerprint: profile.openingOverrideSignature,
      }));
    }
  }
  return anomalies;
}

function localOverrideAnomalies(project, profiles) {
  const anomalies = [];
  const byId = new Map((project?.manuscript?.blocks || []).map((block) => [block.id, block]));
  const chapterByBlock = new Map();
  for (const profile of profiles) for (const id of profile.overrideIds) chapterByBlock.set(id, profile);
  const overrides = project?.presentationOverrides?.ebook || {};

  for (const [blockId, value] of Object.entries(overrides)) {
    const block = byId.get(blockId);
    const profile = chapterByBlock.get(blockId) || profiles.find((candidate) => candidate.titleBlockId === blockId || candidate.openingBlockId === blockId) || null;
    if (!block) {
      anomalies.push(anomaly({
        id: `orphan-${blockId}`,
        severity: 'review',
        blockId,
        label: 'Orphan Kindle formatting fix',
        message: `A Kindle presentation override points to missing source block ${blockId}. It can be removed without changing manuscript text.`,
        fix: { type: 'clear-orphan-override', blockId, label: 'Remove orphan fix' },
      }));
      continue;
    }

    const before = num(value.spaceBefore, 0);
    const after = num(value.spaceAfter, 0);
    const indent = num(value.firstLineIndent, 0);
    const bodyish = BODYISH.has(block.kind) && semanticRoleForBlock(project, block, 'chapter') === 'body';
    const unusualAlignment = bodyish && ['center', 'right'].includes(String(value.alignment || ''));
    const unusualSuppress = block.kind === 'body' && value.suppressIndent === true;
    const extreme = before > 2.5 || after > 2.5 || indent > 2.5;

    if (extreme || unusualAlignment || unusualSuppress) {
      const reasons = [];
      if (extreme) reasons.push('large spacing/indent values');
      if (unusualAlignment) reasons.push(`${value.alignment} alignment on body prose`);
      if (unusualSuppress) reasons.push('suppressed first-line indent on ordinary body prose');
      anomalies.push(anomaly({
        id: `local-override-${blockId}`,
        chapterIndex: profile?.chapterIndex ?? null,
        sectionId: profile?.sectionId ?? null,
        blockId,
        severity: 'review',
        label: 'Local formatting looks unusual',
        message: `${profile?.title ? `${profile.title}: ` : ''}${reasons.join('; ')}. Check this block in Preview Studio.`,
        fix: { type: 'reset-layout-override', blockId, label: 'Reset unusual layout' },
      }));
    }
  }
  return anomalies;
}

function sourceStyleAnomalies(project, profiles) {
  const anomalies = [];
  const styleLocations = new Map();
  for (const profile of profiles) {
    const section = buildEbookSections(project).sections.find((candidate) => candidate.id === profile.sectionId);
    for (const block of section?.blocks || []) {
      if (!BODYISH.has(block.kind)) continue;
      const name = styleName(block);
      if (!styleLocations.has(name)) styleLocations.set(name, []);
      styleLocations.get(name).push({ block, profile });
    }
  }
  const totalBody = [...styleLocations.values()].reduce((sum, list) => sum + list.length, 0);
  const rareCap = Math.max(1, Math.floor(totalBody * 0.0015));
  for (const [name, locations] of styleLocations) {
    if (locations.length > rareCap || /^(normal|body text|body|no spacing|default paragraph font)$/i.test(name)) continue;
    const first = locations[0];
    anomalies.push(anomaly({
      id: `rare-source-style-${name}`,
      chapterIndex: first.profile.chapterIndex,
      sectionId: first.profile.sectionId,
      blockId: first.block.id,
      severity: 'info',
      label: 'Rare source style fingerprint',
      message: `Word style “${name}” appears ${locations.length} time${locations.length === 1 ? '' : 's'} in chapter prose. YasReady normalizes ebook presentation, but this is useful for source QA.`,
      fingerprint: name,
    }));
  }
  return anomalies;
}

export function scanKindleIntelligence(project) {
  if (!project) return { chapters: [], anomalies: [], map: [], summary: { errors: 0, review: 0, info: 0, autoFixable: 0 }, clean: false };
  ensurePresentationOverrides(project);
  const chapters = buildEbookSections(project).sections.filter((section) => section.type === 'chapter');
  const profiles = chapters.map((section, index) => chapterProfile(project, section, index));
  const anomalies = [
    ...chapterPresentationAnomalies(project, profiles),
    ...localOverrideAnomalies(project, profiles),
    ...sourceStyleAnomalies(project, profiles),
  ];
  const map = profiles.map((profile) => {
    const score = scoreChapter(profile, anomalies);
    const issues = anomalies.filter((item) => item.chapterIndex === profile.chapterIndex);
    return {
      chapterIndex: profile.chapterIndex,
      sectionId: profile.sectionId,
      title: profile.title,
      score,
      status: issues.some((item) => item.severity === 'error') ? 'error' : issues.some((item) => item.severity === 'review') ? 'review' : issues.length ? 'info' : 'clean',
      issueCount: issues.length,
      autoFixable: issues.filter((item) => item.fix).length,
      overrideCount: profile.overrideCount,
    };
  });
  const summary = {
    errors: anomalies.filter((item) => item.severity === 'error').length,
    review: anomalies.filter((item) => item.severity === 'review').length,
    info: anomalies.filter((item) => item.severity === 'info').length,
    autoFixable: anomalies.filter((item) => item.fix).length,
  };
  return {
    chapters: profiles,
    anomalies,
    map,
    summary,
    ready: summary.errors === 0,
    clean: summary.errors === 0 && summary.review === 0,
  };
}

function compareObjectKeys(left = {}, right = {}) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.filter((key) => JSON.stringify(left[key] ?? null) !== JSON.stringify(right[key] ?? null));
}

export function compareKindleChapters(project, leftIndex = 0, rightIndex = 1) {
  const scan = scanKindleIntelligence(project);
  const left = scan.chapters[Math.max(0, Math.min(scan.chapters.length - 1, Number(leftIndex) || 0))] || null;
  const right = scan.chapters[Math.max(0, Math.min(scan.chapters.length - 1, Number(rightIndex) || 0))] || null;
  if (!left || !right) return { left, right, match: 0, differences: [] };

  const differences = [];
  const add = (key, label, a, b, weight = 1, note = '') => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    differences.push({ key, label, left: a, right: b, weight, note });
  };
  add('title-presentation', 'Chapter heading presentation', left.titleOverride, right.titleOverride, 3, 'Local heading overrides should usually match unless intentionally different.');
  add('opening-presentation', 'Opening paragraph presentation', left.openingOverride, right.openingOverride, 3, 'Opening treatment should usually be consistent.');
  add('opening-kind', 'Opening block classification', left.openingKind, right.openingKind, 2, 'Both chapters normally begin with the same opening paragraph classification.');
  add('dominant-style', 'Dominant source Word style', left.dominantStyle, right.dominantStyle, 1, 'Source style differences do not automatically change ebook appearance.');
  const semanticDiff = compareObjectKeys(left.semanticRoles, right.semanticRoles);
  if (semanticDiff.length) differences.push({ key: 'semantic-usage', label: 'Semantic content used', left: semanticDiff.map((key) => `${key}:${left.semanticRoles[key] || 0}`).join(', '), right: semanticDiff.map((key) => `${key}:${right.semanticRoles[key] || 0}`).join(', '), weight: 0, note: 'Content may legitimately use different semantic styles; this is informational.' });
  add('override-count', 'Local Kindle override count', left.overrideCount, right.overrideCount, 1, 'A large difference may indicate one chapter received more manual tweaking.');

  const weighted = differences.reduce((sum, item) => sum + item.weight, 0);
  const maxWeight = 10;
  const match = Math.max(0, Math.round(100 - (weighted / maxWeight) * 100));
  return { left, right, match, differences };
}

export function applyKindleIntelligenceFix(project, fix) {
  ensurePresentationOverrides(project);
  if (!fix || !fix.blockId) throw new Error('A safe presentation fix requires a block id.');
  if (fix.type === 'reset-layout-override') {
    const current = getBlockPresentationOverride(project, 'ebook', fix.blockId) || {};
    const preserved = {};
    if (current.semanticRole) preserved.semanticRole = current.semanticRole;
    setBlockPresentationOverride(project, 'ebook', fix.blockId, preserved);
    return { ok: true, changed: 'presentation-only', blockId: fix.blockId, preservedSemanticRole: Boolean(preserved.semanticRole) };
  }
  if (fix.type === 'clear-orphan-override') {
    clearBlockPresentationOverride(project, 'ebook', fix.blockId);
    return { ok: true, changed: 'presentation-only', blockId: fix.blockId };
  }
  throw new Error('Unsupported Kindle intelligence fix.');
}
