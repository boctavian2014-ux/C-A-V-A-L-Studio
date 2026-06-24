# Suggestions Risks Prompt

Identify risks across these categories:

- **breaking_change** — API/signature/contract changes
- **side_effect** — unintended behavior in related modules
- **performance** — latency, memory, hot-path regressions
- **security** — auth, secrets, injection, data exposure
- **architecture** — coupling, circular deps, layering violations

For each risk provide:

- Severity: low | medium | high | critical
- Clear title and description
- Optional mitigation step

Never downplay security or breaking-change risks.
