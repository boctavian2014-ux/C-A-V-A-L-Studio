import { SafetyGuard } from "./guard";
import type { ModelRequest, RoutingIntent } from "../types";

const guard = new SafetyGuard();

export function assertRendererChatAllowed(input: {
  prompt: string;
  system?: string;
  workspaceRoot?: string | null;
  capability?: ModelRequest["capability"];
  intent?: RoutingIntent;
}): void {
  guard.assertRequestAllowed({
    prompt: input.prompt,
    system: input.system,
    capability: input.capability ?? "chat",
    intent: input.intent ?? "fallback",
    metadata: { workspaceRoot: input.workspaceRoot ?? undefined },
    messages: [
      ...(input.system ? [{ role: "system" as const, content: input.system }] : []),
      { role: "user" as const, content: input.prompt },
    ],
  });
}
