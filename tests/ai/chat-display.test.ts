import { describe, expect, it } from 'vitest';
import { summarizeForChatPanel, formatChatPanelSummary, formatArenaReasoning, sanitizeLiveReasoning } from '../../ai/composer/chat-display';

describe('chat-display', () => {
  it('strips code fences and keeps max 4 lines', () => {
    const raw = `# Title

Intro line one.
Intro line two.
Intro line three.
Intro line four.
Intro line five.

\`\`\`python
def foo():
    pass
\`\`\``;

    const summary = summarizeForChatPanel(raw);
    expect(summary.lines).toHaveLength(4);
    expect(summary.codeBlockCount).toBe(1);
    expect(summary.truncated).toBe(true);
    expect(summary.lines.join(' ')).not.toContain('def foo');
  });

  it('shows editor hint when only code blocks', () => {
    const summary = summarizeForChatPanel('```ts\nconst x = 1;\n```');
    expect(formatChatPanelSummary(summary)).toContain('editor');
  });

  it('streaming placeholder when empty with code', () => {
    const summary = summarizeForChatPanel('```\ncode\n```');
    expect(formatChatPanelSummary(summary, true)).toContain('editor');
  });

  it('formatArenaReasoning caps recap at 6 lines', () => {
    const recap = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n');
    const out = formatArenaReasoning(undefined, recap, false);
    expect(out.split('\n')).toHaveLength(6);
  });

  it('formatArenaReasoning shows early brief while streaming', () => {
    const out = formatArenaReasoning(
      { goal: 'Build API', approach: 'Express layers' },
      undefined,
      true
    );
    expect(out).toContain('Goal: Build API');
    expect(out).toContain('Plan: Express layers');
  });

  it('sanitizeLiveReasoning removes noise', () => {
    const out = sanitizeLiveReasoning('think step one\nthink step two');
    expect(out).toContain('think step one');
  });
});
