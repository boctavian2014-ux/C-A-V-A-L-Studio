import { describe, expect, it } from 'vitest';
import {
  parseDecompositionOutput,
  countModuleHints,
  isDecompositionCollapsed,
} from '../../ai/composer/multi-agent/decomposition-parser';

describe('decomposition-parser phase:ui', () => {
  it('parses [phase:ui] tag from task line', () => {
    const raw = `
**Project Goal:** Todo app
**Modules & Tasks:**
- Module frontend: UI
  - Task ui-1: [phase:ui] React shell with routing
  - Task api-1: Express REST API
`;
    const tasks = parseDecompositionOutput(raw, 8);
    const uiTask = tasks.find((t) => t.id === 'ui-1');
    expect(uiTask?.phase).toBe('ui');
    expect(uiTask?.description).not.toMatch(/\[phase:ui\]/i);
    const apiTask = tasks.find((t) => t.id === 'api-1');
    expect(apiTask?.phase).toBeUndefined();
  });
});

describe('decomposition-parser Constanța-style', () => {
  const constantaRaw = `
**Project Goal:** Build a transparency dashboard for Primăria Constanța (CUI 4785263)

**Modules & Tasks:**
- Module 1: Data Sources & Ingestion
  - Task 1.1: Implement Forexebug scraper for CUI 4785263
  - Task 1.2: Implement SEAP scraper filtered by authority CUI
  - Task 1.3: Implement PDF parser for primaria-constanta.ro
- Module 2: Data Processing & Risk Detection
  - Task 2.1: Design database schema
  - Task 2.2: Implement risk detection algorithm (fragmentation)
- Module 3: Backend API
  - Task 3.1: FastAPI routes /dashboard, /risk-alerts
- Module 4: Frontend Dashboard
  - Task 4.1: [phase:ui] React dashboard with budget charts
`;

  it('parses numbered tasks 1.1, 2.1 across modules', () => {
    const tasks = parseDecompositionOutput(constantaRaw, 12);
    expect(tasks.length).toBeGreaterThanOrEqual(6);
    expect(tasks.find((t) => t.id === '1-1' || t.id === '1.1')).toBeTruthy();
    expect(tasks.some((t) => t.module.includes('data-sources') || t.module === '1')).toBeTruthy();
    expect(tasks.find((t) => t.phase === 'ui')).toBeTruthy();
  });

  it('detects collapse when only fallback task-1 remains', () => {
    const collapsed = parseDecompositionOutput('**Project Goal:** Build dashboard\n- **Discovery Layer:** foo', 8);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.id).toBe('task-1');
    expect(isDecompositionCollapsed(constantaRaw, collapsed)).toBe(true);
    expect(countModuleHints(constantaRaw)).toBeGreaterThanOrEqual(3);
  });
});

describe('decomposition-parser delivery completeness', () => {
  it('does not collapse when Task lines are present', () => {
    const raw = `
- Module api: Backend
  - Task a1: Create main.py
  - Task a2: Add routes
`;
    const tasks = parseDecompositionOutput(raw, 8);
    expect(tasks.length).toBe(2);
    expect(isDecompositionCollapsed(raw, tasks)).toBe(false);
  });
});
