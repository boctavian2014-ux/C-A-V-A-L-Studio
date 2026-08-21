import React, { useCallback, useEffect, useState } from "react";

import {
  statusLabel,
  type AiProviderEntry,
  type AiProviderId,
  type ProviderStatus,
} from "../../src/shared/ai-provider-contract";
import {
  DEFAULT_OLLAMA_MODEL_ID,
  formatApproxBytes,
  OLLAMA_INSTALL_APPROX_BYTES,
  OLLAMA_MODEL_SIZES,
  type LocalAiStatus,
  type OllamaModelPullProgress,
} from "../../src/shared/local-ai-contract";
import { filterNonEmptySecretsPatch } from "../models/api-secrets";

function statusTone(status: ProviderStatus): string {
  switch (status) {
    case "configured":
      return "var(--caval-success, #3dd68c)";
    case "starting":
      return "var(--caval-warning, #e6b450)";
    case "model-missing":
    case "not-installed":
    case "unavailable":
      return "var(--caval-danger, #f07178)";
    default:
      return "var(--caval-text-muted)";
  }
}

function confirmAction(title: string, message: string): boolean {
  return window.confirm(`${title}\n\n${message}`);
}

const btnStyle: React.CSSProperties = {
  fontSize: 11,
  padding: "6px 10px",
  borderRadius: 4,
  border: "1px solid var(--caval-border)",
  background: "var(--caval-accent)",
  color: "#0E0E0F",
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontWeight: 700,
};

export interface OllamaProviderRowProps {
  status: LocalAiStatus | null;
  providerStatus: ProviderStatus;
  onStatusMaybeChanged?: () => void;
}

/** Pas 7f.3 — separate Install Ollama vs Download model actions. */
export function OllamaProviderRow({
  status,
  providerStatus,
  onStatusMaybeChanged,
}: OllamaProviderRowProps): React.ReactElement {
  const [installing, setInstalling] = useState(false);
  const [pullProgress, setPullProgress] = useState<OllamaModelPullProgress | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const modelMeta = OLLAMA_MODEL_SIZES[DEFAULT_OLLAMA_MODEL_ID];
  const phase = status?.phase ?? (providerStatus === "not-installed" ? "not-installed" : providerStatus === "model-missing" ? "model-missing" : undefined);
  const downloading =
    pullProgress?.status === "downloading" || pullProgress?.status === "verifying";

  const handleInstall = async () => {
    setActionError(null);
    const confirmed = confirmAction(
      "Install Ollama?",
      `This downloads and runs the official Ollama installer (${formatApproxBytes(OLLAMA_INSTALL_APPROX_BYTES)} disk space). Continue?`
    );
    if (!confirmed) return;
    setInstalling(true);
    try {
      const result = await window.caval?.localAiInstall?.({ confirmed: true });
      if (!result?.success) {
        setActionError(result?.error ?? "Install failed");
      }
      onStatusMaybeChanged?.();
    } finally {
      setInstalling(false);
    }
  };

  const handleDownloadModel = async () => {
    setActionError(null);
    const label = modelMeta?.label ?? DEFAULT_OLLAMA_MODEL_ID;
    const size = formatApproxBytes(modelMeta?.approxBytes ?? 4_700_000_000);
    const confirmed = confirmAction(
      `Download ${label}?`,
      `This downloads approximately ${size}. Continue?`
    );
    if (!confirmed) return;

    const unsubscribe = window.caval?.onLocalAiPullProgress?.((p) => {
      setPullProgress(p);
    });
    try {
      const result = await window.caval?.localAiPullModel?.({
        modelId: DEFAULT_OLLAMA_MODEL_ID,
        confirmed: true,
      });
      if (result?.cancelled) {
        setPullProgress({
          modelId: DEFAULT_OLLAMA_MODEL_ID,
          status: "cancelled",
          completedBytes: 0,
          totalBytes: 0,
          percent: 0,
        });
      } else if (!result?.success) {
        setActionError(result?.error ?? "Download failed");
      } else {
        setPullProgress({
          modelId: DEFAULT_OLLAMA_MODEL_ID,
          status: "done",
          completedBytes: modelMeta?.approxBytes ?? 0,
          totalBytes: modelMeta?.approxBytes ?? 0,
          percent: 100,
        });
      }
      onStatusMaybeChanged?.();
    } finally {
      unsubscribe?.();
    }
  };

  const handleCancel = () => {
    void window.caval?.localAiPullCancel?.(DEFAULT_OLLAMA_MODEL_ID);
  };

  return (
    <div
      data-testid="ollama-provider-actions"
      style={{ marginTop: 10, marginLeft: 26, display: "flex", flexDirection: "column", gap: 8 }}
    >
      {phase === "not-installed" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--caval-text-muted)" }}>
            Ollama is not installed ({formatApproxBytes(OLLAMA_INSTALL_APPROX_BYTES)})
          </span>
          <button
            type="button"
            data-testid="ollama-install-btn"
            onClick={() => void handleInstall()}
            disabled={installing}
            style={{ ...btnStyle, cursor: installing ? "wait" : "pointer", opacity: installing ? 0.7 : 1 }}
          >
            {installing ? "Installing…" : "Install Ollama"}
          </button>
        </div>
      )}

      {phase === "model-missing" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--caval-text-muted)" }}>
            Model not downloaded: {status?.defaultModel ?? DEFAULT_OLLAMA_MODEL_ID}
          </span>
          {downloading ? (
            <div data-testid="ollama-pull-progress" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <progress value={pullProgress?.percent ?? 0} max={100} style={{ flex: 1, minWidth: 120 }} />
              <span style={{ fontSize: 11, color: "var(--caval-text)" }}>
                {pullProgress?.percent ?? 0}%
                {pullProgress && pullProgress.totalBytes > 0
                  ? ` (${formatApproxBytes(pullProgress.completedBytes)} / ${formatApproxBytes(pullProgress.totalBytes)})`
                  : ""}
              </span>
              <button
                type="button"
                data-testid="ollama-pull-cancel-btn"
                onClick={handleCancel}
                style={{ ...btnStyle, background: "transparent", color: "var(--caval-text)" }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="ollama-download-model-btn"
              onClick={() => void handleDownloadModel()}
              style={btnStyle}
            >
              Download {modelMeta?.label ?? "model"} ({formatApproxBytes(modelMeta?.approxBytes ?? 0)})
            </button>
          )}
        </div>
      )}

      {phase !== "not-installed" && phase !== "model-missing" && status && (
        <span style={{ fontSize: 11, color: "var(--caval-text-muted)" }}>
          Ollama — {status.phase}
          {status.defaultModelReady ? ` · ${status.defaultModel}` : ""}
        </span>
      )}

      {actionError && (
        <span role="alert" style={{ fontSize: 11, color: "var(--caval-danger)" }}>
          {actionError}
        </span>
      )}
    </div>
  );
}

