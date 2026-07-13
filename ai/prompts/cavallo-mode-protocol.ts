/**
 * CAVALLO multi-mode protocol — identity, end labels, test trigger, fixtures.
 */

export type CavalloModeEndLabelId = 'plan' | 'code' | 'ask' | 'debug' | 'robotics';

export const CAVALLO_MODE_END_LABELS: Record<CavalloModeEndLabelId, string> = {
  plan: '[END PLAN]',
  code: '[END CODE]',
  ask: '[END ASK]',
  debug: '[END DEBUG]',
  robotics: '[END ROBOTICS]',
};

export function getModeEndLabel(mode: CavalloModeEndLabelId): string {
  return CAVALLO_MODE_END_LABELS[mode];
}

export function getModeEndLabelInstruction(mode: CavalloModeEndLabelId): string {
  return `End every response with exactly ${getModeEndLabel(mode)} on the last line.`;
}

export const CAVALLO_AI_IDENTITY = `You are Cavallo AI — a multi-mode IDE assistant.

Available modes (chat):
1. PLAN MODE — structured project plans, architecture, milestones.
2. CODE MODE — full, executable code implementations only.
3. ASK MODE — explain concepts clearly; no code unless explicitly requested.
4. DEBUG MODE — analyze errors, explain root causes, propose fixes.

Robotics design lives in the Engineering panel (not chat).

Rules:
- Detect user intent and obey the active mode exactly.
- Never mix outputs from different modes.
- Always follow the structure of the active mode.
- If the request is vague, start in PLAN mode and ask clarifying questions.
- Do not mention modes, intent detection, or internal routing to the user.`.trim();

export const CAVALLO_MODES_TEST_PATTERN =
  /\b(?:test\s+cavallo\s+modes?|testeaz[ăa]\s+modurile?\s+cavallo)\b/i;

export function isCavalloModesTestRequest(message: string): boolean {
  return CAVALLO_MODES_TEST_PATTERN.test(message.trim());
}

export const CAVALLO_MODES_TEST_PROTOCOL_RULES = `
TEST PROTOCOL (when user says "Test Cavallo modes"):
- PLAN MODE: sample mobile app project plan.
- CODE MODE: sample login system implementation.
- ASK MODE: explain REST vs GraphQL.
- DEBUG MODE: analyze a sample null pointer error.
- ROBOTICS MODE (Engineering panel only): ESP32 line-follower robot design.
- End each mode section with its [END *] label.`.trim();

export const CAVALLO_MODES_TEST_LLM_PROMPT = `${CAVALLO_AI_IDENTITY}

${CAVALLO_MODES_TEST_PROTOCOL_RULES}

Produce all five mode samples in order, each isolated, each ending with the correct [END *] label.`.trim();

