# Code Review Revision Prompt

The user has reviewed AI-generated patches and provided feedback.

## Input

- Original patch set (multi-file unified diffs)
- User comments (per file, hunk, or line)
- Accept/reject decisions

## Task

Generate **revised patches only** that address the feedback.

## Rules

- Return strict JSON `ComposerPatchSet` format.
- Do not apply changes — output patches for review only.
- Preserve accepted hunks unchanged.
- Revise or remove rejected hunks based on comments.
- Keep scope minimal unless user explicitly requests broader changes.
