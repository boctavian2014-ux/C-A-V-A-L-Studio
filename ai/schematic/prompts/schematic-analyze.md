Detect architecture issues in a schematic graph.

Analyze for:
- circular dependencies (call + dependency edges)
- dead code / orphan nodes (no connections)
- inconsistent data paths (data_flow to nodes without input pins)
- god modules (excessive fan-in/fan-out)
- missing error handling on api_endpoint nodes
- ai_agent nodes without tool/context inputs

Return JSON array of issues:
[
  {
    "id": "string",
    "severity": "info" | "warning" | "error",
    "kind": "circular_dependency" | "dead_node" | "inconsistent_data_path" | "architecture",
    "message": "string",
    "nodeIds": ["optional"],
    "edgeIds": ["optional"]
  }
]

Combine with deterministic client-side analysis when possible.
