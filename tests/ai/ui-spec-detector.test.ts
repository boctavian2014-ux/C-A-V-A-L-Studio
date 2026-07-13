import { describe, expect, it } from 'vitest';

import { partitionTasksByUiPhase } from '../../ai/composer/ui-spec-detector';

describe('ui-spec-detector auto UI path', () => {
  it('partitions UI tasks without requiring user pause', () => {
    const tasks = [
      { id: '1', module: 'api', description: 'REST handlers', phase: 'core' as const },
      { id: '2', module: 'ui', description: 'Dashboard shell', phase: 'ui' as const },
    ];
    const { preUi, ui } = partitionTasksByUiPhase(tasks);
    expect(preUi).toHaveLength(1);
    expect(ui).toHaveLength(1);
    expect(ui[0]?.phase).toBe('ui');
  });
});
