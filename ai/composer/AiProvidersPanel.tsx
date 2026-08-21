import React, { useCallback, useEffect, useState } from "react";

import {
  statusLabel,
  type AiProviderEntry,
  type AiProviderId,
  type ProviderStatus,
} from "../../src/shared/ai-provider-contract";
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

export function AiProvidersPanel(): React.ReactElement {
  const [providers, setProviders] = useState<AiProviderEntry[]>([]);
  const [preferred, setPreferred] = useState<AiProviderId>("ollama");
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.caval?.aiProvidersList?.();
      if (!res?.ok || !res.providers) {
        setError(res?.error ?? "Failed to load providers");
        return;
      }
      setProviders(res.providers);
      setPreferred(res.preferredProviderId ?? "ollama");
      setEncryptionAvailable(res.encryptionAvailable !== false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
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
