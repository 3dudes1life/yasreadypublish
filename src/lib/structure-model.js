const BACK_MATTER_RE = /^(about the author(?:s)?|acknowledg(?:e)?ments|join the journey|also by|author(?:’|'|)s? note|notes|connect|stay connected|newsletter|resources|book club|discussion questions|reading group|contact)\b/i;

export function analyzeMatter(blocks = []) {
  const chapters = [];
  for (const block of blocks) {
    if (block?.kind === 'chapter-title') {
      chapters.push({
        id: block.id,
        title: block.text.trim(),
        startIndex: block.index,
      });
    }
  }

  const firstChapterIndex = chapters.length ? chapters[0].startIndex : null;
  const lastChapterIndex = chapters.length ? chapters[chapters.length - 1].startIndex : null;
  let backMatterStartIndex = null;

  if (lastChapterIndex != null) {
    for (const block of blocks) {
      if (block.index <= lastChapterIndex) continue;
      const text = String(block.text || '').trim();
      if (block.kind === 'front-back-heading' && BACK_MATTER_RE.test(text)) {
        backMatterStartIndex = block.index;
        break;
      }
      if ((block.kind === 'heading' || /heading|title/i.test(block.style?.name || '')) && BACK_MATTER_RE.test(text)) {
        backMatterStartIndex = block.index;
        break;
      }
    }
  }

  const frontMatter = firstChapterIndex == null ? blocks : blocks.filter((block) => block.index < firstChapterIndex);
  const backMatter = backMatterStartIndex == null ? [] : blocks.filter((block) => block.index >= backMatterStartIndex);
  const bodyStart = firstChapterIndex;
  const bodyEnd = backMatterStartIndex == null ? (blocks.length ? blocks.length - 1 : null) : backMatterStartIndex - 1;

  return {
    firstChapterIndex,
    lastChapterIndex,
    backMatterStartIndex,
    bodyStart,
    bodyEnd,
    chapters,
    counts: {
      frontMatterBlocks: frontMatter.length,
      chapters: chapters.length,
      backMatterBlocks: backMatter.length,
    },
    frontMatterHeadings: frontMatter.filter((block) => block.kind !== 'blank' && (block.kind === 'front-back-heading' || block.kind === 'heading' || /heading|title/i.test(block.style?.name || ''))),
    backMatterHeadings: backMatter.filter((block) => block.kind !== 'blank' && (block.kind === 'front-back-heading' || block.kind === 'heading' || /heading|title/i.test(block.style?.name || ''))),
  };
}

export function matterSectionForBlockIndex(index, structure) {
  if (!structure || index == null) return 'unknown';
  if (structure.firstChapterIndex == null || index < structure.firstChapterIndex) return 'front';
  if (structure.backMatterStartIndex != null && index >= structure.backMatterStartIndex) return 'back';
  return 'body';
}

export function chapterForBlockIndex(index, structure) {
  if (!structure || index == null || matterSectionForBlockIndex(index, structure) !== 'body') return null;
  let current = null;
  for (const chapter of structure.chapters) {
    if (chapter.startIndex > index) break;
    current = chapter;
  }
  return current;
}

export function runningHeaderText({ side, projectTitle = '', author = '', chapterTitle = '', mode = 'book-chapter' } = {}) {
  if (mode === 'author-book') return side === 'left' ? author : projectTitle;
  if (mode === 'book-author') return side === 'left' ? projectTitle : author;
  return side === 'left' ? projectTitle : chapterTitle;
}
