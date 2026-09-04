import { describe, expect, it } from 'vitest';
import { getCavalloSystemPrompt, resolveEffectiveMode, shouldPersistAutoModeSwitch } from '../../ai/modes/mode-router';

describe('mode-router', () => {
  it('maps legacy build mode to code prompt', () => {
    const prompt = getCavalloSystemPrompt('build', { workspaceRoot: '/tmp/proj' });
    expect(prompt).toContain('CODE MODE');
    expect(prompt).toContain('/tmp/proj');
    expect(prompt).not.toContain('Autonomous Build Engine');
  });

  it('maps legacy release mode to code prompt', () => {
    const prompt = getCavalloSystemPrompt('release', { workspaceRoot: '/tmp/caval' });
    expect(prompt).toContain('CODE MODE');
    expect(prompt).not.toContain('Release Engineer');
  });

  it('does not switch to release on legacy trigger', () => {
    const result = resolveEffectiveMode('code', 'RELEASE MODE — build installer');
    expect(result.mode).toBe('code');
    expect(result.switched).toBe(false);
  });

  it('includes Cavallo identity and end label for plan mode', () => {
    const prompt = getCavalloSystemPrompt('plan');
    expect(prompt).toContain('Cavallo AI');
    expect(prompt).toContain('PLAN MODE');
    expect(prompt).toContain('[END PLAN]');
  });

  it("includes end labels for code and debug, not ask", () => {
    expect(getCavalloSystemPrompt('code')).toContain('[END CODE]');
    expect(getCavalloSystemPrompt('debug')).toContain('[END DEBUG]');
    expect(getCavalloSystemPrompt('ask')).not.toContain('[END ASK]');
  });

  it('does not switch mode on Test Cavallo modes', () => {
    const result = resolveEffectiveMode('code', 'Test Cavallo modes');
    expect(result.mode).toBe('code');
    expect(result.switched).toBe(false);
  });

  it('does not switch Code to Ask on a create/scaffold website prompt', () => {
    const prompt =
      'Creează un website de prezentare pentru CAVAL Studio, în folderul curent. Vreau un site modern, dark, orientat către developeri, cu fundal negru, accent cyan/mov, logo CAVAL în header, secțiuni Hero, Funcționalități, Cum funcționează, Beneficii, Call to Action și Footer. Creează toate fișierele necesare pentru a putea porni și previzualiza proiectul local. Nu răspunde doar cu explicații: scrie efectiv fișierele proiectului în workspace.';
    const result = resolveEffectiveMode('code', prompt);
    expect(result.mode).toBe('code');
    expect(result.switched).toBe(false);
  });

  it('does not persist Code → Agentic', () => {
    expect(shouldPersistAutoModeSwitch('code', 'agentic')).toBe(false);
    expect(shouldPersistAutoModeSwitch('code', 'ask')).toBe(false);
  });

  it("keeps explicit Ask and Plan sticky on product prompts", () => {
    expect(resolveEffectiveMode("ask", "fă un magazin de baschet")).toEqual({
      mode: "ask",
      switched: false,
    });
    expect(resolveEffectiveMode("plan", "fă un magazin de baschet")).toEqual({
      mode: "plan",
      switched: false,
    });
    expect(shouldPersistAutoModeSwitch("ask", "code")).toBe(false);
    expect(shouldPersistAutoModeSwitch("plan", "code")).toBe(false);
  });
});
