# SEC-MCP-STDERR-REDACTION-001 — MCP stderr redaction incomplete

| Field | Value |
|-------|--------|
| **ID** | SEC-MCP-STDERR-REDACTION-001 |
| **Severitate** | **Medie** |
| **Status** | **Open** |
| **Related** | Lot C3 (`mcp-client.ts` stderrTail), Lot B/C redaction helpers (`redactSensitiveText` / `command-output-redaction.ts`), MCPPanel UI |

## Problemă

`stderrTail` din `ai/mcp/mcp-client.ts` acumulează până la ~4 KB de stderr de la procesul MCP și îl atașează la `entry.error`, afișat în `MCPPanel` și posibil în loguri.

Redactarea actuală (unde există) este **parțială** / pe câmpuri cunoscute — nu garantează că tokenuri din stderr (Bearer, `sk-`, `ghp_`, connection strings, etc.) sunt eliminate înainte de UI/logging.

## Vector

1. MCP child scrie un secret în stderr (ex. auth failure echo, debug print).
2. Tail-ul este concatenat în `entry.error`.
3. Renderer (`MCPPanel`) afișează `s.error` (până la 600 caractere) către utilizator / potențial telemetrie.

## Remediere minimă

1. Aplică `redactSensitiveText` (helper central din Lot C / `src/shared/command-output-redaction.ts`) pe **întregul** `stderrTail` înainte de:
   - atașare la `entry.error`
   - orice `console.*` / logging
   - orice payload trimis către renderer
2. Extinde pattern-urile de redactare dacă fixture-urile o cer (Bearer, `sk-`, `ghp_`, `sgp_`, URL cu user:pass, etc.).
3. **Test obligatoriu** (fără MCP real):
   - fixture stderr cu multiple formate de secret
   - assert: output afișat/logat **zero leakage** (niciun secret plaintext)
4. Nu marca acest ticket **FINALIZAT** până testul confirmă zero leakage pe fixture-uri.

## Criterii de închidere

| Criteriu | Stare |
|----------|--------|
| `stderrTail` / errors redactate end-to-end înainte de UI | Pending |
| Test fixture Bearer / `sk-` / `ghp_` / similar → zero leakage | Pending |
| Nicio cale care returnează stderr brut către renderer | Pending |

## Prioritate

Medie — nu e RCE, dar e scurgere de secrete în UI/loguri, același tipar de risc rezidual semnalat în auditul general. Remediază imediat după Lot C5 sau într-un hotfix dedicat înainte de release.
