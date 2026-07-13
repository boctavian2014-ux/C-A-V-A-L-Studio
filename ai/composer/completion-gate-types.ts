import type { FashionProjectArchetype } from '../scaffolds/fashion-matching/archetype';

export interface CompletionGateIssue {
  code:
    | 'junk_workspace'
    | 'forbidden_path'
    | 'verify_failed'
    | 'verify_skipped'
    | 'verify_required'
    | 'archetype_missing'
    | 'delivery_incomplete'
    | 'consistency_failed'
    | 'supervisor_rejected'
    | 'arena_issue';
  message: string;
  /** Soft issues allow delivery with [NEEDS_REVIEW] when supervisorFallback is on */
  blocking?: boolean;
}

export interface CompletionGateResult {
  ok: boolean;
  issues: CompletionGateIssue[];
  blockingIssues: CompletionGateIssue[];
  softIssues: CompletionGateIssue[];
  needsReview?: boolean;
  verifyPending?: boolean;
  archetype?: FashionProjectArchetype;
  suggestedContinueMessage: string;
}