export const CAVALLO_MODES_TEST_FIXTURE = `# Cavallo AI — Mode test (fixture)

## PLAN MODE — Sample: mobile app (task manager)

### Objective
Mobile task management app (iOS + Android) with cloud sync and offline mode.

### Architecture
- **Client:** React Native (Expo) — UI, local SQLite, sync queue
- **Backend:** Node.js + PostgreSQL — REST API, JWT auth
- **Infra:** Railway/Fly.io API

### Milestones

| Phase | Deliverable | Duration |
|-------|-------------|----------|
| M1 | Auth (login/register), project scaffold | 1 week |
| M2 | CRUD tasks, lists, tags, local persistence | 2 weeks |
| M3 | Sync engine (last-write-wins + manual merge UI) | 1.5 weeks |
| M4 | Push notifications, polish, TestFlight/Play internal | 1 week |

### Risks
- Offline sync conflicts — mitigate with versioning on \`updatedAt\` + merge UI.

[END PLAN]

---

## CODE MODE — Sample: login system

\`\`\`typescript:src/auth/types.ts
export interface User {
  id: string;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
\`\`\`

\`\`\`typescript:src/auth/login.ts
import type { AuthTokens } from './types';

export async function login(email: string, password: string): Promise<AuthTokens> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Invalid credentials');
  return res.json() as Promise<AuthTokens>;
}
\`\`\`

\`\`\`typescript:src/auth/session.ts
const TOKEN_KEY = 'auth_tokens';

export function saveTokens(tokens: { accessToken: string; refreshToken: string }): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function getAccessToken(): string | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  return (JSON.parse(raw) as { accessToken: string }).accessToken ?? null;
}
\`\`\`

[END CODE]

---

## ASK MODE — REST vs GraphQL

### Answer
REST uses resource-oriented URLs and HTTP verbs; GraphQL uses a single endpoint and client-defined queries.

### Explanation
- **REST:** Simple caching, predictable URLs, good for CRUD APIs.
- **GraphQL:** Clients fetch exactly the fields they need; reduces over-fetching on complex UIs.

### Examples
- REST: \`GET /users/42\` returns a fixed user shape.
- GraphQL: \`{ user(id: 42) { name posts { title } } }\` returns only requested fields.

### Related concepts
- gRPC for internal microservices; OpenAPI for REST contracts.

[END ASK]

---

## DEBUG MODE — Sample: null pointer

### Problem Summary
\`TypeError: Cannot read properties of null (reading 'name')\` at \`user.profile.name\`.

### Root Cause Analysis
\`user.profile\` is \`null\` for some records; code assumes profile always exists.

### Corrected Snippet
\`\`\`typescript
const displayName = user.profile?.name ?? 'Unknown';
\`\`\`

### Why the fix works
Optional chaining short-circuits on \`null\`/\`undefined\`; nullish coalescing supplies a safe fallback.

[END DEBUG]

---

## ROBOTICS MODE — Sample: ESP32 line follower

### PROJECT SUMMARY
Two-wheel differential drive line follower using ESP32, IR sensors, L298N motor driver.

### MECHANICAL DESIGN
Chassis: 150×100 mm acrylic plate; 65 mm wheels; caster at rear.

### ELECTRONICS & WIRING
- ESP32 GPIO → L298N IN1–IN4
- 5× TCRT5000 IR sensors on analog inputs
- 2S LiPo 7.4 V → buck 5 V for logic

### COMPONENT LIST
| Name | Part | Qty | Role |
|------|------|-----|------|
| MCU | ESP32-WROOM-32 | 1 | Controller |
| Driver | L298N | 1 | Motor H-bridge |
| Sensor | TCRT5000 | 5 | Line detection |

### TESTING & CALIBRATION
Calibrate IR thresholds on white vs black tape; tune PID constants (Kp=0.8, Ki=0, Kd=0.2).

[END ROBOTICS]
`.trim();

export const CAVALLO_MODES_TEST_ROBOTICS_FIXTURE = `## ROBOTICS MODE — Sample: ESP32 line follower

### PROJECT SUMMARY
Two-wheel differential drive line follower using ESP32, IR sensors, L298N motor driver.

### MECHANICAL DESIGN
Chassis: 150×100 mm acrylic plate; 65 mm wheels; caster at rear.

### CAD 3D MODEL
Parametric OpenSCAD chassis with configurable wheelbase and sensor mount offsets.

### ELECTRONICS & WIRING
- ESP32 GPIO → L298N IN1–IN4
- 5× TCRT5000 IR sensors on analog inputs
- 2S LiPo 7.4 V → buck 5 V for logic

### COMPONENT LIST
| Name | Part | Qty | Role |
|------|------|-----|------|
| MCU | ESP32-WROOM-32 | 1 | Controller |
| Driver | L298N | 1 | Motor H-bridge |
| Sensor | TCRT5000 | 5 | Line detection |

### TESTING & CALIBRATION
Calibrate IR thresholds on white vs black tape; tune PID constants (Kp=0.8, Ki=0, Kd=0.2).

[END ROBOTICS]`.trim();
