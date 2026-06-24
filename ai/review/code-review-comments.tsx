import { Badge } from "../../ui-kit/components/badge";
import { Button } from "../../ui-kit/components/button";
import type { ReviewComment } from "./types";

export interface CodeReviewCommentsProps {
  comments: ReviewComment[];
  targetId?: string;
  onAddComment?: (text: string) => void;
}

export const CodeReviewComments = ({ comments, targetId, onAddComment }: CodeReviewCommentsProps) => {
  const filtered = targetId
    ? comments.filter((comment) => comment.targetId === targetId)
    : comments;

  return (
    <div className="caval-review-comments">
      {filtered.map((comment) => (
        <article key={comment.id} className={`caval-review-comment caval-review-comment--${comment.author}`}>
          <header>
            <Badge tone={comment.author === "ai" ? "premium" : "info"}>{comment.author}</Badge>
            <time>{new Date(comment.createdAt).toLocaleTimeString()}</time>
          </header>
          <p>{comment.text}</p>
        </article>
      ))}
      {onAddComment && (
        <form
          className="caval-review-comment-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const input = form.querySelector<HTMLInputElement>("input");
            if (!input?.value.trim()) return;
            onAddComment(input.value.trim());
            input.value = "";
          }}
        >
          <input type="text" placeholder="Add review comment..." />
          <Button type="submit" size="sm" variant="secondary">Comment</Button>
        </form>
      )}
    </div>
  );
};
