import { describe, expect, it } from 'vitest';
import { hasUiSpecInPrompt, isUiDesignTask } from '../../ai/composer/ui-spec-detector';

describe('ui-spec-detector', () => {
  it('hasUiSpecInPrompt detects theme and layout hints', () => {
    expect(hasUiSpecInPrompt('Build app with dark mode and Tailwind')).toBe(true);
    expect(hasUiSpecInPrompt('sidebar layout minimal UI')).toBe(true);
    expect(hasUiSpecInPrompt('Create REST API only')).toBe(false);
  });

  it('isUiDesignTask matches phase:ui and frontend modules', () => {
    expect(isUiDesignTask({ phase: 'ui', description: 'shell' })).toBe(true);
    expect(isUiDesignTask({ module: 'frontend', description: 'dashboard' })).toBe(true);
    expect(isUiDesignTask({ module: 'database', description: 'postgres schema' })).toBe(false);
  });
});
