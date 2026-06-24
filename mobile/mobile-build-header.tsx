import { Button } from "../components/ui/Button";
import type { BuildStatus } from "./types";

export interface MobileBuildHeaderProps {
  onShowTutorial: () => void;
}

export const MobileBuildHeader = ({ onShowTutorial }: MobileBuildHeaderProps) => (
  <header className="cs-mobile-header">
    <div>
      <h2>Build Mobile App</h2>
      <p>Android and iOS using Expo EAS, directly from Caval Studio.</p>
    </div>
    <Button variant="secondary" size="sm" onClick={onShowTutorial}>
      Watch tutorial
    </Button>
  </header>
);
