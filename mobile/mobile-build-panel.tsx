import { useEffect, useState } from "react";
import { mobileBuildApi } from "./mobile-build-api";
import { MobileBuildActions } from "./mobile-build-actions";
import { MobileBuildHeader } from "./mobile-build-header";
import { MobileBuildPlatformSelect } from "./mobile-build-platform-select";
import { MobileBuildStatus } from "./mobile-build-status";
import { MobileBuildSteps } from "./mobile-build-steps";
import { MobileBuildTerminal } from "./mobile-build-terminal";
import { MobileBuildTutorial } from "./mobile-build-tutorial";
import type { MobileBuildState } from "./types";

export interface MobileBuildPanelProps {
  onStart?: (platform: MobileBuildState["platform"]) => void;
  onCancel?: () => void;
  onRerun?: () => void;
  onFixWithAI?: (state: MobileBuildState) => void;
}

export const MobileBuildPanel = ({
  onStart,
  onCancel,
  onRerun,
  onFixWithAI
}: MobileBuildPanelProps) => {
  const [state, setState] = useState<MobileBuildState>(mobileBuildApi.getState());

  useEffect(() => mobileBuildApi.subscribe(setState), []);

  return (
    <div className="cs-mobile-panel">
      <MobileBuildHeader onShowTutorial={() => mobileBuildApi.setShowTutorial(true)} />

      <div className="cs-mobile-layout">
        <div className="cs-mobile-left">
          <MobileBuildPlatformSelect
            platform={state.platform}
            onChange={(platform) => mobileBuildApi.setPlatform(platform)}
          />
          <MobileBuildSteps steps={state.steps} />
          <MobileBuildActions
            status={state.status}
            hasError={Boolean(state.lastError)}
            onStart={() => onStart?.(state.platform)}
            onCancel={() => onCancel?.()}
            onRerun={() => onRerun?.()}
            onFixWithAI={state.lastError ? () => onFixWithAI?.(state) : undefined}
          />
          {state.aiExplanation && (
            <div className="cs-mobile-ai-explanation">
              <h4>AI explanation</h4>
              <p>{state.aiExplanation}</p>
              {state.suggestedCommands.map((cmd) => (
                <code key={cmd}>{cmd}</code>
              ))}
            </div>
          )}
        </div>

        <div className="cs-mobile-right">
          <MobileBuildStatus status={state.status} buildUrl={state.buildUrl} />
          <MobileBuildTerminal logs={state.logs} lastError={state.lastError} />
        </div>
      </div>

      <MobileBuildTutorial
        open={state.showTutorial}
        onClose={() => mobileBuildApi.setShowTutorial(false)}
      />
    </div>
  );
};
