import type { PipelineEvent } from "../../components/ui/logicflow/types";
import type {
  AgentAuditReport,
  AgentPlatform,
  AuditCommandEntry,
  AuditPatchEntry,
  AuditTimelineEntry,
  Goal,
  HumanActionRequired,
  PlatformBuildStatus
} from "./types";

export const createReplayToken = (): string =>
  `replay-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const eventLabel = (event: PipelineEvent): string => {
  switch (event.type) {
    case "pipeline.start":
      return "Pipeline started";
    case "pipeline.finish":
      return "Pipeline finished";
    case "node.enter":
      return `Node: ${event.nodeId}`;
    case "edge.activate":
      return `Edge: ${event.edgeId}`;
    case "tool.call":
      return `Tool call: ${event.tool}`;
    case "tool.result":
      return `Tool result: ${event.success ? "success" : "failed"}`;
    case "error.occurred":
      return `Error: ${event.message}`;
  }
};

const toolToCommand = (tool: string, input?: unknown): string => {
  if (tool === "eas.build" && input && typeof input === "object" && "platform" in input) {
    return `npx eas build --platform ${String((input as { platform: string }).platform)} --non-interactive`;
  }
  if (tool === "npm.script" && input && typeof input === "object" && "script" in input) {
    return `npm run ${String((input as { script: string }).script)}`;
  }
  if (tool === "expo.doctor") return "npx expo doctor";
  return tool;
};

const buildPlatformSummary = (
  goal: Goal,
  commands: AuditCommandEntry[],
  ok: boolean,
  dryRun: boolean
): PlatformBuildStatus[] => {
  const statuses: PlatformBuildStatus[] = goal.platforms.map((platform) => ({
    platform,
    status: dryRun ? "dry_run" : "pending"
  }));

  for (const entry of commands) {
    if (!entry.command.includes("eas build")) continue;
    const platform = goal.platforms.find((p) => entry.command.includes(p));
    if (!platform) continue;
    const idx = statuses.findIndex((s) => s.platform === platform);
    if (idx < 0) continue;
    statuses[idx] = {
      platform,
      status: dryRun ? "dry_run" : entry.success ? "success" : "failed",
      message: dryRun
        ? "Dry run — build not executed"
        : entry.success
          ? "Build completed"
          : String(entry.output ?? "Build failed")
    };
  }

  if (ok && !dryRun) {
    for (const row of statuses) {
      if (row.status === "pending" && row.platform === "ota") {
        row.status = "skipped";
        row.message = "OTA handled separately";
      }
    }
  }

  return statuses;
};

const extractPatches = (events: PipelineEvent[], goal: Goal): AuditPatchEntry[] => {
  const patches: AuditPatchEntry[] = [];
  for (const event of events) {
    if (event.type !== "tool.result" || !event.success) continue;
    const output = event.output;
    if (!output || typeof output !== "object") continue;
    if ("patches" in output && Array.isArray((output as { patches: unknown }).patches)) {
      const list = (output as { patches: string[] }).patches;
      for (const patch of list) {
        const [path] = patch.split(":");
        patches.push({
          path: path?.trim() || "app.json",
          diff: [
            `--- a/${path?.trim() || "app.json"}`,
            `+++ b/${path?.trim() || "app.json"}`,
            `@@ version bump @@`,
            `-  "version": "1.0.0",`,
            `+  "version": "${goal.version}",`
          ].join("\n")
        });
      }
    }
    if ("patchFiles" in output && Array.isArray((output as { patchFiles: unknown }).patchFiles)) {
      for (const file of (output as { patchFiles: Array<{ path: string; patch: string }> }).patchFiles) {
        patches.push({ path: file.path, diff: file.patch });
      }
    }
  }
  return patches;
};

export const buildAuditReport = (input: {
  replayToken: string;
  goal: Goal;
  startedAt: number;
  finishedAt: number;
  ok: boolean;
  events: PipelineEvent[];
  humanActions: HumanActionRequired[];
}): AgentAuditReport => {
  const dryRun = input.goal.dryRun ?? false;

  const timeline: AuditTimelineEntry[] = input.events.map((event) => ({
    timestamp: event.timestamp,
    type: event.type,
    label: eventLabel(event),
    meta: "meta" in event ? event.meta : undefined
  }));

  const commands: AuditCommandEntry[] = [];
  const toolCalls = new Map<string, PipelineEvent & { type: "tool.call" }>();

  for (const event of input.events) {
    if (event.type === "tool.call") {
      toolCalls.set(event.id, event);
    }
    if (event.type === "tool.result") {
      const call = toolCalls.get(event.id);
      const inputVal = call?.input;
      const dry = Boolean(call?.meta?.dryRun ?? event.meta?.dryRun ?? dryRun);
      commands.push({
        id: event.id,
        command: call ? toolToCommand(call.tool, inputVal) : event.id,
        output: event.output,
        success: event.success,
        timestamp: event.timestamp,
        dryRun: dry
      });
    }
  }

  const unresolvedIssues = input.events
    .filter((e): e is PipelineEvent & { type: "error.occurred" } => e.type === "error.occurred")
    .map((e) => e.message);

  return {
    replayToken: input.replayToken,
    goal: input.goal,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    ok: input.ok,
    dryRun,
    summary: buildPlatformSummary(input.goal, commands, input.ok, dryRun),
    timeline,
    commands,
    patches: extractPatches(input.events, input.goal),
    humanActionsRequired: input.humanActions,
    unresolvedIssues
  };
};
