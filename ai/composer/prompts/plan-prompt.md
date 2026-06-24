# Plan Prompt

Create a logical multi-step implementation plan.

Input:
- Objective
- Relevant files
- Affected symbols
- Dependency notes
- User constraints

Return strict JSON:

```json
{
  "objective": "string",
  "steps": [
    {
      "id": "step-1",
      "title": "string",
      "rationale": "string",
      "files": ["relative/path.ts"],
      "symbols": ["SymbolName"],
      "risk": "low"
    }
  ],
  "risks": ["string"],
  "validation": ["typecheck", "build", "tests"]
}
```
