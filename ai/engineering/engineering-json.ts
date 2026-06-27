/** Extract first balanced JSON object from model text. */
export function extractJsonObject(text: string): string | null {
  if (!text?.trim()) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) {
    return fenced[1].trim();
  }

  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return text.slice(start);
}

/** Close truncated JSON arrays/objects when the model hits max_tokens. */
export function repairTruncatedJson(jsonText: string): string {
  const close = (text: string): string => {
    let repaired = text.trim().replace(/,\s*$/, '');
    let braces = 0;
    let brackets = 0;
    let inString = false;
    let escape = false;

    for (const ch of repaired) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') braces++;
      else if (ch === '}') braces--;
      else if (ch === '[') brackets++;
      else if (ch === ']') brackets--;
    }

    if (inString) repaired += '"';
    while (brackets > 0) {
      repaired += ']';
      brackets--;
    }
    while (braces > 0) {
      repaired += '}';
      braces--;
    }
    return repaired;
  };

  let repaired = close(jsonText);
  for (let i = 0; i < 6; i++) {
    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      const lastComma = repaired.lastIndexOf(',');
      if (lastComma <= 0) break;
      repaired = close(repaired.slice(0, lastComma));
    }
  }
  return repaired;
}

/** Map alternate model field names to canonical engineering shape. */
export function coerceEngineeringPayload(obj: unknown): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return {};
  const raw = obj as Record<string, unknown>;

  const parts =
    raw.parts ??
    raw.components ??
    raw.bom ??
    raw.items ??
    raw.partList ??
    raw.partsList ??
    [];

  const schemaRaw = (raw.schema ?? raw.diagram ?? raw.blockDiagram ?? raw.schematic ?? {}) as Record<
    string,
    unknown
  >;
  const nodes =
    schemaRaw.nodes ??
    schemaRaw.components ??
    raw.nodes ??
    [];

  const schema = {
    ...schemaRaw,
    nodes,
    connections: schemaRaw.connections ?? schemaRaw.links ?? schemaRaw.edges ?? [],
    powerBudget: schemaRaw.powerBudget ?? schemaRaw.power ?? '—',
    protocols: schemaRaw.protocols ?? schemaRaw.protocol ?? [],
  };

  return {
    ...raw,
    spec: raw.spec ?? raw.specification ?? raw.design ?? {},
    schema,
    parts,
    build: raw.build ?? raw.files ?? raw.artifacts ?? [],
  };
}

export function scoreEngineeringPayload(obj: unknown): number {
  const coerced = coerceEngineeringPayload(obj);
  const schema = coerced.schema as { nodes?: unknown[] } | undefined;
  const nodes = Array.isArray(schema?.nodes) ? schema.nodes.length : 0;
  const parts = Array.isArray(coerced.parts) ? coerced.parts.length : 0;
  const build = Array.isArray(coerced.build) ? coerced.build.length : 0;
  const hasSpec = coerced.spec && typeof coerced.spec === 'object';
  return nodes * 100 + parts * 100 + build * 50 + (hasSpec ? 10 : 0);
}

/** Pick richest engineering JSON when model splits output across content vs reasoning. */
export function pickBestEngineeringOutput(content: string, reasoning: string): string {
  const c = content.trim();
  const r = reasoning.trim();
  const merged = [c, r].filter(Boolean).join('\n');

  const candidates = [c, r, merged].filter(Boolean);
  let bestText = c || r;
  let bestScore = -1;

  for (const cand of candidates) {
    const parsed = parseEngineeringJson(cand);
    if (!parsed.ok) continue;
    try {
      const score = scoreEngineeringPayload(JSON.parse(parsed.json));
      if (score > bestScore) {
        bestScore = score;
        bestText = cand;
      }
    } catch {
      /* skip */
    }
  }

  if (bestScore >= 0) return bestText;

  // No parseable JSON — prefer longer fragment that mentions required keys
  const rank = (text: string): number => {
    if (!text.includes('{')) return 0;
    let s = text.length;
    if (text.includes('"parts"')) s += 5000;
    if (text.includes('"nodes"')) s += 4000;
    if (text.includes('"build"')) s += 3000;
    if (text.includes('"schema"')) s += 2000;
    return s;
  };
  const ranked = candidates.sort((a, b) => rank(b) - rank(a));
  return ranked[0] ?? bestText;
}

export function describeIncompleteProject(project: {
  schema: { nodes: unknown[] };
  parts: unknown[];
  build: unknown[];
}): string {
  const missing: string[] = [];
  if (project.schema.nodes.length === 0) missing.push('schema.nodes');
  if (project.parts.length === 0) missing.push('parts');
  if (project.build.length === 0) missing.push('build');
  return missing.length ? missing.join(', ') : 'structură validă';
}

export function parseEngineeringJson(text: string): { ok: true; json: string } | { ok: false; reason: string } {
  const raw = extractJsonObject(text);
  if (!raw) {
    const preview = text.trim().slice(0, 160).replace(/\s+/g, ' ');
    return {
      ok: false,
      reason: preview
        ? `Răspuns fără JSON detectabil. Început: «${preview}…»`
        : 'Răspuns gol de la model.',
    };
  }

  try {
    JSON.parse(raw);
    return { ok: true, json: raw };
  } catch {
    /* try repair */
  }

  const repaired = repairTruncatedJson(raw);
  try {
    JSON.parse(repaired);
    return { ok: true, json: repaired };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `JSON invalid: ${msg}` };
  }
}

export function looksTruncatedBeforeParts(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('"spec"') && !lower.includes('"parts"');
}
