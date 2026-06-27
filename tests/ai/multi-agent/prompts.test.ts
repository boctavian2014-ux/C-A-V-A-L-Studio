import { describe, expect, it } from 'vitest';
import {
  DECOMPOSITION_AGENT_PROMPT,
  FINAL_COMPOSER_PROMPT,
  MERGE_AGENT_PROMPT,
  ORCHESTRATOR_AGENT_PROMPT,
  PIPELINE_CONTEXT_AGENT_PROMPT,
  RUNTIME_PIPELINE_PROMPT,
  SUB_AGENT_PROMPT,
  SUPERVISOR_AGENT_PROMPT,
  FULL_INTEGRATION_AGENT_PROMPT,
  MEMORY_ENGINE_AGENT_PROMPT,
} from '../../../ai/prompts/multi-agent';

describe('multi-agent prompts', () => {
  it('exports full integration and memory prompts', () => {
    expect(FULL_INTEGRATION_AGENT_PROMPT).toContain('Full Integration Agent');
    expect(MEMORY_ENGINE_AGENT_PROMPT).toContain('Memory Engine');
  });

  it('exports all eight core agent prompts', () => {
    expect(ORCHESTRATOR_AGENT_PROMPT).toContain('Orchestrator');
    expect(PIPELINE_CONTEXT_AGENT_PROMPT).toContain('Context Engine');
    expect(RUNTIME_PIPELINE_PROMPT).toContain('Runtime Pipeline');
    expect(DECOMPOSITION_AGENT_PROMPT).toContain('Decomposition Agent');
    expect(SUB_AGENT_PROMPT).toContain('Sub-Agent');
    expect(MERGE_AGENT_PROMPT).toContain('Merge Agent');
    expect(SUPERVISOR_AGENT_PROMPT).toContain('Supervisor Agent');
    expect(FINAL_COMPOSER_PROMPT).toContain('Final Code Composer');
  });

  it('final composer enforces fence output', () => {
    expect(FINAL_COMPOSER_PROMPT).toContain('relative/path');
    expect(FINAL_COMPOSER_PROMPT).toMatch(/max \d+ lines/);
  });

  it('decomposition forbids code', () => {
    expect(DECOMPOSITION_AGENT_PROMPT).toContain('Do NOT generate code');
  });
});
