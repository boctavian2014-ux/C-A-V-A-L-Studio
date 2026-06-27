import { describe, expect, it } from 'vitest';
import { FullIntegrationAgent } from '../../../ai/composer/multi-agent/integration-agent';

describe('full-integration-agent', () => {
  it('plans agent order with memory and integrate stages', () => {
    const agent = new FullIntegrationAgent();
    const plan = agent.planIntegration('run-x', 3);
    expect(plan.agentOrder).toContain('memory');
    expect(plan.agentOrder).toContain('integrate');
    expect(plan.contextSyncMap.compose_to_devtools).toBeTruthy();
  });

  it('formats integration summary markdown', () => {
    const agent = new FullIntegrationAgent();
    const plan = agent.planIntegration('run-x', 2);
    const summary = agent.buildIntegrationSummary(
      {
        runId: 'run-x',
        userMessage: 'test',
        workspaceRoot: '/tmp',
        model: 'caval-auto/balanced',
        context: {
          userIntent: '',
          normalizedRequirements: '',
          functionalRequirements: [],
          nonFunctionalRequirements: [],
          platformConstraints: [],
          storeCompliance: [],
          architectureContext: '',
          moduleContext: '',
          interfaceContext: '',
          dependencyMap: '',
          pendingIssues: [],
        },
        tasks: [],
        subAgentResults: [],
        stages: [],
        composerText: '```ts:a.ts\nx```',
        aborted: false,
        supervisor: { approved: true, raw: '', issues: [], summary: 'ok' },
      },
      plan,
      { git: { isRepo: true, branch: 'main', changedFiles: 2 }, mcp: { serversReady: 2 } }
    );
    const md = agent.formatSummaryMarkdown(summary);
    expect(md).toContain('Integration Overview');
    expect(md).toContain('Terminal/MCP/GitHub');
  });
});
