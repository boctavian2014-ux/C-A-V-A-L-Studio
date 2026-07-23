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
import { createSectionCollector } from '../../../../ai/engineering/streaming-sections';
import { checkModelReadiness, type ModelReadiness } from '../../../../ai/models/model-readiness';
import { useEngineeringCadStore } from '../../store/engineering-cad-store';
import { useRoboticsSessionStore } from '../../store/robotics-session-store';
import { CavaloAiMark } from '../brand/CavaloHorseMark';

// ──────────────────────────────────────────────────────────────
//  Robotics AI ULTRA — composer (dreapta); răspunsul e în centru
// ──────────────────────────────────────────────────────────────

export function EngineeringAIPanel() {
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

  const [localReadinessHint, setLocalReadinessHint] = useState<string | null>(null);
  const [, setReadiness] = useState<ModelReadiness | null>(null);
  const [openRouterConfigured, setOpenRouterConfigured] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const collectorRef = useRef(createSectionCollector());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadModelLabels();
  }, [loadModelLabels]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [settingsRes, secretsRes] = await Promise.all([
        window.caval.settingsLoad?.(),
        window.caval.secretsGet?.(),
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
  }) => {
    const s = useRoboticsSessionStore.getState();
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    collectorRef.current.finish();
    // End loading as soon as plan is ready (before BOM decompose).
    // Do not abortChat here — stream already finished; aborting mid-decompose is wrong.
    s.finalizeStream({ callAbortChat: false, abortSignal: false });

    if (partial.ok && partial.project) {
      s.setProject(partial.project);
      s.setPlan(partial.plan ?? null);
      if (partial.bom !== undefined) s.setBom(partial.bom ?? null);
      s.setWarning(partial.warning ?? null);
      s.setError(null);
      if (!s.userTabLocked) {
        s.setActiveTab(partial.bom?.components?.length ? 'cad' : 'overview');
      }
    } else if (!partial.ok) {
      s.setWarning(null);
      s.setError(partial.error ?? 'Generare eșuată.');
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    const session = useRoboticsSessionStore.getState();
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

    useEngineeringCadStore.getState().clearCadPreview();
    session.beginGenerate();
    setLocalReadinessHint(null);
    collectorRef.current.reset();

    const controller = new AbortController();
    abortRef.current = controller;
    let planReadyFired = false;

    const flushPartial = (accumulated: string) => {
      const snap = collectorRef.current.snapshot();
      useRoboticsSessionStore.getState().setStreamProgress(snap);
      if (!accumulated.trim()) return;
      const partialPlan = parseRoboticsPlan(accumulated);
      useRoboticsSessionStore.getState().setPlan(partialPlan);
      try {
        useRoboticsSessionStore.getState().setProject(roboticsPlanToEngProject(partialPlan));
      } catch {
        /* partial */
      }
    };

    let accumulated = '';
    const scheduleFlush = () => {
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        flushPartial(accumulated);
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
          useRoboticsSessionStore.getState().setStreamId(id);
        },
        onDelta: (chunk) => {
          accumulated += chunk;
          collectorRef.current.push(chunk);
          scheduleFlush();
        },
        onPlanReady: (partial) => {
          planReadyFired = true;
          applyPlanReady(partial);
        },
      });

      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      collectorRef.current.finish();

      if (controller.signal.aborted) return;

      // BOM / final warning after decompose (loading already off via onPlanReady).
      if (result.ok && result.project) {
        const s = useRoboticsSessionStore.getState();
        s.setProject(result.project);
        s.setPlan(result.plan ?? null);
        s.setBom(result.bom ?? null);
        s.setWarning(result.warning ?? null);
        s.setError(null);
        if (!s.userTabLocked && result.bom?.components.length) {
          s.setActiveTab('cad');
        }
      } else if (!planReadyFired) {
        applyPlanReady({
          ok: false,
          error: result.error ?? 'Generare eșuată.',
        });
      } else if (!result.ok) {
        useRoboticsSessionStore.getState().setError(result.error ?? 'Generare eșuată.');
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        useRoboticsSessionStore.getState().setError(
          err instanceof Error ? err.message : String(err)
        );
      }
    } finally {
      abortRef.current = null;
      // Always clear loading when generateEngineering settles (plan, error, or hang end).
      useRoboticsSessionStore.getState().finalizeStream({
        callAbortChat: true,
        abortSignal: false,
      });
    }
  }, [prompt, selectedModel, apiKeys, openRouterConfigured, projectPath, applyPlanReady]);

  const handleStop = useCallback(() => {
    useRoboticsSessionStore.getState().finalizeStream({
      abortController: abortRef.current,
      callAbortChat: true,
      abortSignal: true,
    });
    abortRef.current = null;
    void useEngineeringCadStore.getState().cancelCadJob();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleGenerate();
    }
  };

  const summaryLine = (() => {
    if (loading) return 'Generez… răspunsul apare în centru';
    if (project && plan) {
      const n = bom?.components.length ?? 0;
      return n > 0
        ? `Plan gata · ${n} piese CAD — vezi centrul`
        : 'Plan gata — vezi răspunsul în centru';
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
              Roboți · vehicule · mecanisme · componente · CAD · fabricare
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
            onClick={loading ? handleStop : () => void handleGenerate()}
            disabled={!loading && !prompt.trim()}
            className={!loading && prompt.trim() ? 'glow-accent' : undefined}
            style={{
              width: '100%', padding: '10px 0',
              borderRadius: 8, border: 'none',
              background: loading
                ? 'rgba(239,68,68,0.12)'
                : prompt.trim()
                  ? 'linear-gradient(135deg, rgba(0,224,255,0.95), rgba(0,180,220,0.9))'
                  : 'rgba(255,255,255,0.06)',
              color: loading
                ? '#EF4444'
                : prompt.trim() ? '#0E0E0F' : 'var(--caval-text-muted)',
              fontWeight: 700, fontSize: 13.5,
              cursor: (!loading && !prompt.trim()) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}
          >
            {loading ? (
              <>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="3" width="10" height="10" rx="1.5" />
                </svg>
                Oprește
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                Generează
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