export function AiProvidersPanel(): React.ReactElement {
  const [providers, setProviders] = useState<AiProviderEntry[]>([]);
  const [preferred, setPreferred] = useState<AiProviderId>("ollama");
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [localAiStatus, setLocalAiStatus] = useState<LocalAiStatus | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, localRes] = await Promise.all([
        window.caval?.aiProvidersList?.(),
        window.caval?.localAiStatus?.(),
      ]);
      if (!res?.ok || !res.providers) {
        setError(res?.error ?? "Failed to load providers");
        return;
      }
      setProviders(res.providers);
      setPreferred(res.preferredProviderId ?? "ollama");
      setEncryptionAvailable(res.encryptionAvailable !== false);
      if (localRes?.ok && localRes.status) {
        setLocalAiStatus(localRes.status);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = window.caval?.localAiOnStatusChanged?.((status) => {
      setLocalAiStatus(status);
      void refresh();
    });
    return () => {
      unsubscribe?.();
    };
  }, [refresh]);

  const selectProvider = async (id: AiProviderId, selectable: boolean) => {
    if (!selectable) return;
    setMessage(null);
    const res = await window.caval?.aiProvidersSetPreferred?.({ providerId: id });
    if (!res?.ok) {
      setMessage(res?.error ?? "Could not set preferred provider");
      return;
    }
    setPreferred(res.preferredProviderId ?? id);
  };

  const saveApiKey = async (entry: AiProviderEntry) => {
    if (!entry.secretKey) return;
    const raw = keyDrafts[entry.secretKey] ?? "";
    const { filtered } = filterNonEmptySecretsPatch({ [entry.secretKey]: raw });
    if (!filtered[entry.secretKey]) {
      setMessage("Enter an API key before saving.");
      return;
    }
    setBusyKey(entry.secretKey);
    setMessage(null);
    try {
      const res = await window.caval?.secretsSet?.(filtered);
      if (!res?.ok) {
        setMessage("Failed to save API key.");
        return;
      }
      setKeyDrafts((prev) => ({ ...prev, [entry.secretKey!]: "" }));
      setMessage(`${entry.label} key saved.`);
      await refresh();
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div data-testid="ai-providers-panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!encryptionAvailable && (
        <div
          role="alert"
          data-testid="ai-providers-encryption-warning"
          style={{
            padding: "10px 12px",
            borderRadius: 6,
            border: "1px solid var(--caval-warning, #e6b450)",
            background: "color-mix(in oklch, var(--caval-warning, #e6b450) 12%, transparent)",
            color: "var(--caval-text)",
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          Key storage is not encrypted on this system.
        </div>
      )}

      {loading && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--caval-text-muted)" }}>Loading providers…</p>
      )}
      {error && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--caval-danger)" }}>{error}</p>
      )}
      {message && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--caval-accent)" }} role="status">
          {message}
        </p>
      )}

      <div role="radiogroup" aria-label="AI Providers" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {providers.map((entry) => {
          const selected = preferred === entry.id;
          const disabled = !entry.selectable || Boolean(entry.comingSoon);
          return (
            <div
              key={entry.id}
              data-testid={`ai-provider-row-${entry.id}`}
              style={{
                border: `1px solid ${selected ? "var(--caval-accent)" : "var(--caval-border)"}`,
                borderRadius: 8,
                padding: "10px 12px",
                opacity: disabled ? 0.65 : 1,
                background: "var(--caval-surface-raised, transparent)",
              }}
            >
              <label
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
              >
                <input
                  type="radio"
                  name="ai-preferred-provider"
                  value={entry.id}
                  checked={selected}
                  disabled={disabled}
                  aria-label={entry.label}
                  data-testid={`ai-provider-radio-${entry.id}`}
                  onChange={() => void selectProvider(entry.id, entry.selectable)}
                  style={{ marginTop: 3 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 13 }}>
                      {entry.id === "ollama" ? "Ollama Local & Free" : entry.label}
                    </strong>
                    <span
                      data-testid={`ai-provider-status-${entry.id}`}
                      style={{ fontSize: 11, color: statusTone(entry.status), fontWeight: 600 }}
                    >
                      {entry.comingSoon ? "Coming soon" : statusLabel(entry.status)}
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--caval-text-muted)", lineHeight: 1.4 }}>
                    {entry.description}
                  </p>
                  {entry.detail && (
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--caval-text)" }}>{entry.detail}</p>
                  )}
                </div>
              </label>

              {entry.id === "ollama" && (
                <OllamaProviderRow
                  status={localAiStatus}
                  providerStatus={entry.status}
                  onStatusMaybeChanged={() => void refresh()}
                />
              )}

              {entry.secretKey && !entry.comingSoon && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 10,
                    marginLeft: 26,
                    alignItems: "center",
                  }}
                >
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder={entry.status === "configured" ? "••••••••••••••••" : "Add API key"}
                    aria-label={`API key for ${entry.label}`}
                    data-testid={`ai-provider-key-${entry.id}`}
                    value={keyDrafts[entry.secretKey] ?? ""}
                    onChange={(e) =>
                      setKeyDrafts((prev) => ({ ...prev, [entry.secretKey!]: e.target.value }))
                    }
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 12,
                      padding: "6px 8px",
                      borderRadius: 4,
                      border: "1px solid var(--caval-border)",
                      background: "var(--caval-bg, #0e0e0f)",
                      color: "var(--caval-text)",
                    }}
                  />
                  <button
                    type="button"
                    data-testid={`ai-provider-save-key-${entry.id}`}
                    disabled={busyKey === entry.secretKey}
                    onClick={() => void saveApiKey(entry)}
                    style={{
                      fontSize: 11,
                      padding: "6px 10px",
                      borderRadius: 4,
                      border: "1px solid var(--caval-border)",
                      background: "transparent",
                      color: "var(--caval-text)",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.status === "configured" ? "Update key" : "Add API key"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--caval-text-muted)", lineHeight: 1.45 }}>
        Per-conversation model stays in the composer selector. Preferred provider is remembered for
        Settings; History restore uses the conversation&apos;s saved model when present.
      </p>
    </div>
  );
}
