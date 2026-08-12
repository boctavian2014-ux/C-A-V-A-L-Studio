import React, { useCallback, useEffect, useState } from "react";

import type { ProjectHealthCheckItem, ProjectHealthStatus } from "../../../shared/project-health-check";
import {
  healthStatusLabel,
  PROJECT_HEALTH_UI_SAFETY_TIMEOUT_MS,
} from "../../../shared/project-health-check";
import { useEditorStore } from "../../store/editor-store";

const STATUS_COLOR: Record<ProjectHealthStatus, string> = {
  available: "#22c55e",
  missing: "#94a3b8",
  running: "#38bdf8",
  passed: "#22c55e",
  failed: "#ef4444",
  skipped: "#64748b",
  timed_out: "#f97316",
};

function StatusBadge({ status }: { status: ProjectHealthStatus }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: STATUS_COLOR[status],
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: STATUS_COLOR[status],
          boxShadow:
            status === "available" || status === "passed"
              ? `0 0 8px ${STATUS_COLOR[status]}`
              : undefined,
        }}
      />
      {healthStatusLabel(status)}
    </span>
  );
}

function shouldShowOutput(status: ProjectHealthStatus): boolean {
  return status === "failed" || status === "timed_out";
}

export function ProjectHealthPanel() {
  const { projectPath } = useEditorStore();
  const [checks, setChecks] = useState<ProjectHealthCheckItem[]>([]);
  const [packageFound, setPackageFound] = useState(true);
  const [packageName, setPackageName] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (action: "scan" | "execute") => {
    if (!projectPath) {
      setChecks([]);
      setPackageFound(false);
      setPackageName(undefined);
      return;
    }
    setError(null);
    let uiTimedOut = false;
    let safetyTimer: ReturnType<typeof setTimeout> | undefined;
    if (action === "execute") {
      setRunning(true);
      setChecks((prev) =>
        prev.map((check) =>
          check.status === "available" ? { ...check, status: "running" } : check
        )
      );
      safetyTimer = setTimeout(() => {
        uiTimedOut = true;
        setRunning(false);
        setError(
          "Main process nu a răspuns la Project Health (timeout UI de siguranță). Verificările pot continua în fundal."
        );
        setChecks((prev) =>
          prev.map((check) =>
            check.status === "running" ? { ...check, status: "timed_out" } : check
          )
        );
      }, PROJECT_HEALTH_UI_SAFETY_TIMEOUT_MS);
    } else {
      setLoading(true);
    }
    try {
      const res = await window.caval.projectHealthCheck?.(action);
      if (uiTimedOut) return;
      if (!res?.ok) {
        setError(res?.error ?? "Health check failed");
        return;
      }
      setChecks(res.snapshot?.checks ?? []);
      setPackageFound(res.snapshot?.packageFound ?? false);
      setPackageName(res.snapshot?.packageName);
    } catch (err) {
      if (uiTimedOut) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (safetyTimer) clearTimeout(safetyTimer);
      setLoading(false);
      if (!uiTimedOut) setRunning(false);
    }
  }, [projectPath]);

  useEffect(() => {
    void refresh("scan");
  }, [refresh]);

  return (
    <div style={{ padding: "4px 2px 24px", maxWidth: 560 }}>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--caval-text-muted)", lineHeight: 1.5 }}>
        Verifică dacă proiectul deschis definește scripturile standard din{" "}
        <code style={{ fontSize: 11 }}>package.json</code> (typecheck, lint, test, build).
        Statusul <strong>Available</strong> înseamnă script disponibil; rulează verificările pentru a detecta{" "}
        <strong>Passed</strong>, <strong>Failed</strong> sau <strong>Timed out</strong>.
      </p>

      {!projectPath && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--caval-text-muted)" }}>
          Deschide un folder de proiect pentru Project Health Check.
        </p>
      )}

      {projectPath && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              disabled={loading || running}
              onClick={() => void refresh("scan")}
              style={{
                fontSize: 11,
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--caval-border)",
                background: "var(--caval-surface)",
                color: "var(--caval-text)",
                cursor: loading || running ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Scanare…" : "Re-scanează scripturi"}
            </button>
            <button
              type="button"
              disabled={loading || running || !packageFound}
              onClick={() => void refresh("execute")}
              style={{
                fontSize: 11,
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid rgba(0, 224, 255, 0.35)",
                background: "rgba(0, 224, 255, 0.08)",
                color: "var(--caval-accent)",
                cursor: loading || running || !packageFound ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              {running ? "Rulează verificări…" : "Rulează verificări"}
            </button>
          </div>

          {packageFound && packageName && (
            <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--caval-text-muted)" }}>
              Pachet: <span style={{ fontFamily: "monospace" }}>{packageName}</span>
            </p>
          )}

          {!packageFound && (
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "#ef4444" }}>
              Nu există <code>package.json</code> în workspace-ul deschis.
            </p>
          )}

          {error && (
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "#ef4444" }}>{error}</p>
          )}

          <div
            style={{
              display: "grid",
              gap: 8,
              border: "1px solid var(--caval-border)",
              borderRadius: 10,
              overflow: "hidden",
              background: "var(--caval-surface)",
            }}
          >
            {checks.map((check) => (
              <div
                key={check.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  alignItems: "start",
                  padding: "10px 12px",
                  borderBottom: "1px solid var(--caval-border)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--caval-text)" }}>
                    {check.label}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      color: "var(--caval-text-muted)",
                      marginTop: 3,
                      wordBreak: "break-all",
                    }}
                  >
                    {check.script ?? check.npmCommand}
                  </div>
                  {shouldShowOutput(check.status) && check.output && (
                    <pre
                      style={{
                        margin: "8px 0 0",
                        padding: 8,
                        fontSize: 10,
                        lineHeight: 1.45,
                        maxHeight: 120,
                        overflow: "auto",
                        background:
                          check.status === "timed_out"
                            ? "rgba(249, 115, 22, 0.06)"
                            : "rgba(239, 68, 68, 0.06)",
                        border:
                          check.status === "timed_out"
                            ? "1px solid rgba(249, 115, 22, 0.2)"
                            : "1px solid rgba(239, 68, 68, 0.2)",
                        borderRadius: 6,
                        whiteSpace: "pre-wrap",
                        color: "var(--caval-text-muted)",
                      }}
                    >
                      {check.output}
                    </pre>
                  )}
                </div>
                <StatusBadge status={check.status} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
