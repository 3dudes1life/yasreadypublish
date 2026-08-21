import { migrateProject, verifyProjectStoryLock } from './project.js';

export const PROJECT_BACKUP_FORMAT = 'yasready-publish-project-backup';
export const PROJECT_BACKUP_VERSION = 1;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createProjectBackup(project) {
  if (!project?.manuscript?.blocks?.length || !project?.source?.manuscriptHash) {
    throw new Error('A complete Story-Locked project is required before backup.');
  }
  return {
    format: PROJECT_BACKUP_FORMAT,
    backupVersion: PROJECT_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    containsManuscriptText: true,
    project: clone(project),
  };
}

export function serializeProjectBackup(project) {
  return JSON.stringify(createProjectBackup(project), null, 2);
}

export async function parseProjectBackup(text, { cloneProject = true } = {}) {
  let payload;
  try { payload = JSON.parse(String(text || '')); }
  catch { throw new Error('This is not a readable YasReady Publish project backup.'); }

  if (payload?.format !== PROJECT_BACKUP_FORMAT || payload?.backupVersion !== PROJECT_BACKUP_VERSION) {
    throw new Error('This file is not a supported YasReady Publish project backup.');
  }
  if (!payload?.project?.manuscript?.blocks?.length || !payload?.project?.source?.manuscriptHash) {
    throw new Error('The backup is incomplete and cannot be restored safely.');
  }

  const project = migrateProject(clone(payload.project));
  const lock = await verifyProjectStoryLock(project);
  if (!lock.ok) throw new Error('Story Lock failed while verifying this backup. Restore was blocked.');

  if (cloneProject) {
    const now = new Date().toISOString();
    project.restoredFromProjectId = project.id || null;
    project.id = crypto.randomUUID();
    project.createdAt = now;
    project.updatedAt = now;
  }
  project.storyLock.status = 'verified';
  project.storyLock.verifiedAt = new Date().toISOString();
  return project;
}
