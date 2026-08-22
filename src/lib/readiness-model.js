import { runKdpPreflight } from './preflight-model.js';
import { runEpubPreflight } from './ebook-preflight.js';
import { effectiveStats } from './structure-overrides.js';
import { editionLabel, ensureEditions } from './editions.js';

export function buildPublishReadiness({ project, preview = null, storyLockOk = true } = {}) {
  if (project) ensureEditions(project);
  const stats = effectiveStats(project);
  const hasProject = Boolean(project?.manuscript?.blocks?.length);
  const hasChapters = Number(stats.chapters || 0) > 0;
  const printEnabled = Boolean(project?.editions?.paperback?.enabled || project?.editions?.hardcover?.enabled);
  const ebookEnabled = Boolean(project?.editions?.ebook?.enabled);
  const activePrint = project?.editions?.activePrint || 'paperback';
  const enabledCount = ['paperback','hardcover','ebook'].filter((type) => project?.editions?.[type]?.enabled).length;
  const printReport = printEnabled && preview ? runKdpPreflight({ project, preview, storyLockOk, editionType: activePrint }) : null;
  const ebookReport = ebookEnabled && hasProject ? runEpubPreflight({ project, storyLockOk }) : null;
  const sourceMeta = project?.manuscript?.metadata || {};
  const unsupported = Number(sourceMeta.imageCount || 0) + Number(sourceMeta.footnoteCount || 0) + Number(sourceMeta.endnoteCount || 0);

  const steps = [
    { id: 'manuscript', label: 'Manuscript', view: 'import', status: hasProject && storyLockOk ? 'complete' : hasProject ? 'blocked' : 'todo', detail: hasProject ? `${stats.words || 0} locked words` : 'Import DOCX' },
    { id: 'structure', label: 'Structure', view: 'chapters', status: hasChapters ? 'complete' : hasProject ? 'blocked' : 'todo', detail: hasChapters ? `${stats.chapters} chapters detected` : 'Chapter review required' },
    { id: 'editions', label: 'Editions', view: 'editions', status: enabledCount ? 'complete' : 'blocked', detail: enabledCount ? `${enabledCount} output${enabledCount === 1 ? '' : 's'} enabled` : 'Choose an output' },
  ];

  if (printEnabled) {
    steps.push(
      { id: 'design', label: editionLabel(activePrint), view: 'design', status: hasProject ? 'complete' : 'todo', detail: project?.editions?.[activePrint]?.design?.name || 'Choose a theme' },
      { id: 'proof', label: 'Proof', view: 'print', status: preview?.pages?.length ? 'complete' : hasChapters ? 'todo' : 'blocked', detail: preview?.pages?.length ? `${preview.pages.length} ${activePrint} pages` : `Build ${activePrint} proof` },
      { id: 'print', label: 'Print', view: 'export', status: printReport?.ready ? 'complete' : preview ? 'blocked' : 'todo', detail: printReport?.ready ? `${editionLabel(activePrint)} preflight passed` : preview ? `${printReport?.summary?.errors || 0} blocking issue(s)` : 'Run after proof' },
    );
  }
  if (ebookEnabled) {
    steps.push({ id: 'ebook', label: 'Ebook', view: 'ebook', status: ebookReport?.ready ? 'complete' : hasProject ? 'blocked' : 'todo', detail: ebookReport?.ready ? 'EPUB preflight passed' : `${ebookReport?.summary?.errors || 0} blocking issue(s)` });
  }

  return {
    steps,
    storyLockOk,
    hasProject,
    hasChapters,
    unsupported,
    printReport,
    ebookReport,
    paperbackReady: Boolean(project?.editions?.paperback?.enabled && printReport?.ready && activePrint === 'paperback'),
    ebookReady: Boolean(!ebookEnabled || ebookReport?.ready),
    allReady: Boolean(storyLockOk && enabledCount > 0 && (!printEnabled || printReport?.ready) && (!ebookEnabled || ebookReport?.ready)),
  };
}
