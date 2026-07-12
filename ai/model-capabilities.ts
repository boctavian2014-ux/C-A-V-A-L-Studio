import type { RoutingIntent } from "./types";

export interface CapabilityRoute {
  intent: RoutingIntent;
  primaryModel: string;
  fallbackModels: string[];
  reason: string;
}

export const capabilityRoutes: Record<RoutingIntent, CapabilityRoute> = {
  kilocode: {
    intent: "kilocode",
    primaryModel: "poolside-laguna-m-1",
    fallbackModels: ["qwen2.5-coder:7b", "stepfun-step-3-7-flash"],
    reason: "Large codebase edits route to Laguna first, with Qwen and StepFun as resilient fallbacks."
  },
  multi_file: {
    intent: "multi_file",
    primaryModel: "poolside-laguna-m-1",
    fallbackModels: ["qwen2.5-coder:7b", "stepfun-step-3-7-flash"],
    reason: "Multi-file edits need codebase-scale planning and patch discipline."
  },
  codebase: {
    intent: "codebase",
    primaryModel: "poolside-laguna-m-1",
    fallbackModels: ["qwen2.5-coder:7b", "llama3.1:70b"],
    reason: "Codebase understanding benefits from the largest coding context profile."
  },
  agent: {
    intent: "agent",
    primaryModel: "stepfun-step-3-7-flash",
    fallbackModels: ["nex-n2-pro", "qwen2.5-coder:7b"],
    reason: "Agent workflows prefer fast tool-aware planning."
  },
  tool_use: {
    intent: "tool_use",
    primaryModel: "stepfun-step-3-7-flash",
    fallbackModels: ["nex-n2-pro"],
    reason: "Tool calling requires provider-native tool support."
  },
  planning: {
    intent: "planning",
    primaryModel: "stepfun-step-3-7-flash",
    fallbackModels: ["poolside-laguna-m-1", "nex-n2-pro"],
    reason: "Planning favors low-latency structured agent output."
  },
  reasoning: {
    intent: "reasoning",
    primaryModel: "nex-n2-pro",
    fallbackModels: ["stepfun-step-3-7-flash", "llama3.1:70b"],
    reason: "Deep reasoning routes to Nex, with StepFun as frontier fallback when Nex is down."
  },
  deep_thinking: {
    intent: "deep_thinking",
    primaryModel: "nex-n2-pro",
    fallbackModels: ["stepfun-step-3-7-flash", "llama3.1:70b"],
    reason: "Highest reasoning depth uses Nex before other reasoning-capable models."
  },
  debug: {
    intent: "debug",
    primaryModel: "nvidia-nemotron-3-ultra",
    fallbackModels: ["nex-n2-pro", "llama3.1:70b"],
    reason: "Debugging and analysis route to Nemotron Ultra first."
  },
  analysis: {
    intent: "analysis",
    primaryModel: "nvidia-nemotron-3-ultra",
    fallbackModels: ["nex-n2-pro", "stepfun-step-3-7-flash"],
    reason: "Analysis needs debugger-style evidence ranking."
  },
  autocomplete: {
    intent: "autocomplete",
    primaryModel: "north-mini-code",
    fallbackModels: ["qwen2.5-coder:7b", "stepfun-step-3-7-flash"],
    reason: "Autocomplete prioritizes low latency, with North as the fast path."
  },
  fast: {
    intent: "fast",
    primaryModel: "north-mini-code",
    fallbackModels: ["stepfun-step-3-7-flash", "qwen2.5-coder:7b"],
    reason: "Fast tasks route to the lowest-latency code model."
  },
  documentation: {
    intent: "documentation",
    primaryModel: "stepfun-step-3-7-flash",
    fallbackModels: ["nex-n2-pro", "llama3.1:70b"],
    reason: "Documentation prefers structured output with adequate reasoning."
  },
  fallback: {
    intent: "fallback",
    primaryModel: "qwen2.5-coder:7b",
    fallbackModels: ["llama3.1:70b", "north-mini-code"],
    reason: "Fallback stays local first and uses North for fast coding rescue."
  }
};

export const getCapabilityRoute = (intent?: RoutingIntent): CapabilityRoute | undefined =>
  intent ? capabilityRoutes[intent] : undefined;
