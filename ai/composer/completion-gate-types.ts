import type { FashionProjectArchetype } from '../scaffolds/fashion-matching/archetype';

export interface CompletionGateIssue {
  code:
    | 'junk_workspace'
    | 'forbidden_path'
    | 'verify_failed'
    | 'verify_skipped'
    | 'archetype_missing'
    | 'delivery_incomplete'
    | 'consistency_failed';
  message: string;
}

export interface CompletionGateResult {
  ok: boolean;
  issues: CompletionGateIssue[];
  archetype?: FashionProjectArchetype;
  suggestedContinueMessage: string;
}
