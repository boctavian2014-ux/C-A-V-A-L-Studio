import { useState } from "react";
import { Button } from "./Button";
import { agentApi } from "./agent-api";
import { eventBus } from "./logicflow/EventBus";

const PRESET_TOOLS = [
  { label: "Expo Doctor", tool: "expo.doctor", input: undefined },
  { label: "EAS Android", tool: "eas.build", input: { platform: "android" } },
  { label: "EAS iOS", tool: "eas.build", input: { platform: "ios" } },
  { label: "CI Tests", tool: "npm.script", input: { script: "cicd:test" } }
] as const;

export const SandboxRunnerPanel = () => {
  const [selectedTool, setSelectedTool] = useState<string>(PRESET_TOOLS[0].tool);
  const [platform, setPlatform] = useState<"android" | "ios">("android");
  const [logs, setLogs] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const appendLog = (line: string): void => {
    setLogs((prev) => [...prev, line]);
  };

  const runPreset = async (tool: string, input?: unknown): Promise<void> => {
    if (running) return;
    setRunning(true);
    const toolCallId = `manual-${Date.now()}`;
    appendLog(`> ${tool} ${input ? JSON.stringify(input) : ""}`.trim());

    eventBus.emit({
      type: "tool.call",
      id: toolCallId,
      tool,
      input,
      timestamp: Date.now(),
      meta: { source: "sandbox-panel" }
    });

    const result = await agentApi.sandboxRun(tool, input, toolCallId);

    eventBus.emit({
      type: "tool.result",
      id: toolCallId,
      success: result.ok,
      output: result.ok ? result.output : { error: result.error },
      timestamp: Date.now(),
      meta: { source: "sandbox-panel" }
    });

    if (result.ok) {
      appendLog(`✔ ${JSON.stringify(result.output)}`);
    } else {
      appendLog(`✖ ${result.error ?? "Failed"}`);
    }
    setRunning(false);
  };

  const runSelected = async (): Promise<void> => {
    const input =
      selectedTool === "eas.build" || selectedTool === "expo.build"
        ? { platform }
        : selectedTool === "npm.script"
          ? { script: "cicd:test" }
          : undefined;
    await runPreset(selectedTool, input);
  };

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <header>
        <h3 className="text-lg font-semibold text-[var(--pt-cyan)]">Sandbox Runner</h3>
        <p className="text-xs text-[var(--pt-text-secondary)] mt-1">
          Run allowed tools through the main-process sandbox (no arbitrary shell).
        </p>
      </header>

      <div className="flex gap-2 flex-wrap">
        {PRESET_TOOLS.map((preset) => (
          <Button
            key={preset.tool + preset.label}
            variant="secondary"
            size="sm"
            disabled={running}
            onClick={() => void runPreset(preset.tool, preset.input)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <select
          className="bg-[var(--pt-surface-3)] border border-[var(--pt-border)] rounded px-2 py-1 text-sm text-[var(--pt-text-primary)]"
          value={selectedTool}
          onChange={(e) => setSelectedTool(e.target.value)}
          aria-label="Sandbox tool"
        >
          <option value="expo.doctor">expo.doctor</option>
          <option value="eas.build">eas.build</option>
          <option value="expo.build">expo.build</option>
          <option value="npm.script">npm.script</option>
        </select>

        {(selectedTool === "eas.build" || selectedTool === "expo.build") && (
          <select
            className="bg-[var(--pt-surface-3)] border border-[var(--pt-border)] rounded px-2 py-1 text-sm text-[var(--pt-text-primary)]"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as "android" | "ios")}
            aria-label="Platform"
          >
            <option value="android">android</option>
            <option value="ios">ios</option>
          </select>
        )}

        <Button variant="primary" size="sm" disabled={running} onClick={() => void runSelected()}>
          {running ? "Running..." : "Run"}
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface-3)] p-3 font-mono text-xs">
        {logs.length === 0 && (
          <div className="text-[var(--pt-text-secondary)]">No sandbox output yet.</div>
        )}
        {logs.map((line, index) => (
          <div key={`${index}-${line}`} className="text-[var(--pt-text-secondary)] mb-1">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
};
