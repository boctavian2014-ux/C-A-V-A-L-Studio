import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  interpolate,
  isSupportedLocale,
  resolveLocale,
  SUPPORTED_LOCALES,
} from "../../src/shared/i18n-contract";
import {
  createTranslator,
  dictionaries,
  translate,
} from "../../ai/i18n/index";
import { en, type MessageKey } from "../../ai/i18n/locales/en";
import { ro } from "../../ai/i18n/locales/ro";
import {
  applyLocaleToSettings,
  resolveLocalePreference,
} from "../../src/main/locale-settings";

describe("resolveLocale", () => {
  it("maps regional tags to supported bases", () => {
    expect(resolveLocale("ro-RO")).toBe("ro");
    expect(resolveLocale("en-US")).toBe("en");
    expect(resolveLocale("RO")).toBe("ro");
  });

  it("falls back to English for unknown locales", () => {
    expect(resolveLocale("fr-FR")).toBe("en");
    expect(resolveLocale("zh-CN")).toBe("en");
    expect(resolveLocale("")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
  });
});

describe("translate / interpolate", () => {
  it("returns en and ro strings", () => {
    expect(translate("en", "common.save")).toBe("Save");
    expect(translate("ro", "common.save")).toBe("Salvează");
    expect(translate("en", "settings.displayLanguage")).toBe("Display language");
    expect(translate("ro", "settings.displayLanguage")).toBe("Limba afișată");
  });

  it("falls back to English then key", () => {
    const tRo = createTranslator("ro");
    expect(tRo("common.openFolder")).toBe("Deschide folder");
    expect(tRo("missing.key.does.not.exist")).toBe("missing.key.does.not.exist");
  });

  it("interpolates placeholders", () => {
    expect(interpolate("Hello {{name}}", { name: "Caval" })).toBe("Hello Caval");
    expect(translate("en", "confirm.deleteFile", { name: "a.ts" })).toBe('Delete "a.ts"?');
    expect(translate("ro", "confirm.deleteFile", { name: "a.ts" })).toBe('Ștergi "a.ts"?');
    expect(interpolate("Keep {{missing}}", {})).toBe("Keep {{missing}}");
  });
});

describe("catalog key parity", () => {
  it("ro covers every en key", () => {
    const enKeys = Object.keys(en).sort();
    const roKeys = Object.keys(ro).sort();
    expect(roKeys).toEqual(enKeys);
    for (const key of enKeys as MessageKey[]) {
      expect(typeof dictionaries.ro[key]).toBe("string");
      expect(dictionaries.ro[key].length).toBeGreaterThan(0);
    }
  });

  it("SUPPORTED_LOCALES match dictionary registry", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(dictionaries[locale]).toBeTruthy();
      expect(isSupportedLocale(locale)).toBe(true);
    }
  });
});

describe("locale persistence helpers (IPC contract)", () => {
  it("rejects invalid locale", () => {
    const result = applyLocaleToSettings({}, "de");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Unsupported/i);
  });

  it("persists valid locale as ui.locale", () => {
    const result = applyLocaleToSettings({ "cad.apiUrl": "x" }, "ro");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.locale).toBe("ro");
      expect(result.settings["ui.locale"]).toBe("ro");
      expect(result.settings["cad.apiUrl"]).toBe("x");
    }
  });

  it("prefers saved over system", () => {
    expect(resolveLocalePreference({ "ui.locale": "en" }, "ro-RO")).toEqual({
      locale: "en",
      source: "saved",
    });
    expect(resolveLocalePreference({}, "ro-RO")).toEqual({
      locale: "ro",
      source: "system",
    });
    expect(resolveLocalePreference({}, null)).toEqual({
      locale: "en",
      source: "default",
    });
  });
});
