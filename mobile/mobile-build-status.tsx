import type { BuildStatus } from "./types";

export interface MobileBuildStatusProps {
  status: BuildStatus;
  buildUrl?: string;
}

export const MobileBuildStatus = ({ status, buildUrl }: MobileBuildStatusProps) => (
  <div className="cs-mobile-status">
    <h3>Status</h3>
    <p>
      {status === "idle" && "Ready to start build."}
      {status === "running" && "Build in progress..."}
      {status === "success" && "Build completed successfully."}
      {status === "error" && "Build failed. Check AI explanation below."}
    </p>
    {buildUrl && (
      <a href={buildUrl} target="_blank" rel="noreferrer" className="cs-mobile-build-link">
        Open build on Expo
      </a>
    )}
  </div>
);
