# Engineering AI — Text-to-CAD

Pipeline complet pentru generarea de modele 3D din limbaj natural în Caval Studio Engineering AI.

## Arhitectură

1. **Caval Studio** (Electron) trimite promptul via IPC → `CAD_API_URL`
2. **CAD server** (Railway / local) generează OpenSCAD cu LLM
3. **OpenSCAD CLI** compilează STL
4. **Supabase** persistă metadata (`cad_generations`) și STL în bucket `cad-models`
5. **CadViewer** (Three.js) afișează modelul în tab-ul „Model 3D”

## Pornire locală

```bash
# Terminal 1 — serviciu CAD (port 8791)
npm run cad:serve

# Terminal 2 — aplicația
npm run start
```

## Variabile de mediu

| Variabilă | Descriere |
|-----------|-----------|
| `CAD_API_URL` | URL API pentru Electron (default `http://127.0.0.1:8791`) |
| `CAD_PORT` | Port server CAD local (default `8791`) |
| `CAD_PUBLIC_URL` | URL public pentru STL locale (fără Supabase) |
| `CAD_MAX_RENDER_MS` | Timeout render OpenSCAD (default `120000`) |
| `OPENROUTER_API_KEY` | LLM pentru generare OpenSCAD |
| `CAD_LLM_MODEL` | Model OpenRouter (default `openai/gpt-4o-mini`) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role pentru insert/upload |

Fără `OPENROUTER_API_KEY`, serverul folosește un **fallback SCAD** parametric (cap cilindric).

Fără Supabase, job-urile și STL-urile sunt ținute **în memorie** pe server (`GET /cad/files/:id.stl`).

## Supabase

Rulează migrarea:

```bash
supabase db push
# sau aplică manual: supabase/migrations/004_cad_generations.sql
```

Bucket: `cad-models` (read public, write service role).

## Deploy Railway

**Important:** Railway rulează doar **CAD API** (`cad:serve`), nu aplicația Electron desktop.
Dacă vezi `libglib-2.0.so.0` / `electron`, înseamnă că Start Command e greșit (`npm start`).

### Pași

1. Creează un serviciu Railway din acest repo (root)
2. În **Settings → Build**:
   - Builder: **Dockerfile**
   - Dockerfile path: `engineering/cad-server/Dockerfile`
3. În **Settings → Deploy**:
   - Start Command: **gol** (lasă Dockerfile CMD) sau `npm start`
   - **Nu** folosi `npm run cad:serve` din root `package.json` (pornește Electron)
   - **Nu** folosi `npm start` din root repo (pornește Electron)
4. `railway link` + deploy, sau push pe branch conectat

### Variabile Railway

| Variabilă Railway | Obligatoriu | Note |
|-------------------|-------------|------|
| `OPENROUTER_API_KEY` | Recomandat | Fără ea → fallback SCAD simplu |
| `MESHY_API_KEY` | Opțional | Mesh organic/figurine (Print 3D); poate fi trimis și din app |
| `SUPABASE_URL` | Prod | Persistență job + STL |
| `SUPABASE_SERVICE_ROLE_KEY` | Prod | Upload bucket `cad-models` |
| `CAD_PUBLIC_URL` | Opțional | Auto din `RAILWAY_PUBLIC_DOMAIN` dacă lipsește |
| `CAD_MAX_RENDER_MS` | Opțional | Default 120000 |

4. Railway injectează `PORT` — serverul ascultă automat pe acest port (`0.0.0.0`)
5. Healthcheck: `GET /health`
6. După deploy, setează în Electron: `CAD_API_URL=https://<subdomeniu>.railway.app`

```bash
# Verificare rapidă după deploy
curl https://<subdomeniu>.railway.app/health
```

## API

| Method | Path | Descriere |
|--------|------|-----------|
| `GET` | `/health` | Healthcheck |
| `POST` | `/cad/jobs` | `{ prompt, projectType?, constraints?, cavalId? }` → `{ jobId }` |
| `GET` | `/cad/jobs/:id` | Status job + `stlUrl` + `scad` |
| `GET` | `/cad/files/:jobId.stl` | STL local (fără Supabase) |

## UI

În **Engineering AI**:

- Tab **Plan hardware** — plan markdown existent
- Tab **Model 3D** — viewer STL + sursă OpenSCAD
- Buton **Generează model 3D** — folosește același prompt + constrângeri

## Teste

```bash
npm test -- tests/engineering
```

`scad-runner.test.ts` sare automat dacă OpenSCAD nu e instalat.
