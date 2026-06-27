// ──────────────────────────────────────────────────────────────
//  Caval Engineering AI — generator (unified AI pipeline)
// ──────────────────────────────────────────────────────────────

import { assertRendererChatAllowed } from '../safety/renderer-chat-guard';
import type { ApiKeys } from '../multi-model/provider';
import type { ModelSelectionId } from '../models/model-catalog';
import { completeViaChatStream } from './engineering-stream';
import { parseEngineeringJson, coerceEngineeringPayload, describeIncompleteProject, looksTruncatedBeforeParts } from './engineering-json';

export interface SpecData {
  title: string;
  summary: string;
  dimensions: string;
  weight: string;
  materials: string[];
  tolerances: string;
}

export interface SchemaNode {
  id: string;
  label: string;
  role: 'mcu' | 'sensor' | 'power' | 'actuator' | 'io';
}

export interface SchemaData {
  nodes: SchemaNode[];
  connections: { from: string; to: string; label: string }[];
  powerBudget: string;
  protocols: string[];
}

export interface PartItem {
  name: string;
  qty: number;
  unitPrice: number;
  currency: string;
  shop: string;
  shopUrl: string;
  substitute?: string;
}

export interface BuildFile {
  name: string;
  kind: 'stl' | 'firmware' | 'wiring' | 'doc';
  note: string;
  content?: string;
}

export interface EngProject {
  spec: SpecData;
  schema: SchemaData;
  parts: PartItem[];
  build: BuildFile[];
}

export interface GenerateResult {
  ok: boolean;
  project?: EngProject;
  error?: string;
  raw?: string;
  resolvedModel?: string;
}

const SYSTEM_PROMPT = `Ești Caval Engineering AI, un copilot de inginerie hardware/electronică.
Userul descrie liber un obiect sau sistem. Tu generezi designul tehnic complet, axat pe COMPONENTE ELECTRONICE reale.

Răspunzi EXCLUSIV cu un singur obiect JSON valid, fără text înainte sau după, fără markdown, fără explicații.
Toate textele în limba română. Prețuri realiste pentru piațal RO (lei / RON) și magazine reale din România (ex: Optimus Digital, Robofun, Cleste, Sigmanortec) cu URL valid.

Structura JSON exactă (respectă cheile și tipurile):
{
  "spec": {
    "title": string,
    "summary": string,
    "dimensions": string,
    "weight": string,
    "materials": string[],
    "tolerances": string
  },
  "schema": {
    "nodes": [
      { "id": string, "label": string, "role": "mcu"|"sensor"|"power"|"actuator"|"io" }
    ],
    "connections": [
      { "from": string, "to": string, "label": string }
    ],
    "powerBudget": string,
    "protocols": string[]
  },
  "parts": [
    {
      "name": string,
      "qty": number,
      "unitPrice": number,
      "currency": string,
      "shop": string,
      "shopUrl": string,
      "substitute": string
    }
  ],
  "build": [
    { "name": string, "kind": "stl"|"firmware"|"wiring"|"doc", "note": string,
      "content": string }
  ]
}

Reguli:
- Minim 3 noduri în schema.nodes, minim 1 controler (role "mcu").
- Minim 3 componente reale în parts.
- Include cel puțin un fișier STL și un fișier firmware în build.
- Pentru build kind=stl: în "note" descrie geometria fizică obligatorie (decupaj OLED mm, fante ventilație, gaură buzzer, standoff PCB) derivată din cererea userului.
- build[].content: scurt, max ~120 caractere per fișier (nu cod complet lung).
- Generează ÎNTÂI schema.nodes și parts (minim 3 fiecare), apoi build scurt.
- Returnează DOAR JSON-ul, începând cu { și terminând cu }.`;

const JSON_RETRY_USER_SUFFIX =
  '\n\nIMPORTANT: Răspunsul tău trebuie să fie UN SINGUR obiect JSON valid (fără markdown, fără text înainte/după).';

const INCOMPLETE_RETRY_SUFFIX =
  '\n\nIMPORTANT: Răspuns incomplet. Include obligatoriu schema.nodes (min 3, cu un mcu) și parts (min 3 componente reale RO). build[].content max 120 caractere.';

function normalizeProject(obj: any): EngProject {
  const coerced = coerceEngineeringPayload(obj);
  const asArray = <T>(v: any): T[] => (Array.isArray(v) ? v : []);
  const str = (v: any, d = ''): string => (typeof v === 'string' ? v : d);
  const num = (v: any, d = 0): number => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : d;
  };

  const spec = coerced?.spec ?? {};
  const schema = coerced?.schema ?? {};

  const validRoles = ['mcu', 'sensor', 'power', 'actuator', 'io'];
  const validKinds = ['stl', 'firmware', 'wiring', 'doc'];

  return {
    spec: {
      title: str(spec.title, 'Proiect Caval'),
      summary: str(spec.summary, ''),
      dimensions: str(spec.dimensions, '—'),
      weight: str(spec.weight, '—'),
      materials: asArray<string>(spec.materials).map((m) => str(m)).filter(Boolean),
      tolerances: str(spec.tolerances, '—'),
    },
    schema: {
      nodes: asArray<any>(schema.nodes).map((n, i) => ({
        id: str(n?.id, `n${i}`),
        label: str(n?.label, `Nod ${i + 1}`),
        role: validRoles.includes(n?.role) ? n.role : 'io',
      })),
      connections: asArray<any>(schema.connections).map((c) => ({
        from: str(c?.from),
        to: str(c?.to),
        label: str(c?.label, ''),
      })),
      powerBudget: str(schema.powerBudget, '—'),
      protocols: asArray<string>(schema.protocols).map((p) => str(p)).filter(Boolean),
    },
    parts: asArray<any>(coerced?.parts).map((p) => ({
      name: str(p?.name, 'Componentă'),
      qty: Math.max(1, Math.round(num(p?.qty, 1))),
      unitPrice: num(p?.unitPrice, 0),
      currency: str(p?.currency, 'RON'),
      shop: str(p?.shop, '—'),
      shopUrl: str(p?.shopUrl, ''),
      substitute: p?.substitute ? str(p.substitute) : undefined,
    })),
    build: asArray<any>(coerced?.build).map((b) => ({
      name: str(b?.name, 'fisier'),
      kind: validKinds.includes(b?.kind) ? b.kind : 'doc',
      note: str(b?.note, ''),
      content:
        typeof b?.content === 'string'
          ? b.content.slice(0, 600)
          : undefined,
    })),
  };
}

