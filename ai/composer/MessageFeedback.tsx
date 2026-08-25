import React, { useEffect, useState } from "react";

import type { MessageFeedback as MessageFeedbackRow } from "../../src/shared/ai-history-contract";
import { useTranslation } from "../i18n/useTranslation";

function ThumbUpIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4.5 6.5V13h-1a1 1 0 01-1-1v-4a1 1 0 011-1h1zm2-3.5a1 1 0 011 1v1h2.5a1.5 1.5 0 011.46 1.13l.7 2.8A1.5 1.5 0 0111.2 11H8.5V6.5a1 1 0 00-1-1H6.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
      />
    </svg>
  );
}

function ThumbDownIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M11.5 9.5V3h1a1 1 0 011 1v4a1 1 0 01-1 1h-1zm-2 3.5a1 1 0 01-1-1V11H6a1.5 1.5 0 01-1.46-1.13l-.7-2.8A1.5 1.5 0 014.8 5H7.5v4.5a1 1 0 001 1h1z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
      />
    </svg>
  );
}

export function MessageFeedbackButtons({
  messageId,
  streamId,
}: {
  messageId: string;
  streamId?: string | null;
}): React.ReactElement {
  const { t } = useTranslation();
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

  return (
    <div className="message-feedback" data-testid="message-feedback">
      <div className="message-feedback-actions">
        <button
          type="button"
          data-testid="message-feedback-up"
          className={`feedback-btn${feedback?.rating === "positive" ? " active" : ""}`}
          disabled={busy}
          onClick={() => void handleRate("positive")}
          title={t("ai.feedback.good")}
          aria-label={t("ai.feedback.good")}
          aria-pressed={feedback?.rating === "positive"}
        >
          <ThumbUpIcon active={feedback?.rating === "positive"} />
        </button>
        <button
          type="button"
          data-testid="message-feedback-down"
          className={`feedback-btn${feedback?.rating === "negative" ? " active" : ""}`}
          disabled={busy}
          onClick={() => void handleRate("negative")}
          title={t("ai.feedback.bad")}
          aria-label={t("ai.feedback.bad")}
          aria-pressed={feedback?.rating === "negative"}
        >
          <ThumbDownIcon active={feedback?.rating === "negative"} />
        </button>
      </div>

      {showComment && (
        <div className="feedback-comment" data-testid="message-feedback-comment">
          <textarea
            placeholder="What went wrong? (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            disabled={busy}
          />
          <div className="feedback-comment-actions">
            <button
              type="button"
              data-testid="message-feedback-comment-submit"
              disabled={busy}
              onClick={() => void handleCommentSubmit()}
              className="feedback-btn active"
            >
              Submit
            </button>
            <button
              type="button"
              data-testid="message-feedback-comment-cancel"
              disabled={busy}
              onClick={() => setShowComment(false)}
              className="feedback-btn"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="message-feedback-error">
          {error}
        </div>
      )}
    </div>
  );
}
