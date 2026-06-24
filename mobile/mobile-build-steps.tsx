import type { BuildStep } from "./types";

export interface MobileBuildStepsProps {
  steps: BuildStep[];
}

export const MobileBuildSteps = ({ steps }: MobileBuildStepsProps) => (
  <div className="cs-mobile-steps">
    <h3>Build steps</h3>
    <ul>
      {steps.map((step) => (
        <li key={step.id} className={`cs-step cs-step-${step.status}`}>
          <span className="cs-step-label">{step.label}</span>
          <span className="cs-step-status">{step.status}</span>
        </li>
      ))}
    </ul>
  </div>
);
