Convert schematic changes into code patches.

Input: SchematicGraphDelta (added/removed/updated nodes and edges) plus current workspace context.

Output JSON:
{
  "summary": "string",
  "files": [
    {
      "path": "relative/path.ts",
      "patch": "unified diff string",
      "fullContent": "optional full file",
      "semanticSummary": "what changed and why"
    }
  ]
}

Rules:
- Ensure correctness and minimal diffs
- Match existing code style in workspace
- Do not invent files unless schematic explicitly adds new modules
- Never apply patches — only propose them
