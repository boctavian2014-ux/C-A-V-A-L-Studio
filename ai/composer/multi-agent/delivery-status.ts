import type { CompletionGateResult } from '../completion-gate-types';

const NEEDS_REVIEW_TAG = '[NEEDS_REVIEW]';

export interface DeliveryOutcomeInput {
  gate: CompletionGateResult;
  composeText: string;
  chatSummary: string;
  supervisorSummary?: string;
  supervisorFallback: boolean;
  writtenFiles: string[];
}

export interface DeliveryOutcome {
  deliveryBlocked: boolean;
  needsReview: boolean;
  verifyPending: boolean;
  text: string;
}

function buildNeedsReviewBanner(gate: CompletionGateResult, supervisorSummary?: string): string {
  const lines = [`⚠️ ${NEEDS_REVIEW_TAG}`];
  const soft = gate.softIssues.slice(0, 6);
  if (soft.length > 0) {
    lines.push(...soft.map((i) => `- ${i.message}`));
  } else if (supervisorSummary?.trim()) {
    lines.push(supervisorSummary.trim().slice(0, 400));
  }
  return lines.join('\n');
}

export function resolveDeliveryOutcome(input: DeliveryOutcomeInput): DeliveryOutcome {
  const {
    gate,
    composeText,
    chatSummary,
    supervisorSummary,
    supervisorFallback,
    writtenFiles,
  } = input;

  const needsReview = Boolean(gate.needsReview || gate.softIssues.length > 0);
  const verifyPending = Boolean(gate.verifyPending);
  const hasFiles = writtenFiles.length > 0 || composeText.includes('```');

  if (gate.ok && !needsReview && !verifyPending) {
    return {
      deliveryBlocked: false,
      needsReview: false,
      verifyPending: false,
      text: composeText.trim() ? composeText : chatSummary,
    };
  }

  if (!gate.ok && gate.blockingIssues.length > 0) {
    const gateNotice = `⚠️ **Poarta finalizare** — proiectul nu e ready-to-use:\n${gate.blockingIssues
      .slice(0, 5)
      .map((i) => `- ${i.message}`)
      .join('\n')}`;
    const text = hasFiles && supervisorFallback
      ? `${buildNeedsReviewBanner(gate, supervisorSummary)}\n\n${composeText.trim() || chatSummary}`
      : gateNotice + (gate.suggestedContinueMessage ? `\n\n${gate.suggestedContinueMessage}` : '');
    return {
      deliveryBlocked: !(hasFiles && supervisorFallback),
      needsReview: hasFiles && supervisorFallback,
      verifyPending,
      text,
    };
  }

  const reviewBanner = needsReview ? `${buildNeedsReviewBanner(gate, supervisorSummary)}\n\n` : '';
  const pendingNote = verifyPending ? '⏳ Verify rulează în background…\n\n' : '';
  const body = composeText.trim() ? composeText : chatSummary;

  return {
    deliveryBlocked: false,
    needsReview,
    verifyPending,
    text: `${pendingNote}${reviewBanner}${body}`.trim(),
  };
}

export { NEEDS_REVIEW_TAG };
