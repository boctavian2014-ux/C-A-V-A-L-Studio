import { describe, expect, it } from "vitest";
import {
  buildCadTechnicalPrompt,
  inferCadPhysicalFeatures,
  inferCadProjectType,
} from "../../ai/engineering/cad-prompt";
import type { EngProject } from "../../ai/engineering/engineering-generator";

const sensorProject: EngProject = {
  spec: {
    title: "Senzor calitate aer",
    summary: "ESP32 + PMS5003 + OLED 0.96",
    dimensions: "80×55×35 mm",
    weight: "120g",
    materials: ["PLA"],
    tolerances: "±0.2 mm",
  },
  schema: {
    nodes: [
      { id: "mcu", label: "ESP32", role: "mcu" },
      { id: "s1", label: "PMS5003", role: "sensor" },
      { id: "d1", label: "OLED", role: "io" },
    ],
    connections: [],
    powerBudget: "5V 500mA",
    protocols: ["I2C", "UART"],
  },
  parts: [
    { name: "ESP32 DevKit", qty: 1, unitPrice: 45, currency: "RON", shop: "X", shopUrl: "" },
    { name: "PMS5003", qty: 1, unitPrice: 80, currency: "RON", shop: "X", shopUrl: "" },
    { name: "OLED 0.96", qty: 1, unitPrice: 25, currency: "RON", shop: "X", shopUrl: "" },
  ],
  build: [
    {
      name: "Carcasa STL",
      kind: "stl",
      note: "Carcasă senzor aer cu fereastră OLED",
      content: "Decupaj OLED 27mm, fante ventilație lateral",
    },
  ],
};

describe("cad-prompt", () => {
  it("classifies air quality sensor as iot", () => {
    expect(
      inferCadProjectType("Senzor de calitate a aerului cu ecran OLED și alertă pe WiFi", sensorProject.spec)
    ).toBe("iot");
  });

  it("infers OLED, vents, WiFi, buzzer features from prompt", () => {
    const features = inferCadPhysicalFeatures(
      "Senzor de calitate a aerului cu ecran OLED și alertă pe WiFi",
      sensorProject
    );
    expect(features.some((f) => /OLED|27\.3/i.test(f))).toBe(true);
    expect(features.some((f) => /ventila/i.test(f))).toBe(true);
    expect(features.some((f) => /antena|WiFi|2\.4/i.test(f))).toBe(true);
    expect(features.some((f) => /buzzer/i.test(f))).toBe(true);
  });

  it("buildCadTechnicalPrompt forbids generic box and lists mandatory geometry", () => {
    const prompt = buildCadTechnicalPrompt(
      sensorProject,
      "Senzor de calitate a aerului cu ecran OLED și alertă pe WiFi"
    );
    expect(prompt).toContain("FORBIDDEN");
    expect(prompt).toContain("MANDATORY GEOMETRY");
    expect(prompt).toContain("OLED");
    expect(prompt).toContain("PMS5003");
    expect(prompt).toMatch(/ventila/i);
  });
});
