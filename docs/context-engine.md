# Context Engine

Context Engine-ul transforma workspace-ul in context utilizabil de AI:

- `indexer.ts` scaneaza fisierele, calculeaza hash-uri si produce chunks.
- `embeddings.ts` genereaza embeddings printr-un provider interschimbabil.
- `vector-db.ts` mentine un store vectorial in memorie.
- `semantic-search.ts` cauta semantic peste chunks.
- `dependency-graph.ts` extrage importuri si require-uri.
- `local-cache.ts` persista documentele indexate in `.caval/context-cache`.
- `api.ts` expune un punct de integrare pentru AI Layer.

## Directie de productie

- Inlocuieste embeddings deterministe cu model local sau remote.
- Inlocuieste vector DB in memorie cu SQLite + sqlite-vss, LanceDB sau Qdrant.
- Adauga incremental indexing pe file watcher.
- Adauga redaction pentru secrete si fisiere sensibile.
