import { Button } from "../../ui-kit/components/button";
import { Panel } from "../../ui-kit/components/panel";
import type { CodeReviewSession } from "./types";
import { CodeReviewDiff } from "./code-review-diff";
import { CodeReviewComments } from "./code-review-comments";

export interface CodeReviewPanelProps {
  session: CodeReviewSession | null;
  onAcceptAll?: () => void;
  onRejectAll?: () => void;
  onApplySelected?: () => void;
  onAskAIToRevise?: () => void;
  onAcceptFile?: (fileId: string) => void;
  onRejectFile?: (fileId: string) => void;
  onAcceptHunk?: (hunkId: string) => void;
  onRejectHunk?: (hunkId: string) => void;
  onAcceptLine?: (lineId: string) => void;
  onRejectLine?: (lineId: string) => void;
  onAddComment?: (targetId: string, text: string) => void;
}

export const CodeReviewPanel = ({
  session,
  onAcceptAll,
  onRejectAll,
  onApplySelected,
  onAskAIToRevise,
  onAcceptFile,
  onRejectFile,
  onAcceptHunk,
  onRejectHunk,
  onAcceptLine,
  onRejectLine,
  onAddComment
}: CodeReviewPanelProps) => {
  if (!session) {
    return (
      <Panel title="AI Code Review" variant="ai">
        <p className="caval-review__empty">No patches pending review. Generate a Composer plan to preview diffs here.</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="AI Code Review"
      variant="ai"
      actions={
        <div className="caval-review__actions">
          <Button size="sm" variant="ghost" onClick={onRejectAll}>Reject All</Button>
          <Button size="sm" variant="secondary" onClick={onAskAIToRevise}>Ask AI to Revise</Button>
          <Button size="sm" variant="secondary" onClick={onAcceptAll}>Accept All</Button>
          <Button size="sm" variant="primary" onClick={onApplySelected}>Apply Selected</Button>
        </div>
      }
    >
      <header className="caval-review__summary">
        <p>{session.summary}</p>
        <small>{session.files.length} files · status: {session.status}</small>
      </header>
      <CodeReviewDiff
        session={session}
        onAcceptFile={onAcceptFile}
        onRejectFile={onRejectFile}
        onAcceptHunk={onAcceptHunk}
        onRejectHunk={onRejectHunk}
        onAcceptLine={onAcceptLine}
        onRejectLine={onRejectLine}
        onAddComment={onAddComment}
      />
      <CodeReviewComments comments={session.comments} />
    </Panel>
  );
};
