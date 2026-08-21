import { canonicalizeBlocks, classifyParagraph, countWords, detectChapters } from './manuscript-rules.js';

const JSZip = globalThis.JSZip;
if (!JSZip) throw new Error('JSZip failed to load. YasReady Publish cannot safely read DOCX files.');

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const textOf = (node) => node?.textContent ?? '';

function xmlDoc(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) throw new Error('The DOCX contains XML that could not be read safely.');
  return doc;
}

function getAttr(node, localName) {
  if (!node) return null;
  return node.getAttributeNS(WORD_NS, localName)
    ?? node.getAttribute(`w:${localName}`)
    ?? node.getAttribute(localName);
}

function childrenByLocalName(node, name) {
  return Array.from(node?.childNodes ?? []).filter(
    (child) => child.nodeType === 1 && child.localName === name,
  );
}

function firstChildByLocalName(node, name) {
  return childrenByLocalName(node, name)[0] ?? null;
}

function parseStyles(stylesXml) {
  const styles = new Map();
  if (!stylesXml) return styles;
  const doc = xmlDoc(stylesXml);

  for (const style of Array.from(doc.getElementsByTagNameNS(WORD_NS, 'style'))) {
    const id = getAttr(style, 'styleId');
    if (!id) continue;
    const nameNode = firstChildByLocalName(style, 'name');
    styles.set(id, getAttr(nameNode, 'val') || id);
  }
  return styles;
}

function parseNumbering(numberingXml) {
  const numbering = {
    nums: new Map(),
    abstracts: new Map(),
  };
  if (!numberingXml) return numbering;
  const doc = xmlDoc(numberingXml);

  for (const abstract of Array.from(doc.getElementsByTagNameNS(WORD_NS, 'abstractNum'))) {
    const abstractId = getAttr(abstract, 'abstractNumId');
    const levels = new Map();
    for (const lvl of childrenByLocalName(abstract, 'lvl')) {
      const ilvl = getAttr(lvl, 'ilvl') || '0';
      const numFmt = getAttr(firstChildByLocalName(lvl, 'numFmt'), 'val') || 'decimal';
      const lvlText = getAttr(firstChildByLocalName(lvl, 'lvlText'), 'val') || '%1.';
      levels.set(ilvl, { numFmt, lvlText });
    }
    numbering.abstracts.set(abstractId, levels);
  }

  for (const num of Array.from(doc.getElementsByTagNameNS(WORD_NS, 'num'))) {
    const numId = getAttr(num, 'numId');
    const abstractId = getAttr(firstChildByLocalName(num, 'abstractNumId'), 'val');
    numbering.nums.set(numId, abstractId);
  }

  return numbering;
}

function runFormatting(run) {
  const props = firstChildByLocalName(run, 'rPr');
  return {
    bold: Boolean(firstChildByLocalName(props, 'b')),
    italic: Boolean(firstChildByLocalName(props, 'i')),
    underline: Boolean(firstChildByLocalName(props, 'u')),
    strike: Boolean(firstChildByLocalName(props, 'strike')),
    smallCaps: Boolean(firstChildByLocalName(props, 'smallCaps')),
  };
}

function parseRun(run) {
  const formatting = runFormatting(run);
  let text = '';

  for (const child of Array.from(run.childNodes)) {
    if (child.nodeType !== 1) continue;
    switch (child.localName) {
      case 't':
        text += textOf(child);
        break;
      case 'tab':
        text += '\t';
        break;
      case 'br':
      case 'cr':
        text += '\n';
        break;
      case 'noBreakHyphen':
        text += '\u2011';
        break;
      case 'softHyphen':
        text += '\u00AD';
        break;
      default:
        break;
    }
  }

  return { text, ...formatting };
}

function paragraphTextAndRuns(paragraph) {
  const runs = [];
  let text = '';

  const walk = (node) => {
    for (const child of Array.from(node.childNodes ?? [])) {
      if (child.nodeType !== 1) continue;
      if (child.localName === 'r') {
        const parsed = parseRun(child);
        runs.push(parsed);
        text += parsed.text;
      } else if (child.localName === 'hyperlink' || child.localName === 'smartTag' || child.localName === 'sdt') {
        walk(child);
      }
    }
  };

  walk(paragraph);
  return { text, runs };
}