function isProjectComplete(project: EngProject): boolean {
  return project.schema.nodes.length > 0 && project.parts.length > 0;
}

type CavalAiComplete = (input: {
  model: string;
  intent?: string;
  capability?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  workspaceRoot?: string;
  apiKeys?: ApiKeys;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}) => Promise<
  | { ok: true; text: string; resolvedModel: string; provider: string }
  | { ok: false; error: string }
>;

async function runEngineeringCompletion(params: {
  prompt: string;
  modelId: ModelSelectionId;
  apiKeys: ApiKeys;
  workspaceRoot?: string | null;
  signal?: AbortSignal;
  retryStrictJson?: boolean;
  retryIncomplete?: boolean;
}): Promise<
  | { ok: true; text: string; resolvedModel?: string }
  | { ok: false; error: string }
> {
  const userContent = params.retryIncomplete
    ? `${params.prompt.trim()}${INCOMPLETE_RETRY_SUFFIX}`
    : params.retryStrictJson
      ? `${params.prompt.trim()}${JSON_RETRY_USER_SUFFIX}`
      : params.prompt.trim();

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: userContent },
  ];

  const streamResult = await completeViaChatStream({
    model: params.modelId,
    messages,
    workspaceRoot: params.workspaceRoot,
    signal: params.signal,
  });

  if (streamResult.ok) return streamResult;

  const caval = (window as unknown as { caval?: { aiComplete?: CavalAiComplete } }).caval;
  if (!caval?.aiComplete) {
    return streamResult;
  }

  const completeResult = await caval.aiComplete({
    model: params.modelId,
    intent: 'planning',
    capability: 'planning',
    workspaceRoot: params.workspaceRoot ?? undefined,
    apiKeys: params.apiKeys,
    jsonMode: true,
    maxTokens: 8192,
    temperature: 0.15,
    timeoutMs: 120_000,
    messages,
  });

  if (!completeResult.ok) return completeResult;
  return {
    ok: true,
    text: completeResult.text,
    resolvedModel: completeResult.resolvedModel,
  };
}

export async function generateEngineering(params: {
  prompt: string;
  modelId: ModelSelectionId;
  apiKeys: ApiKeys;
  workspaceRoot?: string | null;
  signal?: AbortSignal;
}): Promise<GenerateResult> {
  const { prompt, modelId, apiKeys, workspaceRoot, signal } = params;

  if (signal?.aborted) {
    return { ok: false, error: 'Generare anulată.' };
  }

  try {
    assertRendererChatAllowed({
      prompt: prompt.trim(),
      system: SYSTEM_PROMPT,
      workspaceRoot: workspaceRoot ?? undefined,
      capability: 'chat',
      intent: 'kilocode',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }

  let result = await runEngineeringCompletion({
    prompt,
    modelId,
    apiKeys,
    workspaceRoot,
    signal,
  });

  if (signal?.aborted) {
    return { ok: false, error: 'Generare anulată.' };
  }

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  let parsedJson = parseEngineeringJson(result.text);
  if (!parsedJson.ok && result.text.includes('{')) {
    parsedJson = parseEngineeringJson(result.text.replace(/^\uFEFF/, '').trim());
  }
  if (!parsedJson.ok) {
    result = await runEngineeringCompletion({
      prompt,
      modelId,
      apiKeys,
      workspaceRoot,
      signal,
      retryStrictJson: true,
    });

    if (signal?.aborted) {
      return { ok: false, error: 'Generare anulată.' };
    }
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    parsedJson = parseEngineeringJson(result.text);
  }

  if (!parsedJson.ok) {
    return {
      ok: false,
      error: `Modelul nu a returnat JSON valid. ${parsedJson.reason}`,
      raw: result.text,
    };
  }

  try {
    let project = normalizeProject(JSON.parse(parsedJson.json));

    if (!isProjectComplete(project)) {
      const retryResult = await runEngineeringCompletion({
        prompt,
        modelId,
        apiKeys,
        workspaceRoot,
        signal,
        retryIncomplete: true,
      });

      if (signal?.aborted) {
        return { ok: false, error: 'Generare anulată.' };
      }

      if (retryResult.ok) {
        const retryParsed = parseEngineeringJson(retryResult.text);
        if (retryParsed.ok) {
          project = normalizeProject(JSON.parse(retryParsed.json));
          result = retryResult;
        }
      }
    }

    if (!isProjectComplete(project)) {
      const missing = describeIncompleteProject(project);
      const hint = looksTruncatedBeforeParts(result.text)
        ? ' Răspuns probabil trunchiat — încearcă Auto Frontier.'
        : '';
      return {
        ok: false,
        error: `Răspuns incomplet de la model (lipsește: ${missing}).${hint}`,
        raw: result.text,
      };
    }

    return {
      ok: true,
      project,
      raw: result.text,
      resolvedModel: result.resolvedModel,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `JSON invalid: ${msg}`, raw: result.text };
  }
}
