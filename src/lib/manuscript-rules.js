export function classifyParagraph({ text, styleName }, previousNonEmpty = null) {
  const trimmed = text.trim();
  const style = String(styleName || '').toLowerCase();

  if (!trimmed) return 'blank';
  if (/^chapter\s+\d+\b/i.test(trimmed)) return 'chapter-title';
  if (/^chapter\s+[ivxlcdm]+\b/i.test(trimmed)) return 'chapter-title';
  if (/^prologue\b|^epilogue\b/i.test(trimmed)) return 'chapter-title';
  if (/heading\s*1|chapter|title/.test(style) && trimmed.length < 180) return 'heading';
  if (/^\[[^\]]+\]:/.test(trimmed)) return 'text-message';
  if (/^(\*\s*\*\s*\*|#\s*#\s*#|~\s*~\s*~|—\s*—\s*—|•\s*•\s*•)$/.test(trimmed)) return 'scene-break';
  if (/^(copyright|dedication|table of contents|contents|about the author|about the authors|acknowledg(e)?ments|previously on)\b/i.test(trimmed)) return 'front-back-heading';
  if (previousNonEmpty?.kind === 'chapter-title') return 'chapter-opening';
  return 'body';
}

export function countWords(text) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

export function canonicalizeBlocks(blocks) {
  return blocks.map((block) => block.text).join('\u2029');
}

export function detectChapters(blocks) {
  const chapters = [];
  let current = null;
  for (const block of blocks) {
    if (block.kind === 'chapter-title') {
      current = {
        id: `chapter-${chapters.length + 1}`,
        number: chapters.length + 1,
        title: block.text.trim(),
        blockId: block.id,
        startIndex: block.index,
        endIndex: block.index,
        paragraphCount: 0,
        wordCount: 0,
      };
      chapters.push(current);
      continue;
    }
    if (current) {
      current.endIndex = block.index;
      if (block.kind !== 'blank') current.paragraphCount += 1;
      current.wordCount += countWords(block.text);
    }
  }
  return chapters;
}
