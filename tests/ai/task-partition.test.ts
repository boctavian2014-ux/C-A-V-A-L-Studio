import { describe, expect, it } from 'vitest';
import { partitionTasksByRole, buildFixTasksFromIssues } from '../../ai/composer/multi-agent/task-partition';

describe('task-partition', () => {
  it('partitions tasks by role', () => {
    const p = partitionTasksByRole([
      { id: '1', module: 'a', purpose: 'p', description: 'd', dependencies: [], role: 'tester' },
      { id: '2', module: 'a', purpose: 'p', description: 'd', dependencies: [], role: 'implementer' },
      { id: '3', module: 'a', purpose: 'p', description: 'd', dependencies: [], role: 'refactorer' },
    ]);
    expect(p.tester.length).toBe(1);
    expect(p.implementer.length).toBe(1);
    expect(p.refactorer.length).toBe(1);
  });

  it('buildFixTasksFromIssues creates implementer-fix tasks', () => {
    const tasks = buildFixTasksFromIssues(
      [{ severity: 'critical', source: 'sec', message: 'eval found' }],
      'fix'
    );
    expect(tasks[0]?.role).toBe('implementer-fix');
    expect(tasks[0]?.description).toContain('eval found');
  });
});
