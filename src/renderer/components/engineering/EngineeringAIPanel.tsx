import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useCavalTheme } from '../../../../themes/theme-provider';
import { useEditorStore } from '../../store/editor-store';
import { useAIStore } from '../../../../ai/composer/ai-store';
import { ChatModelSelect } from '../../../../ai/composer/ChatModelSelect';
import { useModelCatalog } from '../../../../ai/composer/use-model-catalog';
import { generateEngineering } from '../../../../ai/engineering/engineering-generator';
import {
  parseRoboticsPlan,
  roboticsPlanToEngProject,
} from '../../../../ai/engineering/robotics-format';
import {
  createSectionCollector,
  shouldFlushStreamImmediately,
} from '../../../../ai/engineering/streaming-sections';
import { checkModelReadiness, type ModelReadiness } from '../../../../ai/models/model-readiness';
import { useEngineeringCadStore } from '../../store/engineering-cad-store';
import { useRoboticsSessionStore, issueAbortChatStreamOnce } from '../../store/robotics-session-store';
import { CavaloAiMark } from '../brand/CavaloHorseMark';
import { bootstrapRoboticsDesktopProject } from './bootstrap-robotics-project';
import { useTranslation } from '../../../../ai/i18n/useTranslation';

// ──────────────────────────────────────────────────────────────
//  Robotics AI ULTRA — composer (dreapta); răspunsul e în centru
// ──────────────────────────────────────────────────────────────

