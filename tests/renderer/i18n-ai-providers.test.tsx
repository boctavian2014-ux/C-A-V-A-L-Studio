/**
 * @vitest-environment jsdom
 */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../ai/i18n/I18nProvider";
import { createTranslator } from "../../ai/i18n/index";
import {
  providerDisplayLabel,
  providerStatusDisplay,
} from "../../ai/i18n/provider-display";
import { AiProvidersPanel } from "../../ai/composer/AiProvidersPanel";
import { CavalThemeProvider } from "../../themes/theme-provider";

function mount(ui: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = createRoot(container);
  act(() => {
    root?.render(ui);
  });
  return {
    container,
    unmount() {
      act(() => {
        root?.unmount();
        root = null;
      });
      container.remove();
    },
  };
}

describe("7g.4 AI providers i18n", () => {
  let mounted: { unmount: () => void; container: HTMLElement } | undefined;

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    window.caval = {
      aiProvidersList: vi.fn(async () => ({
        ok: true,
        providers: [
          {
            id: "ollama",
            label: "Local & Free",
            description: "Ollama",
            status: "not-installed",
            selectable: true,
          },
          {
            id: "openai",
            label: "OpenAI",
            description: "GPT",
            status: "not-configured",
            selectable: true,
            secretKey: "OPENAI_API_KEY",
          },
        ],
        preferredProviderId: "ollama",
        encryptionAvailable: true,
      })),
      localAiStatus: vi.fn(async () => ({
        ok: true,
        status: {
          installed: false,
          running: false,
          defaultModelReady: false,
          phase: "not-installed",
          defaultModel: "qwen2.5-coder:7b",
        },
      })),
      localAiOnStatusChanged: () => () => undefined,
    } as unknown as Window["caval"];
  });

  it("shows Local & Free and Install Ollama in English", async () => {
    mounted = mount(
      <CavalThemeProvider defaultMode="dark">
        <I18nProvider initialLocale="en">
          <AiProvidersPanel />
        </I18nProvider>
      </CavalThemeProvider>
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mounted.container.textContent).toContain("Ollama Local & Free");
    expect(mounted.container.textContent).toContain("Local & Free");
    expect(mounted.container.textContent).toMatch(/Install Ollama/i);
    expect(mounted.container.textContent).toMatch(/Not installed/i);
  });

  it("translates provider chrome to Romanian", async () => {
    mounted = mount(
      <CavalThemeProvider defaultMode="dark">
        <I18nProvider initialLocale="ro">
          <AiProvidersPanel />
        </I18nProvider>
      </CavalThemeProvider>
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mounted.container.textContent).toContain("Ollama Local & Free");
    expect(mounted.container.textContent).toMatch(/Instalează Ollama/i);
    expect(mounted.container.textContent).toMatch(/Neinstalat/i);
    expect(mounted.container.textContent).not.toContain("ai.providers.ollama");
  });

  it("provider display helpers map status and labels", () => {
    const tEn = createTranslator("en");
    const tRo = createTranslator("ro");
    expect(providerDisplayLabel("ollama", tEn)).toContain("Local & Free");
    expect(providerStatusDisplay("configured", tEn)).toBe("Ready");
    expect(providerStatusDisplay("configured", tRo)).toBe("Pregătit");
  });
});
