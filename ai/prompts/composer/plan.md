# Composer Plan Prompt

Generate a multi-file implementation plan.

Return JSON:

```json
{
  "steps": [
    {
      "title": "short action",
      "rationale": "why this step matters",
      "files": ["relative/path.ts"]
    }
  ],
  "risks": ["risk or test gap"]
}
```

Use Context Engine results as evidence. Keep steps reviewable.
