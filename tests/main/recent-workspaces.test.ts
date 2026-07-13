import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-recent-'));

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataDir,
  },
}));

describe('recent-workspaces', () => {
  beforeEach(() => {
    const file = path.join(userDataDir, 'recent-workspaces.json');
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });

  afterEach(() => {
    const file = path.join(userDataDir, 'recent-workspaces.json');
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });

  it('adds, dedupes, and lists recent workspaces', async () => {
    const { addRecentWorkspace, listRecentWorkspaces } = await import('../../src/main/recent-workspaces');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-ws-'));

    addRecentWorkspace(root, 'folder');
    addRecentWorkspace('/missing/path', 'clone');
    const second = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-ws2-'));
    addRecentWorkspace(second, 'clone');

    const listed = listRecentWorkspaces();
    expect(listed.length).toBe(2);
    expect(listed[0]?.path).toBe(second);
    expect(listed[1]?.path).toBe(root);

    addRecentWorkspace(root, 'folder');
    expect(listRecentWorkspaces()[0]?.path).toBe(root);
  });

  it('removes a recent workspace entry', async () => {
    const { addRecentWorkspace, removeRecentWorkspace, listRecentWorkspaces } = await import(
      '../../src/main/recent-workspaces'
    );
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-ws-'));
    addRecentWorkspace(root, 'folder');
    removeRecentWorkspace(root);
    expect(listRecentWorkspaces()).toEqual([]);
  });
});
