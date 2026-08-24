const BACK_MATTER_RE = /^(about the author(?:s)?|acknowledg(?:e)?ments|join the journey|also by|author(?:’|'|)s? note|notes|connect|stay connected|newsletter|resources|book club|discussion questions|reading group|contact)\b/i;
const AUTHOR_BIO_CUES = [/(?:daniel|caleb|will)\b/i, /when (?:they|we)(?:’|'|)re not writing/i, /follow (?:their|our) world|follow (?:them|us) on social/i, /@3dudes1life/i, /3dudes1life\.com/i, /about the author/i];
const JOURNEY_CUES = [/join the journey/i, /you made book two happen/i, /tag us on social media/i, /#tresamigosunavida/i, /tresamigosunavida\.com/i, /recommend the books? to/i];

function looksLikeMatterLead(block, previous = null) {
  if (!block || block.kind === 'blank') return false;
  const text = String(block.text || '').trim();
  const style = String(block.style?.name || block.styleName || '');
  return block.kind === 'front-back-heading'
    || block.kind === 'heading'
    || /heading|title/i.test(style)
    || Boolean(block.layout?.pageBreakBefore || previous?.layout?.manualPageBreak)
    || (text.length > 0 && text.length <= 64 && String(block.layout?.alignment || '').toLowerCase() === 'center');
}

function cueCount(text, cues) {
  return cues.reduce((sum, re) => sum + (re.test(text) ? 1 : 0), 0);
}

function inferredBackMatterStart(blocks, lastChapterIndex) {
  if (lastChapterIndex == null) return null;
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block.index <= lastChapterIndex) continue;
    const text = String(block.text || '').trim();
    if (!text) continue;
    if (BACK_MATTER_RE.test(text)) return block.index;
    if (!looksLikeMatterLead(block, blocks[i - 1] || null)) continue;
    const windowText = blocks.slice(i, Math.min(blocks.length, i + 18)).map((item) => String(item?.text || '').trim()).filter(Boolean).join(' \n');
    const authorScore = cueCount(windowText, AUTHOR_BIO_CUES);
    const journeyScore = cueCount(windowText, JOURNEY_CUES);
    if (authorScore >= 3 || journeyScore >= 3) return block.index;
  }
  return null;
}

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
  // Back matter is allowed to be badly styled. First prefer explicit labels,
  // then use high-confidence trailing-page content cues so a lost/mis-styled
  // "About the Authors" heading cannot turn BOOK TWO into a fake chapter.
  const backMatterStartIndex = inferredBackMatterStart(blocks, lastChapterIndex);

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
