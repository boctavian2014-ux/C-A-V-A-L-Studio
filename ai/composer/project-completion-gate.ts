import fs from 'node:fs';
import path from 'node:path';

import { isDeliveryIncomplete, type DeliveryIncompleteInput } from './delivery-orchestrator';
import type { CompletionGateIssue, CompletionGateResult } from './completion-gate-types';
export type { CompletionGateIssue, CompletionGateResult } from './completion-gate-types';
import {
  checklistMissingPaths,
  detectFashionArchetype,
  getCompletionChecklist,
  type FashionProjectArchetype,
} from '../scaffolds/fashion-matching/archetype';
import {
  findForbiddenPathsInFileList,
  isForbiddenUserWorkspacePath,
} from '../scaffolds/workspace-forbidden-paths';
import {
  detectVerifyCommands,
  isAiJunkWorkspacePackage,
  type WorkspaceVerifyResult,
} from '../tools/workspace-verify';

export interface CompletionGateInput {
  workspaceRoot: string;
  writtenFiles: string[];
  userMessage: string;
  recap?: string;
  taskCount: number;
  verify?: WorkspaceVerifyResult;
  consistencyOk?: boolean;
}

function fileExistsAt(workspaceRoot: string, relativePath: string): boolean {
  return fs.existsSync(path.join(workspaceRoot, relativePath.replace(/\//g, path.sep)));
}

function buildContinueMessage(issues: CompletionGateIssue[], archetype?: FashionProjectArchetype): string {
  const lines = [
    'DELIVERY_CONTINUE',
    '',
    'Poarta de finalizare: proiectul NU e gata de production. Rezolvă:',
  ];
  for (const issue of issues) {
    lines.push(`- [${issue.code}] ${issue.message}`);
  }
  if (archetype === 'fashion-fullstack') {
    lines.push(
      '',
      'Folosește archetype fashion-fullstack: fashion-matching-engine/ + web/ + mobile/ (Expo standalone).',
      'NU crea src/zero-latency/ sau cavallo_task_generator/ în proiecte utilizator.',
      'Root package.json: workspaces doar web; mobile are npm install separat.',
      'API: POST /api/v1/matching/match/upload, npm run api pe 0.0.0.0:8000.'
    );
  }
  lines.push('', 'Emite fence-uri complete ```lang:path``` pentru fiecare fișier lipsă.');
  return lines.join('\n');
}

export function evaluateCompletionGate(input: CompletionGateInput): CompletionGateResult {
  const issues: CompletionGateIssue[] = [];
  const archetype = detectFashionArchetype(input.userMessage);

  if (isAiJunkWorkspacePackage(input.workspaceRoot)) {
    issues.push({
      code: 'junk_workspace',
      message:
        'Workspace corupt (zero-latency-composer / markdown în src/index.ts). Restaurează package.json și șterge fișierele junk.',
    });
  }

  const forbiddenWritten = findForbiddenPathsInFileList(input.writtenFiles);
  for (const p of forbiddenWritten) {
    issues.push({
      code: 'forbidden_path',
      message: `Fișier interzis în proiect utilizator: ${p} (module interne Cavallo).`,
    });
  }

  const allForbiddenOnDisk: string[] = [];
  const scanDirs = ['src', 'cavallo_task_generator', 'zero-latency-composer'];
  for (const dir of scanDirs) {
    const abs = path.join(input.workspaceRoot, dir);
    if (!fs.existsSync(abs)) continue;
    const walk = (base: string, rel: string) => {
      for (const ent of fs.readdirSync(base, { withFileTypes: true })) {
        const childRel = rel ? `${rel}/${ent.name}` : ent.name;
        if (ent.isDirectory()) walk(path.join(base, ent.name), childRel);
        else if (isForbiddenUserWorkspacePath(childRel)) allForbiddenOnDisk.push(childRel);
      }
    };
    walk(abs, dir);
  }
  for (const p of [...new Set(allForbiddenOnDisk)]) {
    if (!forbiddenWritten.includes(p)) {
      issues.push({
        code: 'forbidden_path',
        message: `Șterge path interzis din workspace: ${p}`,
      });
    }
  }

  const deliveryInput: DeliveryIncompleteInput = {
    writtenFiles: input.writtenFiles,
    recap: input.recap,
    taskCount: input.taskCount,
  };
  if (isDeliveryIncomplete(deliveryInput)) {
    issues.push({
      code: 'delivery_incomplete',
      message: 'Delivery incomplet: prea puține fișiere sau recap menționează lipsuri.',
    });
  }

  if (input.consistencyOk === false) {
    issues.push({
      code: 'consistency_failed',
      message: 'Consistency scan a eșuat (importuri/sintaxă).',
    });
  }

  const verify = input.verify;
  if (verify) {
    if (!verify.ran) {
      const pkgPath = path.join(input.workspaceRoot, 'package.json');
      if (fs.existsSync(pkgPath) && detectVerifyCommands(input.workspaceRoot).length === 0) {
        issues.push({
          code: 'verify_skipped',
          message: 'package.json fără scripts build/typecheck — adaugă npm run build și typecheck.',
        });
      } else if (verify.summary.includes('corupt') || verify.summary.includes('junk')) {
        issues.push({ code: 'junk_workspace', message: verify.summary });
      }
    } else if (!verify.commands.every((c) => c.ok)) {
      const failed = verify.commands.find((c) => !c.ok);
      issues.push({
        code: 'verify_failed',
        message: `Verify eșuat la ${failed?.command ?? 'unknown'}: ${failed?.output?.slice(0, 200) ?? verify.summary}`,
      });
    }
  }

  const fashionLike =
    archetype === 'fashion-fullstack' ||
    /\bfashion-matching-engine\b/i.test(input.userMessage) ||
    input.writtenFiles.some((f) => f.startsWith('fashion-matching-engine/'));

  if (fashionLike && archetype === 'fashion-fullstack') {
    const checklist = getCompletionChecklist('fashion-fullstack');
    const missing = checklistMissingPaths(checklist, (rel) =>
      fileExistsAt(input.workspaceRoot, rel)
    );
    for (const item of missing) {
      issues.push({
        code: 'archetype_missing',
        message: `Lipsește ${item.path} — ${item.description}`,
      });
    }
  }

  const ok = issues.length === 0;
  return {
    ok,
    issues,
    archetype: fashionLike ? archetype : undefined,
    suggestedContinueMessage: ok ? '' : buildContinueMessage(issues, fashionLike ? archetype : undefined),
  };
}

export { isDeliveryIncompleteFromGate } from './delivery-orchestrator';
