import React, { useEffect, useState } from "react";

import type { MessageFeedback as MessageFeedbackRow } from "../../src/shared/ai-history-contract";

export function MessageFeedbackButtons({
  messageId,
  streamId,
}: {
  messageId: string;
  streamId?: string | null;
}): React.ReactElement {
  const [feedback, setFeedback] = useState<MessageFeedbackRow | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const api = window.caval?.aiHistory;
    if (!api?.getFeedback) return;
    void api.getFeedback(messageId, streamId ?? undefined).then((res) => {
      if (cancelled) return;
      if (res.ok) setFeedback(res.feedback ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [messageId, streamId]);

  const handleRate = async (rating: "positive" | "negative") => {
    const api = window.caval?.aiHistory;
    if (!api?.setFeedback || !api.clearFeedback) return;
    setBusy(true);
    setError(null);
    try {
      if (feedback?.rating === rating) {
        const res = await api.clearFeedback(messageId, streamId ?? undefined);
        if (!res.ok) {
          setError(res.error ?? "Could not clear feedback");
          return;
        }
        setFeedback(null);
        setShowComment(false);
        setComment("");
        return;
      }
      const res = await api.setFeedback(messageId, rating, undefined, streamId ?? undefined);
      if (!res.ok || !res.feedback) {
        setError(res.error ?? "Could not save feedback");
        return;
      }
      setFeedback(res.feedback);
      setShowComment(rating === "negative");
      if (rating === "positive") setComment("");
    } finally {
      setBusy(false);
    }
  };

  const handleCommentSubmit = async () => {
    if (!feedback) return;
    const api = window.caval?.aiHistory;
    if (!api?.setFeedback) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.setFeedback(
        messageId,
        feedback.rating,
        comment.trim() || undefined,
        streamId ?? undefined
      );
      if (!res.ok || !res.feedback) {
        setError(res.error ?? "Could not save comment");
        return;
      }
      setFeedback(res.feedback);
      setShowComment(false);
    } finally {
      setBusy(false);
    }
  };

  const btnStyle = (active: boolean): React.CSSProperties => ({
    height: 24,
    minWidth: 28,
    padding: "0 6px",
    borderRadius: 4,
    border: active
      ? "1px solid var(--caval-accent-ring)"
      : "1px solid var(--caval-border)",
    background: active ? "var(--caval-accent-glow)" : "transparent",
    color: active ? "var(--caval-accent)" : "var(--caval-text-muted)",
    cursor: busy ? "wait" : "pointer",
    fontSize: 12,
    lineHeight: 1,
  });

  return (
    <div
      className="message-feedback"
      data-testid="message-feedback"
      style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          data-testid="message-feedback-up"
          className={`feedback-btn${feedback?.rating === "positive" ? " active" : ""}`}
          disabled={busy}
          onClick={() => void handleRate("positive")}
          title="Good response"
          aria-label="Good response"
          aria-pressed={feedback?.rating === "positive"}
          style={btnStyle(feedback?.rating === "positive")}
        >
          👍
        </button>
        <button
          type="button"
          data-testid="message-feedback-down"
          className={`feedback-btn${feedback?.rating === "negative" ? " active" : ""}`}
          disabled={busy}
          onClick={() => void handleRate("negative")}
          title="Bad response"
          aria-label="Bad response"
          aria-pressed={feedback?.rating === "negative"}
          style={btnStyle(feedback?.rating === "negative")}
        >
          👎
        </button>
      </div>

      {showComment && (
        <div
          className="feedback-comment"
          data-testid="message-feedback-comment"
          style={{ display: "flex", flexDirection: "column", gap: 6 }}
        >
          <textarea
            placeholder="What went wrong? (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            disabled={busy}
            style={{
              width: "100%",
              resize: "vertical",
              fontSize: 11,
              padding: 6,
              borderRadius: 4,
              border: "1px solid var(--caval-border)",
              background: "var(--caval-surface-raised)",
              color: "var(--caval-text)",
              fontFamily: "inherit",
            }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              data-testid="message-feedback-comment-submit"
              disabled={busy}
              onClick={() => void handleCommentSubmit()}
              style={btnStyle(true)}
            >
              Submit
            </button>
            <button
              type="button"
              data-testid="message-feedback-comment-cancel"
              disabled={busy}
              onClick={() => setShowComment(false)}
              style={btnStyle(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" style={{ fontSize: 10, color: "var(--caval-error)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
