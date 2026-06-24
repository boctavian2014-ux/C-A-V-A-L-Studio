import { Badge } from "../../ui-kit/components/badge";
import { Button } from "../../ui-kit/components/button";
import type { ReviewFile } from "./types";

export interface CodeReviewFileProps {
  file: ReviewFile;
  selected?: boolean;
  onSelect?: (fileId: string) => void;
  onAcceptFile?: (fileId: string) => void;
  onRejectFile?: (fileId: string) => void;
}

const decisionTone = (decision: ReviewFile["decision"]) => {
  if (decision === "accepted") return "success" as const;
  if (decision === "rejected") return "error" as const;
  return "warning" as const;
};

export const CodeReviewFile = ({
  file,
  selected = false,
  onSelect,
  onAcceptFile,
  onRejectFile
}: CodeReviewFileProps) => (
  <div className={`caval-review-file ${selected ? "is-selected" : ""}`}>
    <button type="button" className="caval-review-file__select" onClick={() => onSelect?.(file.id)}>
      <strong>{file.path}</strong>
      <div className="caval-review-file__meta">
        <Badge tone={decisionTone(file.decision)}>{file.decision}</Badge>
        <span className="caval-review-file__stats">
          <span className="add">+{file.stats.additions}</span>
          <span className="del">−{file.stats.deletions}</span>
        </span>
      </div>
      {file.semanticSummary && <small>{file.semanticSummary}</small>}
    </button>
    <div className="caval-review-file__actions">
      <Button size="sm" variant="ghost" onClick={() => onAcceptFile?.(file.id)}>Accept</Button>
      <Button size="sm" variant="ghost" onClick={() => onRejectFile?.(file.id)}>Reject</Button>
    </div>
  </div>
);
