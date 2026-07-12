# Configurare modele CAVALLO

Ghid pentru activarea tuturor modelelor din CAVALLO Studio.

## Chei API necesare

| Furnizor | Variabilă / câmp UI | Modele deblocate | Înregistrare |
|----------|---------------------|------------------|--------------|
| **OpenRouter** | `OPENROUTER_API_KEY` / Panoul AI → 🔑 | StepFun, Nex N2 Pro, catalog OpenRouter | https://openrouter.ai/keys |
| **Poolside** | `POOLSIDE_API_KEY` | Poolside Laguna M.1 | https://poolside.ai |
| **NVIDIA NIM** | `NVIDIA_API_KEY` | Nemotron-3 Ultra | https://build.nvidia.com/settings |
| **North** | `NORTH_API_KEY` | North Mini Code, autocomplete | https://north.ai |
| **Anthropic** | `anthropic` (BYOK) | Claude Opus, Claude Sonnet | https://console.anthropic.com |
| **OpenAI** | `openai` (BYOK) | GPT-4o, GPT-4o mini | https://platform.openai.com |
| **Google** | `google` (BYOK) | Gemini 2.5 Pro/Flash | https://aistudio.google.com |
| **Ollama** | fără cheie — `ollama.url` | qwen2.5-coder:7b, llama3.1:8b/70b | https://ollama.com |

Toate cheile se salvează local în `%APPDATA%/caval-studio/caval-api-keys.bin` (criptat când e posibil).

## Setup rapid

### 1. Modele locale (gratuit)

```bash
node scripts/setup-ollama-models.mjs
```

Sau manual:

```bash
ollama pull qwen2.5-coder:7b
ollama pull llama3.1:8b
```

În panoul AI selectează **Auto Free**.

### 2. Cloud (o singură cheie)

1. Panoul AI → **🔑 API Keys**
2. Adaugă **OpenRouter** (`sk-or-...`)
3. Selectează **Auto Balanced** sau **Auto Frontier**

### 3. Stack complet (premium direct)

În **API Keys**, completează toate câmpurile:

- OpenRouter
- Poolside
- NVIDIA NIM
- North
- Ollama URL (default `http://localhost:11434`)

Apasă **Verifică toate modelele** pentru status.

## Modele per tier Auto

| Tier | Comportament |
|------|--------------|
| **Auto Free** | Ollama local (modele instalate) → fallback OpenRouter dacă lipsește Ollama |
| **Auto Balanced** | OpenRouter (StepFun etc.) → fallback Ollama |
| **Auto Frontier** | Cele mai capabile modele cloud disponibile |

## Config `caval.jsonc`

```jsonc
"models": {
  "default": "caval-auto/balanced",
  "perMode": {
    "ask": "caval-auto/balanced",
    "code": "caval-auto/free",
    "agentic": "caval-auto/balanced",
    "plan": "caval-auto/frontier",
    "debug": "caval-auto/balanced"
  }
},
"autocomplete": {
  "model": "north-mini-code",
  "enabled": true
}
```

La schimbarea modului (Ask/Code/Agentic…), modelul din `perMode` se aplică automat.

Dacă lipsește `NORTH_API_KEY`, autocomplete folosește `qwen2.5-coder:7b` (Ollama).

## Indicatori în UI

- **●** verde în dropdown = model gata
- **○** = cheie lipsă
- **◌** = Ollama offline sau model nepullat
- Banner galben în panoul AI = modelul selectat nu e configurat

## Depanare

| Eroare | Soluție |
|--------|---------|
| `Modelul nu este disponibil la furnizor` | Verifică cheia pentru furnizorul modelului |
| `Ollama failed HTTP 404` | `ollama pull <model>` |
| `OpenRouter neconfigurat` | Adaugă cheie sau folosește Auto Free |
| `NVIDIA 404` | Verifică `NVIDIA_API_KEY` și model slug `nvidia/nemotron-3-ultra-550b-a55b` |
