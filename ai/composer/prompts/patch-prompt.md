# Patch Prompt

Generate patches for the approved plan.

Return strict JSON:

```json
{
  "summary": "string",
  "files": [
    {
      "path": "relative/path.ts",
      "patch": "unified diff",
      "fullContent": "optional full content",
      "semanticSummary": "what changed and why"
    }
  ]
}
```

Constraints:
- Keep patch sets small.
- Avoid unrelated refactors.
- Preserve behavior unless the plan explicitly changes it.
- Never include destructive shell commands.
