import React, { useEffect, useState } from "react";

import {
  isAllowedCustomUrl,
  normalizeCustomBaseUrl,
} from "../../src/shared/ai-provider-contract";

const fieldStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontSize: 12,
  padding: "6px 8px",
  borderRadius: 4,
  border: "1px solid var(--caval-border)",
  background: "var(--caval-bg, #0e0e0f)",
  color: "var(--caval-text)",
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 11,
  color: "var(--caval-text-muted)",
};

export interface CustomProviderFormProps {
  onSaved?: () => void;
  /** Test-only initial drafts. */
  initialDraft?: {
    baseUrl?: string;
    modelId?: string;
    label?: string;
    apiKey?: string;
  };
}

/** Shared validation for Save (used by UI + tests). */
export function validateCustomProviderDraft(input: {
  baseUrl: string;
  modelId: string;
}): string | null {
  const url = normalizeCustomBaseUrl(input.baseUrl);
  if (!isAllowedCustomUrl(url)) {
    return "URL must be localhost/127.0.0.1 or use https://";
  }
  if (!input.modelId.trim()) {
    return "Model ID is required";
  }
  return null;
}

/** Pas 7f.4 — configure OpenAI-compatible custom endpoint (no secret values returned). */
export function CustomProviderForm({
  onSaved,
  initialDraft,
}: CustomProviderFormProps): React.ReactElement {
  const [baseUrl, setBaseUrl] = useState(initialDraft?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(initialDraft?.apiKey ?? "");
  const [modelId, setModelId] = useState(initialDraft?.modelId ?? "");
  const [label, setLabel] = useState(initialDraft?.label ?? "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    void window.caval?.secretsGet?.().then((res) => {
      const c = res?.configured ?? {};
      setConfigured(
        Boolean(c.CUSTOM_PROVIDER_BASE_URL) && Boolean(c.CUSTOM_PROVIDER_MODEL_ID)
      );
    });
  }, []);

  const handleSave = async () => {
    setError(null);
    setMessage(null);
    const validationError = validateCustomProviderDraft({ baseUrl, modelId });
    if (validationError) {
      setError(validationError);
      return;
    }

    const url = normalizeCustomBaseUrl(baseUrl);
    setBusy(true);
    try {
      const patch: Record<string, string> = {
        CUSTOM_PROVIDER_BASE_URL: url,
        CUSTOM_PROVIDER_MODEL_ID: modelId.trim(),
        CUSTOM_PROVIDER_LABEL: (label.trim() || "Custom").slice(0, 128),
      };
      if (apiKey.trim()) {
        patch.CUSTOM_PROVIDER_API_KEY = apiKey.trim();
      }
      const res = await window.caval?.secretsSet?.(patch);
      if (!res?.ok) {
        setError(
          (res as { error?: string } | undefined)?.error ??
            "Failed to save custom provider"
        );
        return;
      }
      setApiKey("");
      setConfigured(true);
      setMessage("Custom provider saved");
      onSaved?.();
    } finally {
      setBusy(false);
    }
  };

  const handleTestConnection = async () => {
    setError(null);
    setMessage(null);
    const url = normalizeCustomBaseUrl(baseUrl);
    if (url && !isAllowedCustomUrl(url)) {
      setError("URL must be localhost/127.0.0.1 or use https://");
      return;
    }
    setBusy(true);
    try {
      const result = await window.caval?.testProviderKey?.({
        providerId: "custom",
        draft: {
          baseUrl: url || undefined,
          apiKey: apiKey.trim() || undefined,
          modelId: modelId.trim() || undefined,
        },
      });
      if (result?.ok && result.result === "valid") {
        setMessage("Connection successful");
      } else {
        setError(result?.error ?? `Connection failed (${result?.result ?? "unknown"})`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="custom-provider-form"
      style={{
        marginTop: 10,
        marginLeft: 26,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {configured && (
        <span style={{ fontSize: 11, color: "var(--caval-success, #3dd68c)" }}>
          Custom endpoint configured (values stay in secure storage)
        </span>
      )}
      <label style={labelStyle}>
        Display name
        <input
          data-testid="custom-provider-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="LM Studio"
          style={fieldStyle}
        />
      </label>
      <label style={labelStyle}>
        Base URL
        <input
          data-testid="custom-provider-base-url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="http://localhost:1234/v1"
          style={fieldStyle}
        />
      </label>
      <label style={labelStyle}>
        Model ID
        <input
          data-testid="custom-provider-model-id"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder="local-model-name"
          style={fieldStyle}
        />
      </label>
      <label style={labelStyle}>
        API Key (optional)
        <input
          data-testid="custom-provider-api-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={configured ? "•••••••• (leave blank to keep)" : "optional"}
          style={fieldStyle}
        />
      </label>
      {error && (
        <div
          role="alert"
          data-testid="custom-provider-error"
          style={{ fontSize: 11, color: "var(--caval-danger)" }}
        >
          {error}
        </div>
      )}
      {message && (
        <div
          role="status"
          data-testid="custom-provider-message"
          style={{ fontSize: 11, color: "var(--caval-accent)" }}
        >
          {message}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          data-testid="custom-provider-test-btn"
          disabled={busy}
          onClick={() => void handleTestConnection()}
          style={{
            fontSize: 11,
            padding: "6px 10px",
            borderRadius: 4,
            border: "1px solid var(--caval-border)",
            background: "transparent",
            color: "var(--caval-text)",
            cursor: busy ? "wait" : "pointer",
          }}
        >
          Test connection
        </button>
        <button
          type="button"
          data-testid="custom-provider-save-btn"
          disabled={busy}
          onClick={() => void handleSave()}
          style={{
            fontSize: 11,
            padding: "6px 10px",
            borderRadius: 4,
            border: "none",
            background: "var(--caval-accent)",
            color: "#0E0E0F",
            fontWeight: 700,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
