import React, { useCallback, useEffect, useMemo, useState } from "react";

import type {
  Problem,
  ProblemSeverity,
  ProblemsApi,
  ProblemsSummary,
} from "../../../shared/problems-contract";
import { useEditorStore } from "../../store/editor-store";
import {
  mergeDiagnosticProblems,
  problemToEntry,
  revealProblem,
} from "../../store/problems-store";

const SEVERITY_ORDER: Record<ProblemSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
  hint: 3,
};

const SEVERITY_COLOR: Record<ProblemSeverity, string> = {
  error: "#EF4444",
  warning: "#F59E0B",
  info: "#78B9E0",
  hint: "#909090",
};

function getProblemsApi(): ProblemsApi | undefined {
  const caval = window.caval as { problems?: ProblemsApi } | undefined;
  return caval?.problems;
}

function severityIcon(severity: ProblemSeverity): string {
  if (severity === "error") return "✕";
  if (severity === "warning") return "⚠";
  return "ℹ";
}

export function ProblemsPanel({
  onSendToChat,
}: {
  onSendToChat?: (problem: Problem) => void;
}) {
  const projectPath = useEditorStore((s) => s.projectPath);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [summary, setSummary] = useState<ProblemsSummary | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<ProblemSeverity | "all">("all");
  const [filterFile, setFilterFile] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = getProblemsApi();
    if (!api) {
      setError("Problems API unavailable");
      return;
    }

    let cancelled = false;
    void api.getProblems().then((next) => {
      if (!cancelled) {
        setProblems(next);
        mergeDiagnosticProblems(next);
      }
    });
    void api.getSummary().then((next) => {
      if (!cancelled) setSummary(next);
    });

    const unsubscribeProblems = api.onProblemsChanged((next) => {
      if (cancelled) return;
      setProblems(next);
      mergeDiagnosticProblems(next);
    });
    const unsubscribeSummary = api.onSummaryChanged((next) => {
      if (!cancelled) setSummary(next);
    });

    return () => {
      cancelled = true;
      unsubscribeProblems();
      unsubscribeSummary();
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    const api = getProblemsApi();
    if (!api) return;
    setIsLoading(true);
    setError(null);
    try {
      await api.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Diagnostics failed");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!projectPath) return;
    void handleRefresh();
  }, [projectPath, handleRefresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onSaved = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void handleRefresh();
      }, 1000);
    };
    document.addEventListener("caval:file-saved", onSaved);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("caval:file-saved", onSaved);
    };
  }, [handleRefresh]);

  const handleProblemClick = useCallback(
    (problem: Problem) => {
      revealProblem(problemToEntry(problem), projectPath);
    },
    [projectPath]
  );

  const filteredProblems = useMemo(() => {
    const query = filterFile.trim().replace(/\\/g, "/").toLowerCase();
    return problems
      .filter((p) => filterSeverity === "all" || p.severity === filterSeverity)
      .filter((p) => !query || p.file.toLowerCase().includes(query))
      .sort((a, b) => {
        const bySev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (bySev !== 0) return bySev;
        const byFile = a.file.localeCompare(b.file);
        if (byFile !== 0) return byFile;
        return a.line - b.line || a.column - b.column;
      });
  }, [problems, filterSeverity, filterFile]);

  const groupedByFile = useMemo(() => {
    const groups: Array<{ file: string; items: Problem[] }> = [];
    const index = new Map<string, Problem[]>();
    for (const problem of filteredProblems) {
      let items = index.get(problem.file);
      if (!items) {
        items = [];
        index.set(problem.file, items);
        groups.push({ file: problem.file, items });
      }
      items.push(problem);
    }
    return groups;
  }, [filteredProblems]);

  return (
    <div
      role="region"
      aria-label="Problems"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 11.5,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderBottom: "1px solid var(--caval-border)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--caval-text)" }}>Problems</span>
        {summary && (
          <span style={{ color: "var(--caval-text-muted)", fontSize: 10.5 }}>
            <span style={{ color: "#EF4444" }}>{summary.errors} errors</span>
            {" · "}
            <span style={{ color: "#F59E0B" }}>{summary.warnings} warnings</span>
            {summary.infos > 0 ? ` · ${summary.infos} info` : ""}
          </span>
        )}
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={isLoading}
          aria-label="Refresh problems"
          data-testid="problems-refresh"
          style={{
            marginLeft: "auto",
            height: 22,
            padding: "0 8px",
            border: "1px solid var(--caval-border)",
            borderRadius: 4,
            background: "var(--caval-surface)",
            color: "var(--caval-text-muted)",
            cursor: isLoading ? "not-allowed" : "pointer",
            fontSize: 10.5,
            fontFamily: "inherit",
          }}
        >
          {isLoading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "6px 10px",
          borderBottom: "1px solid var(--caval-border)",
          flexShrink: 0,
        }}
      >
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value as ProblemSeverity | "all")}
          aria-label="Filter by severity"
          data-testid="problems-filter-severity"
          style={{
            height: 24,
            border: "1px solid var(--caval-border)",
            borderRadius: 4,
            background: "var(--caval-surface)",
            color: "var(--caval-text)",
            fontSize: 11,
            fontFamily: "inherit",
          }}
        >
          <option value="all">All severities</option>
          <option value="error">Errors</option>
          <option value="warning">Warnings</option>
          <option value="info">Info</option>
          <option value="hint">Hints</option>
        </select>
        <input
          type="search"
          placeholder="Filter by file…"
          value={filterFile}
          onChange={(e) => setFilterFile(e.target.value)}
          aria-label="Filter by file"
          data-testid="problems-filter-file"
          style={{
            flex: 1,
            minWidth: 0,
            height: 24,
            padding: "0 8px",
            border: "1px solid var(--caval-border)",
            borderRadius: 4,
            background: "var(--caval-surface)",
            color: "var(--caval-text)",
            fontSize: 11,
            fontFamily: "inherit",
          }}
        />
      </div>

      {error && (
        <div role="alert" style={{ padding: "6px 10px", color: "#EF4444", fontSize: 11 }}>
          {error}
        </div>
      )}

      <div role="list" data-testid="problems-list" style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
        {groupedByFile.map(({ file, items }) => (
          <div key={file} className="problems-file-group" data-testid="problems-file-group">
            <div
              style={{
                padding: "4px 14px",
                color: "var(--caval-text-muted)",
                fontSize: 10.5,
                position: "sticky",
                top: 0,
                background: "#09090A",
              }}
            >
              {file}
              <span style={{ marginLeft: 8, opacity: 0.7 }}>{items.length}</span>
            </div>
            {items.map((problem) => (
              <div
                key={problem.id}
                style={{ display: "flex", alignItems: "center" }}
              >
                <button
                  type="button"
                  role="listitem"
                  data-testid="problem-item"
                  data-file={problem.file}
                  data-line={String(problem.line)}
                  data-column={String(problem.column)}
                  className={`problem-item problem-item-${problem.severity}`}
                  onClick={() => handleProblemClick(problem)}
                  style={{
                    display: "flex",
                    flex: 1,
                    minWidth: 0,
                    textAlign: "left",
                    gap: 8,
                    padding: "5px 14px",
                    border: "none",
                    background: "transparent",
                    color: SEVERITY_COLOR[problem.severity],
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "inherit",
                  }}
                >
                  <span style={{ flexShrink: 0 }}>{severityIcon(problem.severity)}</span>
                  <span style={{ color: "var(--caval-text-muted)", flexShrink: 0 }}>
                    {problem.line}:{problem.column}
                  </span>
                  <span
                    style={{
                      color: "var(--caval-text)",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {problem.message}
                  </span>
                  {problem.code && (
                    <span style={{ color: "var(--caval-text-muted)", flexShrink: 0 }}>
                      {problem.code}
                    </span>
                  )}
                </button>
                {onSendToChat && (
                <button
                  type="button"
                  title="Trimite în chat"
                  onClick={() => onSendToChat(problem)}
                  style={{
                    flexShrink: 0,
                    marginRight: 4,
                    border: "1px solid var(--caval-border)",
                    borderRadius: 4,
                    background: "rgba(0,224,255,0.06)",
                    color: "var(--caval-accent)",
                    cursor: "pointer",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    padding: "2px 8px",
                  }}
                >
                  Chat
                </button>
                )}
                {(problem.severity === "error" || problem.severity === "warning") && (
                <button
                  type="button"
                  title="Fix with AI"
                  data-testid="problem-fix-with-ai"
                  onClick={(e) => {
                    e.stopPropagation();
                    void import("../../ai/quick-fix-controller.js").then((m) =>
                      m.startQuickFixForProblem(problem)
                    );
                  }}
                  style={{
                    flexShrink: 0,
                    marginRight: 8,
                    border: "1px solid rgba(0,224,255,0.35)",
                    borderRadius: 4,
                    background: "rgba(0,224,255,0.1)",
                    color: "var(--caval-accent)",
                    cursor: "pointer",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    padding: "2px 8px",
                  }}
                >
                  Fix AI
                </button>
                )}
              </div>
            ))}
          </div>
        ))}
        {filteredProblems.length === 0 && (
          <div data-testid="problems-empty" style={{ padding: "8px 14px", color: "var(--caval-text-muted)" }}>
            <p style={{ margin: "0 0 8px" }}>No problems found.</p>
            <button
              type="button"
              data-testid="problems-run"
              onClick={() => void handleRefresh()}
              disabled={isLoading}
              style={{
                height: 24,
                padding: "0 10px",
                border: "1px solid var(--caval-border)",
                borderRadius: 4,
                background: "rgba(0,224,255,0.08)",
                color: "var(--caval-accent)",
                cursor: "pointer",
                fontSize: 11,
                fontFamily: "inherit",
              }}
            >
              Run diagnostics
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