export function EngineeringAIPanel() {
  const { t } = useTranslation();
  useCavalTheme();
  const projectPath = useEditorStore((s) => s.projectPath);

  const selectedModel = useAIStore((s) => s.selectedModel);
  const apiKeys = useAIStore((s) => s.apiKeys);
  const loadModelLabels = useAIStore((s) => s.loadModelLabels);

  const { catalog, loading: catalogLoading } = useModelCatalog();

  const prompt = useRoboticsSessionStore((s) => s.prompt);
  const setPrompt = useRoboticsSessionStore((s) => s.setPrompt);
  const loading = useRoboticsSessionStore((s) => s.loading);
  const error = useRoboticsSessionStore((s) => s.error);
  const warning = useRoboticsSessionStore((s) => s.warning);
  const plan = useRoboticsSessionStore((s) => s.plan);
  const project = useRoboticsSessionStore((s) => s.project);
  const bom = useRoboticsSessionStore((s) => s.bom);
  const streamingMode = useRoboticsSessionStore((s) => s.streamingMode);
  const cancelStatus = useRoboticsSessionStore((s) => s.cancelStatus);
  const cancelMessage = useRoboticsSessionStore((s) => s.cancelMessage);
  const cadPhase = useEngineeringCadStore((s) => s.phase);
  const cadBusy = useEngineeringCadStore((s) => s.cadBusy);
  const batchBusy = useEngineeringCadStore((s) => s.batchBusy);
  const cancelCadJob = useEngineeringCadStore((s) => s.cancelCadJob);

  const [localReadinessHint, setLocalReadinessHint] = useState<string | null>(null);
  const [, setReadiness] = useState<ModelReadiness | null>(null);
  const [openRouterConfigured, setOpenRouterConfigured] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const collectorRef = useRef(createSectionCollector());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeStreamIdRef = useRef<string | null>(null);
  const hadSectionsRef = useRef(false);
  const accumulatedRef = useRef('');

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      const controller = abortRef.current;
      const streamId = activeStreamIdRef.current;
      const cadJobId = useEngineeringCadStore.getState().jobId;
      abortRef.current = null;
      activeStreamIdRef.current = null;
      try {
        controller?.abort();
      } catch {
        /* idempotent */
      }
      useRoboticsSessionStore.getState().finalizeStream({
        callAbortChat: false,
        forStreamId: streamId,
        settle: true,
        incomplete: true,
        clearProgress: false,
      });
      // Best-effort unified cancel (P2) — fire-and-forget on unmount.
      const projectPath = useEditorStore.getState().projectPath;
      void (async () => {
        try {
          if (window.caval?.cancelOperation) {
            await window.caval.cancelOperation({
              streamId: streamId ?? undefined,
              cadJobId: cadJobId ?? undefined,
              workspaceRoot: projectPath ?? undefined,
            });
            await useEngineeringCadStore.getState().cancelCadJob({ skipRemote: true });
          } else {
            issueAbortChatStreamOnce(streamId);
            await useEngineeringCadStore.getState().cancelCadJob();
          }
        } catch {
          issueAbortChatStreamOnce(streamId);
          await useEngineeringCadStore.getState().cancelCadJob();
        }
      })();
    };
  }, []);

  useEffect(() => {
    void loadModelLabels();
  }, [loadModelLabels]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [settingsRes, secretsRes] = await Promise.all([
        window.caval?.settingsLoad?.(),
        window.caval?.secretsGet?.(),
      ]);
      const configured =
        settingsRes?.settings?.['openrouter.configured'] === 'true' ||
        secretsRes?.configured?.OPENROUTER_API_KEY === true;
      if (!cancelled) setOpenRouterConfigured(configured);
      const result = await checkModelReadiness(selectedModel, apiKeys, {
        openRouterApiKey: configured ? '__configured__' : undefined,
      });
      if (!cancelled) {
        setReadiness(result);
        setLocalReadinessHint(result.ready ? null : result.hint);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedModel, apiKeys]);

  const applyPlanReady = useCallback((partial: {
    ok: boolean;
    project?: import('../../../../ai/engineering/engineering-generator').EngProject;
    plan?: import('../../../../ai/engineering/robotics-format').ParsedRoboticsPlan | null;
    bom?: import('../../../../ai/engineering/robotics-components-schema').RoboticsComponentBom | null;
    warning?: string;
    error?: string;
  }, streamId: string | null) => {
    const s = useRoboticsSessionStore.getState();
    if (!streamId || s.streamId !== streamId || s.streamSettled) return;

    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    collectorRef.current.finish();
    // End loading for THIS stream only; keep streamProgress until final settle.
    s.finalizeStream({
      callAbortChat: false,
      abortSignal: false,
      clearProgress: false,
      forStreamId: streamId,
    });

    if (partial.ok && partial.project) {
      s.applyForStream(streamId, {
        project: partial.project,
        plan: partial.plan ?? null,
        ...(partial.bom !== undefined ? { bom: partial.bom ?? null } : {}),
        warning: partial.warning ?? null,
        incomplete: false,
      });
      s.setError(null);
      s.clearPromptAfterResponse();
      void bootstrapRoboticsDesktopProject({
        project: partial.project,
        plan: partial.plan ?? s.plan,
        userPrompt: s.lastPrompt || s.prompt,
      });
    } else if (!partial.ok) {
      // Keep any valid progress already captured; report safe error.
      s.applyForStream(streamId, {
        warning: null,
        error: partial.error ?? 'Generare eșuată.',
        incomplete: true,
      });
    }
  }, []);

  const flushPartial = useCallback((streamId: string, accumulated: string) => {
    const s = useRoboticsSessionStore.getState();
    if (s.streamId !== streamId || s.streamSettled) return;
    // Collector list first — do not wait for parseRoboticsPlan to paint progress UI.
    const snap = collectorRef.current.snapshot();
    s.applyForStream(streamId, { streamProgress: snap });
    if (!accumulated.trim()) return;
    if (s.streamingMode === 'fallback') return;
    const partialPlan = parseRoboticsPlan(accumulated);
    try {
      const partialProject = roboticsPlanToEngProject(partialPlan);
      s.applyForStream(streamId, { plan: partialPlan, project: partialProject });
    } catch {
      s.applyForStream(streamId, { plan: partialPlan });
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    const session = useRoboticsSessionStore.getState();
    // Concurrency: never start a second stream while loading or cancelling.
    if (session.loading || session.cancelStatus === "aborting") return;

    if (!prompt.trim()) {
      session.setError('Descrie ce vrei să construiești.');
      return;
    }

    const readyCheck = await checkModelReadiness(selectedModel, apiKeys, {
      openRouterApiKey: openRouterConfigured ? '__configured__' : undefined,
    });
    setReadiness(readyCheck);
    if (!readyCheck.ready) {
      setLocalReadinessHint(readyCheck.hint);
      session.setError(readyCheck.reason);
      return;
    }

    if (cadBusy || batchBusy || cadPhase === 'cancelling' || cadPhase === 'stale') {
      await cancelCadJob();
      const cadState = useEngineeringCadStore.getState();
      if (cadState.cadBusy || cadState.batchBusy || cadState.phase === 'cancelling') {
        session.setError('Oprește generarea CAD înainte de un plan nou');
        return;
      }
      if (cadState.phase === 'stale') {
        session.setError(cadState.error ?? 'Oprește generarea CAD înainte de un plan nou');
        return;
      }
    }

    const submittedPrompt = prompt.trim();
    session.setLastPrompt(submittedPrompt);
    session.beginGenerate();
    setLocalReadinessHint(null);
    collectorRef.current.reset();
    hadSectionsRef.current = false;
    accumulatedRef.current = '';

    const controller = new AbortController();
    abortRef.current = controller;
    activeStreamIdRef.current = null;
    let planReadyFired = false;
    let generationSucceeded = false;
    let streamIdLocal: string | null = null;

    const scheduleFlush = (streamId: string) => {
      const snap = collectorRef.current.snapshot();
      if (shouldFlushStreamImmediately(hadSectionsRef.current, snap)) {
        hadSectionsRef.current = true;
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        flushPartial(streamId, accumulatedRef.current);
        return;
      }
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        flushPartial(streamId, accumulatedRef.current);
      }, 150);
    };

    try {
      const result = await generateEngineering({
        prompt,
        modelId: selectedModel,
        apiKeys,
        workspaceRoot: projectPath,
        signal: controller.signal,
        onStreamStart: (id) => {
          // New stream (including retry) — reset collector so deltas do not double.
          if (streamIdLocal && streamIdLocal !== id) {
            collectorRef.current.reset();
            hadSectionsRef.current = false;
            accumulatedRef.current = '';
          }
          streamIdLocal = id;
          activeStreamIdRef.current = id;
          useRoboticsSessionStore.getState().setStreamId(id);
        },
        onReasoningActivity: () => {
          if (!streamIdLocal) return;
          useRoboticsSessionStore.getState().applyForStream(streamIdLocal, {
            reasoningActive: true,
          });
        },
        onStreamingMode: (mode) => {
          if (!streamIdLocal && mode === 'fallback') {
            useRoboticsSessionStore.getState().setStreamingMode('fallback');
            return;
          }
          if (streamIdLocal) {
            useRoboticsSessionStore.getState().applyForStream(streamIdLocal, {
              streamingMode: mode,
            });
          } else {
            useRoboticsSessionStore.getState().setStreamingMode(mode);
          }
        },
        onDelta: (chunk) => {
          if (!streamIdLocal) return;
          const s = useRoboticsSessionStore.getState();
          if (s.streamId !== streamIdLocal || s.streamSettled) return;
          // Fallback must not fake live section streaming.
          if (s.streamingMode === 'fallback') return;
          accumulatedRef.current += chunk;
          collectorRef.current.push(chunk);
          scheduleFlush(streamIdLocal);
        },
        onPlanReady: (partial) => {
          planReadyFired = true;
          if (partial.ok) generationSucceeded = true;
          applyPlanReady(partial, streamIdLocal);
        },
      });

      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      const finishedSnap = collectorRef.current.finish();
      if (streamIdLocal) {
        useRoboticsSessionStore.getState().applyForStream(streamIdLocal, {
          streamProgress: finishedSnap,
        });
      }

      if (controller.signal.aborted) {
        useRoboticsSessionStore.getState().finalizeStream({
          callAbortChat: false,
          settle: true,
          incomplete: true,
          clearProgress: false,
          forStreamId: streamIdLocal,
        });
        return;
      }

      if (result.ok && result.project) {
        generationSucceeded = true;
        const s = useRoboticsSessionStore.getState();
        if (streamIdLocal && (s.streamId !== streamIdLocal || s.streamSettled)) {
          return;
        }
        if (streamIdLocal) {
          s.applyForStream(streamIdLocal, {
            project: result.project,
            plan: result.plan ?? null,
            bom: result.bom ?? null,
            warning: result.warning ?? null,
            incomplete: false,
          });
          s.setError(null);
        } else {
          s.setProject(result.project);
          s.setPlan(result.plan ?? null);
          s.setBom(result.bom ?? null);
          s.setWarning(result.warning ?? null);
          s.setError(null);
        }
        s.clearPromptAfterResponse();
        void bootstrapRoboticsDesktopProject({
          project: result.project,
          plan: result.plan ?? null,
          userPrompt: submittedPrompt,
        });
        // Controlled settle after final plan commit — keep final progress snapshot.
        s.finalizeStream({
          callAbortChat: false,
          settle: true,
          clearProgress: false,
          forStreamId: streamIdLocal,
        });
      } else if (!planReadyFired) {
        applyPlanReady(
          {
            ok: false,
            error: result.error ?? 'Generare eșuată.',
          },
          streamIdLocal
        );
        useRoboticsSessionStore.getState().finalizeStream({
          callAbortChat: false,
          settle: true,
          incomplete: true,
          clearProgress: false,
          forStreamId: streamIdLocal,
        });
      } else if (!result.ok) {
        if (streamIdLocal) {
          useRoboticsSessionStore.getState().applyForStream(streamIdLocal, {
            error: result.error ?? 'Generare eșuată.',
            incomplete: true,
          });
        } else {
          useRoboticsSessionStore.getState().setError(result.error ?? 'Generare eșuată.');
        }
        useRoboticsSessionStore.getState().finalizeStream({
          callAbortChat: false,
          settle: true,
          incomplete: true,
          clearProgress: false,
          forStreamId: streamIdLocal,
        });
      } else {
        useRoboticsSessionStore.getState().finalizeStream({
          callAbortChat: false,
          settle: true,
          clearProgress: false,
          forStreamId: streamIdLocal,
        });
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const msg = err instanceof Error ? err.message : String(err);
        if (streamIdLocal) {
          useRoboticsSessionStore.getState().applyForStream(streamIdLocal, {
            error: msg,
            incomplete: true,
          });
        } else {
          useRoboticsSessionStore.getState().setError(msg);
        }
      }
      useRoboticsSessionStore.getState().finalizeStream({
        callAbortChat: false,
        settle: true,
        incomplete: true,
        clearProgress: false,
        forStreamId: streamIdLocal,
      });
    } finally {
      abortRef.current = null;
      activeStreamIdRef.current = null;
      if (generationSucceeded || useRoboticsSessionStore.getState().project) {
        const s = useRoboticsSessionStore.getState();
        if (!s.lastPrompt.trim() && submittedPrompt) s.setLastPrompt(submittedPrompt);
        s.clearPromptAfterResponse();
      }
    }
  }, [
    prompt,
    selectedModel,
    apiKeys,
    openRouterConfigured,
    projectPath,
    applyPlanReady,
    flushPartial,
    cadBusy,
    batchBusy,
    cadPhase,
    cancelCadJob,
  ]);

  const handleStop = useCallback(() => {
    const streamId = activeStreamIdRef.current;
    const cadJobId = useEngineeringCadStore.getState().jobId;
    const s = useRoboticsSessionStore.getState();
    s.setCancelStatus("aborting", "Cancelling…");

    s.finalizeStream({
      abortController: abortRef.current,
      callAbortChat: false,
      abortSignal: true,
      settle: true,
      incomplete: true,
      clearProgress: false,
      forStreamId: streamId,
    });
    abortRef.current = null;
    activeStreamIdRef.current = null;

    void (async () => {
      const projectPath = useEditorStore.getState().projectPath;
      const userIdResult = await window.caval?.billingUserId?.();
      let remote: "ok" | "failed" | "skipped" = "skipped";
      try {
        if (window.caval?.cancelOperation) {
          const res = await window.caval.cancelOperation({
            streamId: streamId ?? undefined,
            cadJobId: cadJobId ?? undefined,
            workspaceRoot: projectPath ?? undefined,
            cavalId: userIdResult?.userId,
          });
          remote = res.remoteCancel ?? "skipped";
          if (!res.ok) {
            useRoboticsSessionStore
              .getState()
              .setCancelStatus("failed_remote", res.error ?? "Could not cancel remotely");
            await useEngineeringCadStore.getState().cancelCadJob({ skipRemote: true });
            return;
          }
        } else {
          issueAbortChatStreamOnce(streamId);
        }
        await useEngineeringCadStore.getState().cancelCadJob({
          skipRemote: remote !== "skipped",
        });
        if (remote === "failed") {
          useRoboticsSessionStore
            .getState()
            .setCancelStatus(
              "failed_remote",
              "Could not cancel remotely — local generation stopped"
            );
        } else {
          useRoboticsSessionStore.getState().setCancelStatus("aborted", "Canceled");
        }
      } catch (err) {
        useRoboticsSessionStore.getState().setCancelStatus(
          "failed_remote",
          err instanceof Error ? err.message : "Could not cancel remotely"
        );
        await useEngineeringCadStore.getState().cancelCadJob({ skipRemote: true });
      }
    })();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (useRoboticsSessionStore.getState().loading) return;
      void handleGenerate();
    }
  };

  const summaryLine = (() => {
    if (cancelStatus === "aborting") return cancelMessage ?? "Cancelling…";
    if (cancelStatus === "failed_remote") {
      return cancelMessage ?? "Could not cancel remotely";
    }
    if (cancelStatus === "aborted") return cancelMessage ?? "Canceled";
    if (loading && streamingMode === "fallback") {
      return "Generare fără progres live (mod non-streaming)";
    }
    if (loading) return "Generez… răspunsul apare în centru";
    if (project && plan) {
      const n = bom?.components.length ?? 0;
      return n > 0
        ? `Plan gata · ${n} piese CAD — vezi centrul`
        : "Plan gata — vezi răspunsul în centru";
    }
    return null;
  })();

  return (
    <div
      className="glass-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        borderLeft: '1px solid var(--caval-glass-border, rgba(255,255,255,0.08))',
        borderTop: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        borderRadius: 0,
      }}
    >
      {/* Header — top */}
      <div style={{
        padding: '14px 16px 12px',
        borderBottom: '1px solid var(--caval-glass-border, rgba(255,255,255,0.08))',
        flexShrink: 0,
        background: 'rgba(15, 17, 24, 0.35)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div className={loading ? 'glow-accent' : undefined} style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 8,
            background: loading ? 'var(--caval-accent)' : 'rgba(0,224,255,0.45)',
          }} />
          <div style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0, marginTop: 2,
            background: 'linear-gradient(135deg, #00E0FF22, #7C3AED22)',
            border: '1px solid rgba(0,224,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            <CavaloAiMark size={22} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', lineHeight: 1.25 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--caval-text)', letterSpacing: '0.02em' }}>
                ROBOTICS AI ENGINE
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                padding: '2px 7px', borderRadius: 4,
                background: 'rgba(124,58,237,0.25)', color: '#A78BFA',
              }}>
                ULTRA
              </span>
            </div>
            <div style={{
              fontSize: 11.5, color: 'var(--caval-text-muted)', lineHeight: 1.45, marginTop: 6,
            }}>
              {t('robotics.tagline')}
            </div>
          </div>
        </div>

        <div style={{ width: '100%', minWidth: 0 }}>
          <ChatModelSelect variant="stacked" catalog={catalog} loading={catalogLoading} />
        </div>

        {summaryLine && (
          <div style={{
            fontSize: 11.5, color: 'var(--caval-accent)', lineHeight: 1.45,
            padding: '6px 8px', borderRadius: 6,
            background: 'rgba(0,224,255,0.06)',
          }}>
            {summaryLine}
          </div>
        )}

        {warning && (
          <div style={{
            padding: '5px 8px', borderRadius: 5,
            background: 'rgba(212,168,87,0.08)', border: '1px solid rgba(212,168,87,0.2)',
            color: '#D4A857', fontSize: 11.5,
          }}>
            {warning}
          </div>
        )}

        {error && (
          <div style={{
            padding: '5px 8px', borderRadius: 5,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)',
            color: '#EF4444', fontSize: 11.5,
          }}>
            {error}
          </div>
        )}

        {localReadinessHint && (
          <div style={{
            padding: '5px 8px', borderRadius: 5,
            background: 'rgba(212,168,87,0.08)', border: '1px solid rgba(212,168,87,0.2)',
            color: '#D4A857', fontSize: 11, lineHeight: 1.45,
          }}>
            {localReadinessHint}
          </div>
        )}
      </div>

      {/* Spacer — pushes composer to bottom */}
      <div style={{ flex: 1, minHeight: 12 }} />

      {/* Composer — docked bottom */}
      <div style={{
        flexShrink: 0,
        padding: '12px 16px 14px',
        borderTop: '1px solid var(--caval-glass-border, rgba(255,255,255,0.08))',
        background: 'rgba(15, 17, 24, 0.45)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        {prompt.trim() && !loading && !project && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{
              maxWidth: '92%',
              padding: '8px 12px',
              borderRadius: 14,
              background: 'rgba(0,224,255,0.12)',
              border: '1px solid rgba(0,224,255,0.28)',
              color: 'var(--caval-text)',
              fontSize: 12,
              lineHeight: 1.5,
            }}>
              {prompt.trim()}
            </div>
          </div>
        )}

        <div
          className="glass-panel-interactive"
          style={{
            borderRadius: 12,
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              useRoboticsSessionStore.getState().setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Descrie piesa sau comanda pentru robot… (Ctrl+Enter)"
            rows={5}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'transparent', border: 'none',
              borderRadius: 8, padding: 12,
              color: 'var(--caval-text)', fontSize: 14,
              fontFamily: "'Inter', sans-serif",
              resize: 'vertical', outline: 'none',
              lineHeight: 1.5,
              minHeight: 120,
              maxHeight: 220,
            }}
          />
          <button
            type="button"
            aria-label={
              loading || cadBusy || batchBusy || cancelStatus === "aborting"
                ? "Oprește generarea Robotics"
                : "Generează plan Robotics"
            }
            disabled={
              cancelStatus === "aborting" || ((!loading && !cadBusy && !batchBusy) && !prompt.trim())
            }
            onClick={
              loading || cadBusy || batchBusy || cancelStatus === "aborting"
                ? handleStop
                : () => void handleGenerate()
            }
            className={!loading && !cadBusy && !batchBusy && prompt.trim() ? 'glow-accent' : undefined}
            style={{
              width: '100%', padding: '10px 0',
              borderRadius: 8, border: 'none',
              background: loading || cadBusy || batchBusy
                ? 'rgba(239,68,68,0.12)'
                : prompt.trim()
                  ? 'linear-gradient(135deg, rgba(0,224,255,0.95), rgba(0,180,220,0.9))'
                  : 'rgba(255,255,255,0.06)',
              color: loading || cadBusy || batchBusy
                ? '#EF4444'
                : prompt.trim() ? '#0E0E0F' : 'var(--caval-text-muted)',
              fontWeight: 700, fontSize: 13.5,
              cursor: ((!loading && !cadBusy && !batchBusy) && !prompt.trim()) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}
          >
            {loading || cadBusy || batchBusy || cancelStatus === "aborting" ? (
              <>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="3" width="10" height="10" rx="1.5" />
                </svg>
                {cancelStatus === "aborting" ? "Cancelling…" : "Oprește"}
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                {t('robotics.generate')}
              </>
            )}
          </button>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11,
          color: 'var(--caval-text-muted)',
          padding: '0 2px',
          gap: 8,
        }}>
          <span>
            <kbd style={{
              padding: '2px 6px', borderRadius: 4,
              background: 'rgba(255,255,255,0.08)', fontSize: 10.5,
            }}>Ctrl+Enter</kbd>
            {' '}trimite
          </span>
          <span>OpenSCAD & CAD Pipeline</span>
        </div>
      </div>
    </div>
  );
}
