import { Badge } from "../../ui-kit/components/badge";
import { Button } from "../../ui-kit/components/button";
import type { ReviewComment, ReviewHunk } from "./types";
import { CodeReviewComments } from "./code-review-comments";

export interface CodeReviewHunkProps {
  hunk: ReviewHunk;
  comments?: ReviewComment[];
  onAcceptHunk?: (hunkId: string) => void;
  onRejectHunk?: (hunkId: string) => void;
  onAcceptLine?: (lineId: string) => void;
  onRejectLine?: (lineId: string) => void;
  onAddComment?: (hunkId: string, text: string) => void;
}

const lineClass = (type: string, decision: string) =>
  `caval-review-line caval-review-line--${type} ${decision !== "pending" ? `is-${decision}` : ""}`.trim();

export const CodeReviewHunkView = ({
  hunk,
  comments = [],
  onAcceptHunk,
  onRejectHunk,
  onAcceptLine,
  onRejectLine,
  onAddComment
}: CodeReviewHunkProps) => (
  <section className={`caval-review-hunk ${hunk.decision !== "pending" ? `is-${hunk.decision}` : ""}`}>
    <header className="caval-review-hunk__header">
      <code>{hunk.header}</code>
      <div className="caval-review-hunk__actions">
        <Button size="sm" variant="ghost" onClick={() => onAcceptHunk?.(hunk.id)}>Accept hunk</Button>
        <Button size="sm" variant="ghost" onClick={() => onRejectHunk?.(hunk.id)}>Reject hunk</Button>
      </div>
    </header>
    {hunk.aiExplanation && <p className="caval-review-hunk__ai">{hunk.aiExplanation}</p>}
    <div className="caval-review-hunk__lines">
      {hunk.lines.map((line) => (
        <div key={line.id} className={lineClass(line.type, line.decision)}>
          <span className="caval-review-line__gutter">
            {line.oldLineNumber ?? ""}
            {line.newLineNumber ? ` / ${line.newLineNumber}` : ""}
          </span>
          <code className="caval-review-line__content">{line.content || " "}</code>
          {line.semanticTag && <Badge tone="premium">{line.semanticTag}</Badge>}
          <div className="caval-review-line__actions">
            <button type="button" onClick={() => onAcceptLine?.(line.id)}>✓</button>
            <button type="button" onClick={() => onRejectLine?.(line.id)}>✕</button>
          </div>
        </div>
      ))}
    </div>
    <CodeReviewComments
      comments={comments}
      targetId={hunk.id}
      onAddComment={onAddComment ? (text) => onAddComment(hunk.id, text) : undefined}
    />
  </section>
);
