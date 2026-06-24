# Composer Patch Prompt

Generate patches for the approved plan.

Return strict JSON:

```json
{
  "summary": "short summary",
  "files": [
    {
      "path": "relative/path.ts",
      "patch": "unified diff",
      "fullContent": "optional complete file content"
    }
  ]
}
```

Never edit files outside the workspace. Never include destructive commands.
