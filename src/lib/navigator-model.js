export function spreadIndexForPhysicalPage(pageNumber) {
  const page = Math.max(1, Math.floor(Number(pageNumber) || 1));
  return page <= 1 ? 0 : Math.floor(page / 2);
}

export function spreadPageNumbers(spreadIndex) {
  const index = Math.max(0, Math.floor(Number(spreadIndex) || 0));
  if (index === 0) return { left: null, right: 1 };
  return { left: index * 2, right: (index * 2) + 1 };
}

export function buildPreviewNavigation(pages = []) {
  const entries = [];
  const seenChapters = new Set();
  let frontAdded = false;
  let backAdded = false;

  for (const page of pages) {
    if (!page || !Number.isFinite(Number(page.number))) continue;
    if (page.section === 'front' && !frontAdded) {
      entries.push({
        id: 'front-matter',
        type: 'front',
        title: 'Front Matter',
        physicalPage: page.number,
        bookPageNumber: page.bookPageNumber ?? null,
        spreadIndex: spreadIndexForPhysicalPage(page.number),
      });
      frontAdded = true;
    }

    if (page.hasChapterTitle && page.chapterTitle && !seenChapters.has(page.chapterTitle)) {
      entries.push({
        id: `chapter-${entries.filter((entry) => entry.type === 'chapter').length + 1}`,
        type: 'chapter',
        title: page.chapterTitle,
        physicalPage: page.number,
        bookPageNumber: page.bookPageNumber ?? null,
        spreadIndex: spreadIndexForPhysicalPage(page.number),
      });
      seenChapters.add(page.chapterTitle);
    }

    if (page.section === 'back' && !backAdded) {
      entries.push({
        id: 'back-matter',
        type: 'back',
        title: 'Back Matter',
        physicalPage: page.number,
        bookPageNumber: page.bookPageNumber ?? null,
        spreadIndex: spreadIndexForPhysicalPage(page.number),
      });
      backAdded = true;
    }
  }

  return entries;
}

export function currentNavigationEntry(entries = [], physicalPage = 1) {
  const page = Math.max(1, Math.floor(Number(physicalPage) || 1));
  let current = entries[0] || null;
  for (const entry of entries) {
    if (entry.physicalPage > page) break;
    current = entry;
  }
  return current;
}

export function adjacentChapter(entries = [], physicalPage = 1, direction = 1) {
  const chapters = entries.filter((entry) => entry.type === 'chapter');
  if (!chapters.length) return null;
  const page = Math.max(1, Math.floor(Number(physicalPage) || 1));
  if (direction < 0) {
    const previous = chapters.filter((entry) => entry.physicalPage < page);
    return previous.length ? previous[previous.length - 1] : chapters[0];
  }
  return chapters.find((entry) => entry.physicalPage > page) || chapters[chapters.length - 1];
}
