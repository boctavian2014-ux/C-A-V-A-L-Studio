import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/haine-postmortem/checkpoint-fragment.json';
import { evaluateCompletionGate } from '../../ai/composer/project-completion-gate';
import { runProgrammaticSupervisor } from '../../ai/composer/multi-agent/programmatic-supervisor';

describe('project-completion-gate', () => {
  it('fails on junk workspace package name', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cav-gate-'));
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: fixture.junkPackageName, version: '1.0.0' })
    );
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), '## PROJECT SUMMARY\njunk');

    const gate = evaluateCompletionGate({
      workspaceRoot: dir,
      writtenFiles: fixture.junkFiles as string[],
      userMessage: fixture.userMessage as string,
      taskCount: 8,
    });

    expect(gate.ok).toBe(false);
    expect(gate.issues.some((i) => i.code === 'junk_workspace')).toBe(true);
    expect(gate.suggestedContinueMessage).toContain('DELIVERY_CONTINUE');

    const sup = runProgrammaticSupervisor(gate);
    expect(sup.approved).toBe(false);
    expect(sup.raw).toContain('PROGRAMMATIC_GATE_BLOCKED');
  });

  it('fails when fashion-fullstack paths missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cav-gate-'));
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'haine',
        scripts: { build: 'echo ok', typecheck: 'echo ok' },
      })
    );

    const gate = evaluateCompletionGate({
      workspaceRoot: dir,
      writtenFiles: ['fashion-matching-engine/api/main.py'],
      userMessage: 'fashion haine web mobil production',
      taskCount: 4,
      verify: { ran: true, commands: [{ command: 'npm run build', ok: true, exitCode: 0, output: '' }], summary: 'ok' },
    });

    expect(gate.ok).toBe(false);
    expect(gate.archetype).toBe('fashion-fullstack');
    expect(gate.issues.some((i) => i.code === 'archetype_missing')).toBe(true);
  });

  it('passes minimal valid fullstack layout', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cav-gate-ok-'));
    const files = [
      'package.json',
      'fashion-matching-engine/api/main.py',
      'fashion-matching-engine/api/matching_routes.py',
      'web/package.json',
      'web/src/components/ImageUploadPanel.tsx',
      'mobile/package.json',
      'mobile/src/screens/HomeScreen.tsx',
    ];
    for (const rel of files) {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, rel.endsWith('.json') ? '{}' : '# ok');
    }
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'haine', scripts: { build: 'x', typecheck: 'x' } })
    );

    const gate = evaluateCompletionGate({
      workspaceRoot: dir,
      writtenFiles: files,
      userMessage: 'fashion matching web mobil',
      taskCount: 2,
      verify: { ran: true, commands: [{ command: 'npm run build', ok: true, exitCode: 0, output: '' }], summary: 'ok' },
      consistencyOk: true,
    });

    expect(gate.ok).toBe(true);
    expect(runProgrammaticSupervisor(gate).approved).toBe(true);
  });
});
