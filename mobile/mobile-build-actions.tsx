import { Button } from "../components/ui/Button";
import type { BuildStatus } from "./types";

export interface MobileBuildActionsProps {
  status: BuildStatus;
  hasError: boolean;
  onStart: () => void;
  onCancel: () => void;
  onRerun: () => void;
  onFixWithAI?: () => void;
}

export const MobileBuildActions = ({
  status,
  hasError,
  onStart,
  onCancel,
  onRerun,
  onFixWithAI
}: MobileBuildActionsProps) => (
  <div className="cs-mobile-actions">
    {status === "idle" && (
      <Button variant="primary" size="sm" className="pt-pulse" onClick={onStart}>
        Start build
      </Button>
    )}
    {status === "running" && (
      <Button variant="secondary" size="sm" onClick={onCancel}>
        Cancel build
      </Button>
    )}
    {status === "error" && (
      <>
        <Button variant="primary" size="sm" onClick={onRerun}>
          Re-run build
        </Button>
        {hasError && onFixWithAI && (
          <Button variant="ghost" size="sm" onClick={onFixWithAI}>
            Fix with AI
          </Button>
        )}
      </>
    )}
    {status === "success" && (
      <Button variant="secondary" size="sm" onClick={onRerun}>
        Build again
      </Button>
    )}
  </div>
);
