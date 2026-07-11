# Architecture Overview

CAVALO is an Electron IDE with AI, Context Engine indexing, and a Marketplace for extensions.

## Major layers

1. **Context Engine** — workspace indexing, semantic search, embeddings, and warm-cache preloading for AI context.
2. **AI Composer** — chat, Agentic multi-agent pipeline, zero-latency prepare, and scaffold file emission.
3. **Marketplace** — extension manifests, validation, and local marketplace server.
4. **Discovery Layer** — collects information about project files.
5. **Enterprise Readiness Checklist** — defines criteria for enterprise-level readiness.
6. **Audit Modules** — verifies security, testing, CI/CD, and observability.