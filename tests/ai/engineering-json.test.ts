import { describe, expect, it } from "vitest";
import {
  extractJsonObject,
  parseEngineeringJson,
  repairTruncatedJson,
  coerceEngineeringPayload,
  describeIncompleteProject,
  looksTruncatedBeforeParts,
} from "../../ai/engineering/engineering-json";

describe("engineering-json", () => {
  it("extracts fenced JSON", () => {
    const text = 'Here:\n```json\n{"spec":{"title":"X"}}\n```';
    expect(extractJsonObject(text)).toBe('{"spec":{"title":"X"}}');
  });

  it("extracts raw object from prose", () => {
    const text = 'Design:\n{"spec":{"title":"Meteo"},"parts":[]}';
    const json = extractJsonObject(text);
    expect(json).toContain('"title":"Meteo"');
  });

  it("repairs truncated JSON", () => {
    const broken = '{"spec":{"title":"A"},"parts":[{"name":"ESP32"';
    const repaired = repairTruncatedJson(broken);
    expect(() => JSON.parse(repaired)).not.toThrow();
  });

  it("parseEngineeringJson succeeds on valid payload", () => {
    const r = parseEngineeringJson('{"spec":{"title":"T"},"schema":{"nodes":[]},"parts":[],"build":[]}');
    expect(r.ok).toBe(true);
  });

  it("parseEngineeringJson fails clearly on empty", () => {
    const r = parseEngineeringJson("   ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("gol");
  });

  it("coerceEngineeringPayload maps alternate keys", () => {
    const coerced = coerceEngineeringPayload({
      specification: { title: "Senzor" },
      diagram: { components: [{ id: "n1", label: "ESP32", role: "mcu" }] },
      bom: [{ name: "DHT22", qty: 1 }],
    });
    expect(coerced.spec).toEqual({ title: "Senzor" });
    expect((coerced.schema as { nodes: unknown[] }).nodes).toHaveLength(1);
    expect(coerced.parts).toHaveLength(1);
  });

  it("describeIncompleteProject lists missing sections", () => {
    expect(
      describeIncompleteProject({ schema: { nodes: [] }, parts: [], build: [] })
    ).toBe("schema.nodes, parts, build");
  });

  it("looksTruncatedBeforeParts detects spec without parts", () => {
    expect(looksTruncatedBeforeParts('{"spec":{"title":"X"},"schema":{')).toBe(true);
    expect(looksTruncatedBeforeParts('{"spec":{},"parts":[]}')).toBe(false);
  });
});
