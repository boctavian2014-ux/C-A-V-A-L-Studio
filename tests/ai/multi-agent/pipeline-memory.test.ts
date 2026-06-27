import { describe, expect, it } from 'vitest';
import { PipelineMemoryEngine } from '../../../ai/composer/multi-agent/pipeline-memory';

describe('pipeline-memory', () => {
  it('enriches context with previous run hints', () => {
    const engine = PipelineMemoryEngine.load('/tmp/test-proj');
    engine.recordRun({
      runId: 'run-1',
      userMessage: 'Build todo app',
      tasks: [{ id: 't1', module: 'api', purpose: 'p', description: 'REST', dependencies: [] }],
      supervisor: { approved: true, raw: '', issues: [], summary: 'ok' },
    });
    const enriched = engine.enrichContext({
      userIntent: 'Extend todo app',
      normalizedRequirements: 'add auth',
      functionalRequirements: [],
      nonFunctionalRequirements: [],
      platformConstraints: [],
      storeCompliance: [],
      architectureContext: '',
      moduleContext: '',
      interfaceContext: '',
      dependencyMap: '',
      pendingIssues: [],
    });
    expect(enriched.architectureContext).toContain('Previous intent');
    expect(enriched.architectureContext).toContain('api');
  });
});
