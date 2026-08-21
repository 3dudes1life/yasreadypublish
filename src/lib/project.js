import { sha256Hex } from './hash.js';
import { DEFAULT_PRINT_DESIGN, ensurePrintDesign } from './print-model.js';

export async function createProjectFromImport({ file, arrayBuffer, parsed }) {
  const [sourceFileHash, manuscriptHash] = await Promise.all([
    sha256Hex(arrayBuffer),
    sha256Hex(parsed.canonicalText),
  ]);

  const now = new Date().toISOString();
  const baseName = file.name.replace(/\.docx$/i, '');

  return {
    id: crypto.randomUUID(),
    version: 2,
    appVersion: '0.2.0',
    title: baseName,
    author: '',
    createdAt: now,
    updatedAt: now,
    source: {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      lastModified: file.lastModified,
      sourceFileHash,
      manuscriptHash,
    },
    storyLock: {
      enabled: true,
      canonicalAlgorithm: 'SHA-256',
      canonicalVersion: 1,
      verifiedAt: now,
      status: 'verified',
    },
    manuscript: {
      blocks: parsed.blocks,
      chapters: parsed.chapters,
      stats: parsed.stats,
      metadata: parsed.metadata,
    },
    design: {
      template: 'Novel 6×9 Draft',
      print: { ...DEFAULT_PRINT_DESIGN },
    },
  };
}

export function migrateProject(project) {
  if (!project) return project;
  ensurePrintDesign(project);
  project.version = Math.max(Number(project.version) || 1, 2);
  project.appVersion = '0.2.0';
  return project;
}

export async function verifyProjectStoryLock(project) {
  const canonicalText = project.manuscript.blocks.map((block) => block.text).join('\u2029');
  const currentHash = await sha256Hex(canonicalText);
  return {
    ok: currentHash === project.source.manuscriptHash,
    expected: project.source.manuscriptHash,
    actual: currentHash,
  };
}
