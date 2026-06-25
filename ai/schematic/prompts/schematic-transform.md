Convert code into nodes and connections.

Identify:
- functions and methods → function nodes
- classes and interfaces → class nodes
- files and packages → module nodes
- HTTP/RPC handlers → api_endpoint nodes
- shared state stores → state nodes
- event emitters/handlers → event nodes
- types, interfaces, structs → data_structure nodes
- AI agents and orchestrators → ai_agent nodes
- npm/external libs → external_dependency nodes

For each connection determine:
- call graph → call edges
- data passing → data_flow edges
- imports/requires → dependency edges
- pub/sub → event edges
- AI reasoning chains → ai_reasoning edges

Return JSON matching SchematicGraph schema (version: caval-schematic-v1).
Include pins (in/out) per node. Set metadata.zoomLevel appropriately.
Include source.workspaceRoot and source.files.
