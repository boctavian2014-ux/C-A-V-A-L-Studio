import type { WebContents } from 'electron';

import { runDevToolsIntegration } from '../../ai/composer/multi-agent/devtools-integration';
import type { CompletionGateIssue } from '../../ai/composer/completion-gate-types';
import { evaluateCompletionGate } from '../../ai/composer/project-completion-gate';

export interface PipelineVerifyJob {
  workspaceRoot: string;
  runId: string;
  streamId?: string;
  senderId: number;
  autoInstall: boolean;
  writtenFiles: string[];
  userMessage: string;
  taskCount: number;
  supervisorApproved?: boolean;
  supervisorRaw?: string;
  supervisorFallback: boolean;
  fastPipeline: boolean;
  consistencyOk?: boolean;
}

export interface PipelineVerifyStatusPayload {
  runId: string;
  streamId?: string;
  workspaceRoot: string;
  ok: boolean;
  summary: string;
  issues: CompletionGateIssue[];
  verifyRan: boolean;
}

const activeJobs = new Map<string, Promise<void>>();

export function scheduleBackgroundVerify(
  sender: WebContents,
  job: PipelineVerifyJob
): void {
  const key = `${job.runId}:${job.senderId}`;
  if (activeJobs.has(key)) return;

  const work = (async () => {
    try {
      const devTools = await runDevToolsIntegration(job.workspaceRoot, {
        verify: job.writtenFiles.length > 0,
        autoInstall: job.autoInstall,
        writtenFiles: job.writtenFiles,
      });

      const gate = evaluateCompletionGate({
        workspaceRoot: job.workspaceRoot,
        writtenFiles: job.writtenFiles,
        userMessage: job.userMessage,
        taskCount: job.taskCount,
        verify: devTools.verify,
        consistencyOk: job.consistencyOk,
        supervisorApproved: job.supervisorApproved,
        supervisorRaw: job.supervisorRaw,
        supervisorFallback: job.supervisorFallback,
        fastPipeline: job.fastPipeline,
        devtoolsAsyncVerify: false,
      });

      const payload: PipelineVerifyStatusPayload = {
        runId: job.runId,
        streamId: job.streamId,
        workspaceRoot: job.workspaceRoot,
        ok: gate.ok,
        summary: devTools.verify?.summary ?? (gate.ok ? 'verify ok' : 'verify failed'),
        issues: gate.blockingIssues.length > 0 ? gate.blockingIssues : gate.issues,
        verifyRan: Boolean(devTools.verify?.ran),
      };

      if (!sender.isDestroyed()) {
        sender.send('caval:pipeline-verify-status', payload);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!sender.isDestroyed()) {
        sender.send('caval:pipeline-verify-status', {
          runId: job.runId,
          streamId: job.streamId,
          workspaceRoot: job.workspaceRoot,
          ok: false,
          summary: message,
          issues: [{ code: 'verify_failed', message }],
          verifyRan: false,
        } satisfies PipelineVerifyStatusPayload);
      }
    } finally {
      activeJobs.delete(key);
    }
  })();

  activeJobs.set(key, work);
}
