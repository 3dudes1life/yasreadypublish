import { runKdpPreflight } from './preflight-model.js';
import { runEpubPreflight } from './ebook-preflight.js';
import { effectiveStats } from './structure-overrides.js';

export function buildPublishReadiness({ project, preview = null, storyLockOk = true } = {}) {
  const stats = effectiveStats(project);
  const hasProject = Boolean(project?.manuscript?.blocks?.length);
  const hasChapters = Number(stats.chapters || 0) > 0;
  const printReport = preview ? runKdpPreflight({ project, preview, storyLockOk }) : null;
  const ebookReport = hasProject ? runEpubPreflight({ project, storyLockOk }) : null;
  const sourceMeta = project?.manuscript?.metadata || {};
  const unsupported = Number(sourceMeta.imageCount || 0) + Number(sourceMeta.footnoteCount || 0) + Number(sourceMeta.endnoteCount || 0);

  const steps = [
    { id: 'manuscript', label: 'Manuscript', view: 'import', status: hasProject && storyLockOk ? 'complete' : hasProject ? 'blocked' : 'todo', detail: hasProject ? `${stats.words || 0} locked words` : 'Import DOCX' },
    { id: 'structure', label: 'Structure', view: 'chapters', status: hasChapters ? 'complete' : hasProject ? 'blocked' : 'todo', detail: hasChapters ? `${stats.chapters} chapters detected` : 'Chapter review required' },
    { id: 'design', label: 'Design', view: 'design', status: hasProject ? 'complete' : 'todo', detail: project?.design?.print?.name || project?.design?.template || 'Choose a theme' },
    { id: 'proof', label: 'Proof', view: 'print', status: preview?.pages?.length ? 'complete' : hasChapters ? 'todo' : 'blocked', detail: preview?.pages?.length ? `${preview.pages.length} physical pages` : 'Build print preview' },
    { id: 'paperback', label: 'Paperback', view: 'export', status: printReport?.ready ? 'complete' : preview ? 'blocked' : 'todo', detail: printReport?.ready ? 'KDP preflight passed' : preview ? `${printReport?.summary?.errors || 0} blocking issue(s)` : 'Run after proof' },
    { id: 'ebook', label: 'Ebook', view: 'ebook', status: ebookReport?.ready ? 'complete' : hasProject ? 'blocked' : 'todo', detail: ebookReport?.ready ? 'EPUB preflight passed' : `${ebookReport?.summary?.errors || 0} blocking issue(s)` },
  ];

  return {
    steps,
    storyLockOk,
    hasProject,
    hasChapters,
    unsupported,
    printReport,
    ebookReport,
    paperbackReady: Boolean(printReport?.ready),
    ebookReady: Boolean(ebookReport?.ready),
    allReady: Boolean(printReport?.ready && ebookReport?.ready && storyLockOk),
  };
}