function paragraphStyle(paragraph, styles) {
  const pPr = firstChildByLocalName(paragraph, 'pPr');
  const styleNode = firstChildByLocalName(pPr, 'pStyle');
  const styleId = getAttr(styleNode, 'val') || '';
  return {
    id: styleId,
    name: styles.get(styleId) || styleId || 'Normal',
  };
}

function paragraphNumbering(paragraph, numbering) {
  const pPr = firstChildByLocalName(paragraph, 'pPr');
  const numPr = firstChildByLocalName(pPr, 'numPr');
  if (!numPr) return null;
  const numId = getAttr(firstChildByLocalName(numPr, 'numId'), 'val');
  const ilvl = getAttr(firstChildByLocalName(numPr, 'ilvl'), 'val') || '0';
  const abstractId = numbering.nums.get(numId);
  const level = numbering.abstracts.get(abstractId)?.get(ilvl) ?? null;
  return { numId, ilvl, ...level };
}

export async function parseDocx(arrayBuffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch {
    throw new Error('This file is not a readable DOCX package. Please choose a .docx file.');
  }

  const documentFile = zip.file('word/document.xml');
  const imageCount = Object.keys(zip.files).filter((name) => /^word\/media\/[^/]+$/i.test(name)).length;
  if (!documentFile) throw new Error('The DOCX is missing word/document.xml and cannot be imported safely.');

  const [documentXml, stylesXml, numberingXml] = await Promise.all([
    documentFile.async('string'),
    zip.file('word/styles.xml')?.async('string') ?? null,
    zip.file('word/numbering.xml')?.async('string') ?? null,
  ]);

  const styles = parseStyles(stylesXml);
  const numbering = parseNumbering(numberingXml);
  const document = xmlDoc(documentXml);
  const body = document.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) throw new Error('The DOCX does not contain a readable document body.');

  // Tracked revisions create ambiguity about which wording is canonical. Story Lock refuses to guess.
  const inserted = body.getElementsByTagNameNS(WORD_NS, 'ins').length;
  const deleted = body.getElementsByTagNameNS(WORD_NS, 'del').length;
  if (inserted || deleted) {
    throw new Error('Story Lock stopped this import because the DOCX contains tracked changes. Accept or reject all tracked changes in Word, save a clean final DOCX, and import again.');
  }

  const blocks = [];
  let previousNonEmpty = null;

  // Use all body paragraphs in XML order, including paragraphs inside tables/text boxes.
  // We would rather preserve extra source content than silently drop a story paragraph.
  for (const element of Array.from(body.getElementsByTagNameNS(WORD_NS, 'p'))) {
    const { text, runs } = paragraphTextAndRuns(element);
    const style = paragraphStyle(element, styles);
    const numberingInfo = paragraphNumbering(element, numbering);
    const draft = { text, styleName: style.name };
    const kind = classifyParagraph(draft, previousNonEmpty);

    const block = {
      id: `p-${blocks.length + 1}`,
      index: blocks.length,
      kind,
      text,
      runs,
      style,
      numbering: numberingInfo,
      wordCount: countWords(text),
    };
    blocks.push(block);
    if (kind !== 'blank') previousNonEmpty = block;
  }

  const canonicalText = canonicalizeBlocks(blocks);
  const chapters = detectChapters(blocks);
  const stats = {
    paragraphs: blocks.length,
    nonEmptyParagraphs: blocks.filter((b) => b.kind !== 'blank').length,
    words: blocks.reduce((sum, b) => sum + b.wordCount, 0),
    characters: blocks.reduce((sum, b) => sum + b.text.length, 0),
    chapters: chapters.length,
    textMessages: blocks.filter((b) => b.kind === 'text-message').length,
    sceneBreaks: blocks.filter((b) => b.kind === 'scene-break').length,
  };

  return {
    blocks,
    chapters,
    canonicalText,
    stats,
    metadata: {
      hasStyles: Boolean(stylesXml),
      hasNumbering: Boolean(numberingXml),
      imageCount,
    },
  };
}

