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
import type { ArenaIssue } from './multi-agent/types';

export interface CompletionGateInput {
  workspaceRoot: string;
  writtenFiles: string[];
  userMessage: string;
  recap?: string;
  taskCount: number;
  verify?: WorkspaceVerifyResult;
  consistencyOk?: boolean;
  arenaIssues?: ArenaIssue[];
  supervisorApproved?: boolean;
  supervisorRaw?: string;
  supervisorFallback?: boolean;
  fastPipeline?: boolean;
  devtoolsAsyncVerify?: boolean;
}

function pushIssue(
  issues: CompletionGateIssue[],
  issue: CompletionGateIssue
): void {
  issues.push({ ...issue, blocking: issue.blocking !== false });
}

function finalizeGateResult(
  issues: CompletionGateIssue[],
  archetype: FashionProjectArchetype | undefined,
  fashionLike: boolean,
  opts?: { needsReview?: boolean; verifyPending?: boolean }
): CompletionGateResult {
  const blockingIssues = issues.filter((i) => i.blocking !== false);
  const softIssues = issues.filter((i) => i.blocking === false);
  const ok = blockingIssues.length === 0;
  return {
    ok,
    issues,
    blockingIssues,
    softIssues,
    needsReview: opts?.needsReview || softIssues.length > 0,
    verifyPending: opts?.verifyPending,
    archetype: fashionLike ? archetype : undefined,
    suggestedContinueMessage: ok
      ? ''
      : buildContinueMessage(blockingIssues.length > 0 ? blockingIssues : issues, fashionLike ? archetype : undefined),
  };
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
  const fastSupervisorPending =
    input.fastPipeline &&
    (input.supervisorRaw === 'FAST_PIPELINE_PENDING' ||
      input.supervisorRaw === 'FAST_PIPELINE' ||
      input.supervisorRaw === 'PROGRAMMATIC_GATE');

  if (isAiJunkWorkspacePackage(input.workspaceRoot)) {
    pushIssue(issues, {
      code: 'junk_workspace',
      message:
        'Workspace corupt (zero-latency-composer / markdown în src/index.ts). Restaurează package.json și șterge fișierele junk.',
    });
  }

  const forbiddenWritten = findForbiddenPathsInFileList(input.writtenFiles);
  for (const p of forbiddenWritten) {
    pushIssue(issues, {
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
      pushIssue(issues, {
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
    pushIssue(issues, {
      code: 'delivery_incomplete',
      message: 'Delivery incomplet: prea puține fișiere sau recap menționează lipsuri.',
    });
  }

  if (input.consistencyOk === false) {
    pushIssue(issues, {
      code: 'consistency_failed',
      message: 'Consistency scan a eșuat (importuri/sintaxă).',
    });
  }

  if (input.supervisorApproved === false && !fastSupervisorPending) {
    const softSupervisor =
      input.supervisorFallback === true && input.writtenFiles.length > 0;
    pushIssue(issues, {
      code: 'supervisor_rejected',
      message: 'Supervisor review REJECTED — remediază issue-urile înainte de livrare.',
      blocking: !softSupervisor,
    });
  }

  const blockingArena = (input.arenaIssues ?? []).filter(
    (i) => i.severity === 'critical' || i.severity === 'major'
  );
  for (const issue of blockingArena.slice(0, 8)) {
    pushIssue(issues, {
      code: 'arena_issue',
      message: `[${issue.source}] ${issue.message}${issue.file ? ` (${issue.file})` : ''}`,
    });
  }

  const verify = input.verify;
  const pkgPath = path.join(input.workspaceRoot, 'package.json');
  const verifyCommands = fs.existsSync(pkgPath) ? detectVerifyCommands(input.workspaceRoot) : [];
  const verifyPending = Boolean(input.devtoolsAsyncVerify && verifyCommands.length > 0 && !verify?.ran);

  if (verifyCommands.length > 0 && !verify?.ran && !input.devtoolsAsyncVerify) {
    pushIssue(issues, {
      code: 'verify_required',
      message: `Workspace verify obligatoriu: ${verifyCommands.join(', ')}.`,
    });
  }

  if (verify) {
    if (!verify.ran) {
      const pkgPath = path.join(input.workspaceRoot, 'package.json');
      if (fs.existsSync(pkgPath) && detectVerifyCommands(input.workspaceRoot).length === 0) {
        pushIssue(issues, {
          code: 'verify_skipped',
          message: 'package.json fără scripts build/typecheck — adaugă npm run build și typecheck.',
        });
      } else if (verify.summary.includes('corupt') || verify.summary.includes('junk')) {
        pushIssue(issues, { code: 'junk_workspace', message: verify.summary });
      }
    } else if (!verify.commands.every((c) => c.ok)) {
      const failed = verify.commands.find((c) => !c.ok);
      pushIssue(issues, {
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
      pushIssue(issues, {
        code: 'archetype_missing',
        message: `Lipsește ${item.path} — ${item.description}`,
      });
    }
  }

  return finalizeGateResult(issues, archetype, fashionLike, {
    needsReview: issues.some((i) => i.code === 'supervisor_rejected' && i.blocking === false),
    verifyPending,
  });
}

export { isDeliveryIncompleteFromGate } from './delivery-orchestrator';
