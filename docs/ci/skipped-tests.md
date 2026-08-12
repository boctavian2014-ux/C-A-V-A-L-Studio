# Skipped tests inventory (Q1)

`npm test` reports **2 skipped**. Both are explicit `it.skip` in the same file.
`describe.skipIf(!hasGit)` in Git IPC is **not** counted when Git is installed.

| Test | Fișier | Motiv | Owner | Condiție de reactivare |
|------|--------|-------|-------|------------------------|
| `fails when fashion-fullstack paths missing (legacy fashion domain)` | `tests/ai/project-completion-gate.test.ts` | Gate-ul de completion nu mai tratează `fashion-fullstack` ca archetyp activ; assert-urile (`archetype_missing`) sunt pe un domeniu retras. | Composer / delivery | Reactiva când `evaluateCompletionGate` reintroduce archetyp fashion **sau** șterge testul și înlocuiește-l cu un gate pe archetyp-ul curent. Ticket: nu skip fără înlocuitor. |
| `passes minimal valid fullstack layout (legacy fashion domain)` | `tests/ai/project-completion-gate.test.ts` | Același domeniu legacy; layout-ul `fashion-matching-engine/` + `web/` + `mobile/` nu mai e contractul de delivery. | Composer / delivery | Idem: reintroduce archetyp-ul sau înlocuiește cu fixture pentru produsul curent. |

Nu adăuga `it.skip` / `it.todo` noi fără ticket, owner și condiție de reactivare în acest fișier.
