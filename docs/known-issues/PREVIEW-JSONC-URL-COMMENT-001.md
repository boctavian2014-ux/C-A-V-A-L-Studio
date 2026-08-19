# PREVIEW-JSONC-URL-COMMENT-001 — `stripJsonc` treats `//` inside URL strings as comments

| Câmp | Valoare |
|------|---------|
| ID | PREVIEW-JSONC-URL-COMMENT-001 |
| Severitate | **Mediu** (blochează Pas 6 — `caval.jsonc.preview.url`; nu blochează Pas 4/5) |
| Status | **Remediat** — Pas 6: `stripJsonc` păstrează `//` din string literals |
| Owner | Preview / config |
| Sprint | După Pas 5 Sidebar UI; **înainte de Pas 6** (config `caval.jsonc.preview`) |
| Depinde de | Nimic din CAD / billing / MCP |

## Problemă

`stripJsonc` din `ai/config/caval-config-shared.ts` face strip pe `//` cu un regex pe linie:

```ts
raw.replace(/\/\/.*$/gm, '')
```

Nu distinge comentariu JSONC real de substring-ul `//` dintr-un **string literal**. Un config valid ca:

```jsonc
{
  "preview": {
    "web": {
      "url": "http://localhost:5173"
    }
  }
}
```

devine JSON invalid (`"url": "http:` + restul liniei tăiat), iar `JSON.parse(stripJsonc(raw))` eșuează. Preview-ul cade pe detecție de proiect și ignoră override-ul din `caval.jsonc`.

Repro local (temp file, fără `//` comentariu real): `http://` din URL este tăiat la primul `//`.

## Cauză

Parser naiv pe linie întreagă. `//` din `"http://localhost:5173"` este tratat ca început de comentariu.

## Fix corect

Parser-ul trebuie să ignore `//` aflat între ghilimele (în interiorul unui string JSON), nu doar să facă un regex naiv pe linie întreagă. Același lucru pentru `/* */` dacă este adăugat ulterior.

Nu bloca Pas 5. Doar Pas 6 (config) depinde de acest fix — nu folosi `caval.jsonc.preview.url` în producție până ticketul este **Remediat**.

## Criteriu de acceptare

- `stripJsonc('{"url":"http://localhost:5173"}')` rămâne JSON valid și păstrează URL-ul.
- Comentariile reale `//` și, dacă e suportat, `/* */` continuă să fie scoase.
- Test unitar dedicat (string cu `http://`, comentariu real pe linie separată, escape `\"` în string).
- Pas 6 poate citi `preview.web.url` / `preview.mobile.url` din `caval.jsonc` fără fallback forțat pe detecție.
