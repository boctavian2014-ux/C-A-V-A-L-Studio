# Cavallo modes protocol

CAVALLO Studio routes chat requests through strict enterprise modes with auto-detect and deterministic end labels.

## Chat modes

| Mode | Purpose | End label |
|------|---------|-----------|
| Plan | Architecture, milestones, roadmaps — no code | `[END PLAN]` |
| Code | Full implementations as fenced files only | `[END CODE]` |
| Ask | Explanations; no code unless requested | `[END ASK]` |
| Debug | Root-cause analysis and targeted fixes | `[END DEBUG]` |

Robotics design lives in the **Engineering** panel (Robotics AI ULTRA), not as a chat mode. Robotics responses end with `[END ROBOTICS]`.

## Auto-detect

When `cavalloModes.autoModeSwitch` is `true` (default in `caval.jsonc`), the router in `ai/modes/mode-router.ts` may switch modes based on message intent (`ai/modes/intent-detector.ts`). High-confidence signals only; manual UI selection is respected otherwise.

Explicit triggers: `PLAN MODE`, `CODE MODE`, `ASK MODE`, `DEBUG MODE`, `BUILD MODE`, `RELEASE MODE`.

## System prompts

Direct chat modes use `getCavalloSystemPrompt()` which combines:

1. Cavallo AI identity (`ai/prompts/cavallo-mode-protocol.ts`)
2. Mode-specific enterprise prompt (`ai/prompts/cavallo-enterprise-modes.ts`)
3. `[END *]` instruction when `enforceEndLabels` is true

## Test protocol

Send **Test Cavallo modes** in chat (or run **AI: Test Cavallo modes** from the command palette).

By default (`modesTestUseLlm: false`), the app returns a deterministic fixture with all five sample sections — no LLM call.

Set `modesTestUseLlm: true` in `caval.jsonc` to exercise the LLM with the test system prompt instead.

In the Engineering panel, the same trigger returns the robotics-only fixture.

## Configuration (`caval.jsonc`)

```jsonc
"cavalloModes": {
  "autoModeSwitch": true,
  "explicitTriggers": true,
  "modesTestUseLlm": false,
  "enforceEndLabels": true
}
```

## Agentic mode (Coding Arena)

Agentic uses the multi-agent pipeline — **not** the PLAN/CODE/ASK/DEBUG protocol above.

### Speed profile (default in `caval.jsonc`)

- **`fastPipeline: true`** — skips Merge + Supervisor LLM for simple prompts (~2 fewer model calls).
- **`fullDelivery.enabled: true`** — compose waves + autonomous repair still active; no longer forces `fastPipeline: false`.
- **`supervisorFallback: true`** — if LLM Supervisor REJECTED, files are still delivered with `⚠️ [NEEDS_REVIEW]` in chat.
- **`devtoolsAsyncVerify: true`** — `npm install` / typecheck run **in background** after delivery; chat updates when verify finishes.
- **`applyComplexPromptOverrides: true`** — long / multi-module prompts auto-switch to full pipeline (merge + supervisor, higher wave limits).

**Review strict** in the UI overrides speed profile → full merge + supervisor.

- **No UI pause:** `multiAgent.fullDelivery.uiCheckpoint` is `false`. UI tasks run with automatic defaults (modern, dark, responsive).
- **Ready-to-use gate:** blocking issues (junk workspace, forbidden paths, critical arena) still block; soft supervisor / pending verify do not strip files from the editor.
- **Model Orchestrator (LLM):** etapa `modelOrch` apelează Agent 9 pentru alocare modele per rol (architect, implementer, tester…). Timeline-ul afișează badge per model la fiecare etapă/sub-agent.

```jsonc
"multiAgent": {
  "fastPipeline": true,
  "supervisorFallback": true,
  "devtoolsAsyncVerify": true,
  "applyComplexPromptOverrides": true,
  "fullDelivery": {
    "enabled": true,
    "maxComposeWaves": 3,
    "maxArenaRepairWaves": 1,
    "maxGateRepairWaves": 1,
    "maxRepairWaves": 4,
    "autonomousFinish": true,
    "autoInstallDependencies": true
  }
}
```

### Autonomie completă

Agentic finalizează proiectele **fără input manual** când `autonomousFinish` este `true`:

| Situație | Acțiune automată |
|----------|------------------|
| Gate blocked (supervisor, arena, verify) | `AGENTIC_REPAIR` wave până la `maxRepairWaves` |
| Plan fără fence-uri | Auto `SCAFFOLD_CONTINUE` |
| Verify fail (module lipsă) | `npm install` + re-verify, apoi repair LLM |
| `package.json` nou / fără `node_modules` | `npm install` înainte de verify |

**Limite:** fără folder deschis pipeline-ul se oprește; după `maxRepairWaves` rămâne raport cu issues; `junk_workspace` necesită curățare manuală. `npm install` este allowlisted strict (fără `;`, `&&`, comenzi arbitrare).
