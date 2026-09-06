import React, { useEffect, useState } from 'react';
import type {
  PrintSuggestion,
  StlAnalysis,
} from '../../../shared/stl-print-analysis';

export interface AiPrintAssistantProps {
  /** Preferred: in-memory STL from CAD store. */
  stlBase64?: string | null;
  /** Fallback: fetch via cad.fetchStl when only a URL is available. */
  stlUrl?: string | null;
  onApplySettings: (suggestions: PrintSuggestion) => void;
  onModifyManually?: () => void;
}

function scoreTone(score: number): { bg: string; label: string } {
  if (score >= 80) return { bg: 'rgba(52,211,153,0.25)', label: 'excelent' };
  if (score >= 60) return { bg: 'rgba(132,204,22,0.25)', label: 'bun' };
  if (score >= 40) return { bg: 'rgba(245,158,11,0.25)', label: 'mediu' };
  return { bg: 'rgba(239,68,68,0.25)', label: 'dificil' };
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

/**
 * Local CPU print suggestions from STL geometry (main-process IPC).
 * No GPU / cloud analysis.
 */
export function AiPrintAssistant({
  stlBase64,
  stlUrl,
  onApplySettings,
  onModifyManually,
}: AiPrintAssistantProps) {
  const [analysis, setAnalysis] = useState<StlAnalysis | null>(null);
  const [suggestions, setSuggestions] = useState<PrintSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setError(null);
      setAnalysis(null);
      setSuggestions(null);

      let base64 = stlBase64?.trim() || '';
      if (!base64 && stlUrl?.trim() && window.caval?.cad?.fetchStl) {
        setLoading(true);
        const fetched = await window.caval.cad.fetchStl({ url: stlUrl });
        if (!fetched.ok || !fetched.base64) {
          if (!cancelled) {
            setError(fetched.error ?? 'Nu am putut încărca STL-ul');
            setLoading(false);
          }
          return;
        }
        base64 = fetched.base64;
      }

      if (!base64) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (!window.caval?.cad?.analyzeStlPrint) {
        if (!cancelled) {
          setError('AI Print Assistant indisponibil în acest build');
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const result = await window.caval.cad.analyzeStlPrint({ base64 });
        if (cancelled) return;
        if (!result.ok || !result.analysis || !result.suggestions) {
          setError(result.error ?? 'Analiza STL a eșuat');
          return;
        }
        setAnalysis(result.analysis);
        setSuggestions(result.suggestions);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [stlBase64, stlUrl]);

  if (!stlBase64 && !stlUrl) {
    return (
      <div
        data-testid="ai-print-assistant-empty"
        style={{
          marginTop: 10,
          padding: '12px 12px',
          borderRadius: 8,
          border: '1px dashed var(--caval-border)',
          color: 'var(--caval-text-muted)',
          fontSize: 12,
          textAlign: 'center',
        }}
      >
        Generează un STL pentru analiza locală AI Print (CPU).
      </div>
    );
  }

  if (loading) {
    return (
      <div
        data-testid="ai-print-assistant-loading"
        style={{
          marginTop: 10,
          padding: '14px 12px',
          borderRadius: 8,
          border: '1px solid var(--caval-border)',
          background: 'rgba(255,255,255,0.03)',
          color: 'var(--caval-text-muted)',
          fontSize: 12,
          textAlign: 'center',
        }}
      >
        Analizez geometria STL pe CPU…
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="ai-print-assistant-error"
        style={{
          marginTop: 10,
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid rgba(239,68,68,0.35)',
          background: 'rgba(239,68,68,0.08)',
          color: '#EF4444',
          fontSize: 12,
        }}
      >
        {error}
      </div>
    );
  }

  if (!analysis || !suggestions) return null;

  const tone = scoreTone(analysis.printabilityScore);
  const sectionStyle: React.CSSProperties = {
    padding: '10px 10px',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--caval-border)',
    marginBottom: 8,
  };

  return (
    <div
      data-testid="ai-print-assistant"
      style={{
        marginTop: 10,
        padding: '12px 12px',
        borderRadius: 10,
        border: '1px solid var(--caval-border)',
        background: 'rgba(255,255,255,0.03)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          paddingBottom: 10,
          borderBottom: '1px solid var(--caval-border)',
        }}
      >
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--caval-text)', flex: 1 }}>
          AI Print Assistant
          <span style={{ display: 'block', fontWeight: 500, fontSize: 11, color: 'var(--caval-text-muted)' }}>
            Analiză locală CPU · fără cloud/GPU
          </span>
        </div>
        <span
          title={tone.label}
          style={{
            padding: '3px 8px',
            borderRadius: 999,
            background: tone.bg,
            color: 'var(--caval-text)',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {analysis.printabilityScore}/100
        </span>
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--caval-text)', marginBottom: 4 }}>
          Orientare
        </div>
        <div style={{ fontSize: 12, color: 'var(--caval-text-muted)', lineHeight: 1.45 }}>
          X {suggestions.orientation.rotationX}° · Y {suggestions.orientation.rotationY}° · Z{' '}
          {suggestions.orientation.rotationZ}°
          <div style={{ marginTop: 4, fontStyle: 'italic' }}>{suggestions.orientation.reason}</div>
          {suggestions.orientation.supportReductionPercent > 0 ? (
            <div style={{ marginTop: 4, color: '#34D399' }}>
              Reduce suporturi cu ~{suggestions.orientation.supportReductionPercent}%
            </div>
          ) : null}
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--caval-text)', marginBottom: 4 }}>
          Layer height
        </div>
        <div style={{ fontSize: 12, color: 'var(--caval-text-muted)', lineHeight: 1.45 }}>
          Recomandat: <strong style={{ color: 'var(--caval-text)' }}>{suggestions.layerHeight.recommended} mm</strong>
          {' '}({suggestions.layerHeight.min}–{suggestions.layerHeight.max})
          <div style={{ marginTop: 4, fontStyle: 'italic' }}>{suggestions.layerHeight.reason}</div>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--caval-text)', marginBottom: 4 }}>
          Infill
        </div>
        <div style={{ fontSize: 12, color: 'var(--caval-text-muted)', lineHeight: 1.45 }}>
          <strong style={{ color: 'var(--caval-text)' }}>{suggestions.infill.pattern}</strong>
          {' · '}
          <strong style={{ color: 'var(--caval-text)' }}>{suggestions.infill.density}%</strong>
          <div style={{ marginTop: 4, fontStyle: 'italic' }}>{suggestions.infill.reason}</div>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--caval-text)', marginBottom: 4 }}>
          Supports
        </div>
        <div style={{ fontSize: 12, color: 'var(--caval-text-muted)', lineHeight: 1.45 }}>
          {suggestions.supports.needed ? (
            <>
              Necesare ({suggestions.supports.type}) · threshold {suggestions.supports.overhangThreshold}°
            </>
          ) : (
            'Nu sunt necesare'
          )}
          <div style={{ marginTop: 4, fontStyle: 'italic' }}>{suggestions.supports.reason}</div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 12,
          padding: '10px 10px',
          borderRadius: 8,
          background: 'rgba(0,224,255,0.06)',
          border: '1px solid rgba(0,224,255,0.18)',
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: 'var(--caval-text-muted)' }}>Timp estimat</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--caval-text)' }}>
            {formatTime(suggestions.estimatedPrintTimeMinutes)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--caval-text-muted)' }}>Material</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--caval-text)' }}>
            ~{suggestions.estimatedMaterialGrams} g
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--caval-text-muted)' }}>Triunghiuri</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--caval-text)' }}>
            {analysis.triangleCount}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          data-testid="ai-print-apply"
          onClick={() => onApplySettings(suggestions)}
          style={{
            flex: 1,
            padding: '9px 0',
            borderRadius: 6,
            border: 'none',
            background: 'rgba(0,224,255,0.9)',
            color: '#0E0E0F',
            fontWeight: 700,
            fontSize: 12.5,
            cursor: 'pointer',
          }}
        >
          Aplică sugestiile
        </button>
        {onModifyManually ? (
          <button
            type="button"
            onClick={onModifyManually}
            style={{
              padding: '9px 12px',
              borderRadius: 6,
              border: '1px solid var(--caval-border)',
              background: 'transparent',
              color: 'var(--caval-text-muted)',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Modifică
          </button>
        ) : null}
      </div>
    </div>
  );
}
