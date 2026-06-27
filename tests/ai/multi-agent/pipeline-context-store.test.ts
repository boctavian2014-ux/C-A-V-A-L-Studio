import { describe, expect, it } from 'vitest';
import { PipelineContextStore } from '../../../ai/composer/multi-agent/pipeline-context-store';

describe('pipeline-context-store', () => {
  it('builds fallback context from user message', () => {
    const store = PipelineContextStore.createFallback('Build a React app', 'existing ts project');
    const ctx = store.getContext();
    expect(ctx.userIntent).toContain('React');
    expect(ctx.normalizedRequirements).toContain('existing ts project');
  });

  it('parses context agent output sections', () => {
    const raw = `
**User Intent Summary:** Create mobile wallet app
**Normalized Requirements:** React Native + backend
**Functional Requirements:**
- Send payments
- View balance
**Non-Functional Requirements:**
- Secure storage
**Platform Constraints:**
- iOS and Android
**Architecture Context:** Microservices
**Pending Issues:**
- None
`;
    const store = PipelineContextStore.fromAgentOutput(raw, 'wallet app');
    const ctx = store.getContext();
    expect(ctx.functionalRequirements).toContain('Send payments');
    expect(ctx.platformConstraints).toContain('iOS and Android');
  });

  it('buildPromptFor includes assigned task for sub-agent', () => {
    const store = PipelineContextStore.createFallback('API server');
    store.setTasks([
      {
        id: 'auth',
        module: 'auth',
        purpose: 'Auth module',
        description: 'Implement JWT',
        dependencies: [],
      },
    ]);
    const prompt = store.buildPromptFor('subagent-task', store.getTasks()[0]);
    expect(prompt).toContain('JWT');
    expect(prompt).toContain('auth');
  });
});
