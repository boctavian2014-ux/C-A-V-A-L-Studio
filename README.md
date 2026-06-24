# Caval Studio

Caval Studio este un IDE romanesc modern, premium, construit pe directia unui fork VS Code, cu AI frontier, Context Engine avansat, Marketplace propriu si Romania Layer.

## Stack

- Electron pentru shell desktop.
- TypeScript strict pentru runtime si servicii.
- Webpack pentru bundle main, renderer si servicii Node.
- Node 20+ ca baseline.

## Build

```bash
npm install
npm run typecheck
npm run build
npm start
```

## Structura

- `src/core/` - Core Editor Layer si adaptorul pentru fork VS Code.
- `ai/` - AI Layer: model router, provideri, composer si agenti.
- `context-engine/` - indexare, embeddings, vector DB, semantic search si dependency graph.
- `src/extensions/` - extension host si compatibilitate VS Code.
- `marketplace/` - API, server registry si client pentru extensii.
- `src/cloud-services/` - accounts, sync, telemetry.
- `romania/` - localizare RO, ANAF, eFactura, ONRC, Education Mode.
- `branding/` - brandbook, directii logo si teme.
- `docs/` - arhitectura, roadmap si documentatie pe straturi.
