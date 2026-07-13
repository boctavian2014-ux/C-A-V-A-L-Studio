import { describe, expect, it } from 'vitest';

import { consolidateFashionWebWorkspace } from '../../ai/scaffolds/workspace-cleanup';

const HAINE_ROOT = 'C:/Users/octav/Desktop/haine';

describe('haine integration', () => {
  it('consolidates fashion-web duplicates on disk', () => {
    const result = consolidateFashionWebWorkspace(HAINE_ROOT);
    expect(result.deleted.length + result.fixed.length).toBeGreaterThan(0);
  });
});
