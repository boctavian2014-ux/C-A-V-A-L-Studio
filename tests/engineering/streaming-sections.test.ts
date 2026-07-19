import { describe, expect, it } from 'vitest';
import {
  collectSections,
  createSectionCollector,
} from '../../ai/engineering/streaming-sections';

describe('streaming-sections collector', () => {
  it('marks the trailing section as generating until the next heading', () => {
    const c = createSectionCollector();
    c.push('## PROJECT SUMMARY\nA small robot.\n');
    let snap = c.push('## CAD 3D MODEL\n```openscad\ncube();');
    const summary = snap.sections.find((s) => s.key === 'summary');
    const cad = snap.sections.find((s) => s.key === 'cad');
    expect(summary?.status).toBe('complete');
    expect(cad?.status).toBe('generating');
    expect(snap.activeKey).toBe('cad');
    snap = c.finish();
    expect(snap.sections.find((s) => s.key === 'cad')?.status).toBe('complete');
    expect(snap.activeKey).toBeNull();
  });

  it('handles a heading split across two chunks without flashing a partial heading', () => {
    const c = createSectionCollector();
    let snap = c.push('## PROJECT SUMMARY\nHello world\n## CA');
    // Partial "## CA" must NOT appear as body of summary nor as a section yet.
    expect(snap.sections.some((s) => s.key === 'cad')).toBe(false);
    expect(snap.sections.find((s) => s.key === 'summary')?.content).toBe('Hello world');
    snap = c.push('D 3D Model\nworld');
    const cad = snap.sections.find((s) => s.key === 'cad');
    expect(cad).toBeTruthy();
    expect(cad?.content).toBe('world');
    expect(cad?.status).toBe('generating');
  });

  it('parses multiple sections contained in a single chunk', () => {
    const c = createSectionCollector();
    const snap = c.push(
      '## PROJECT SUMMARY\nAbc\n## COMPONENT LIST\n| Name |\n## ASSEMBLY STEPS\nStep 1\n'
    );
    expect(snap.sections.map((s) => s.key)).toEqual(['summary', 'partsList', 'assembly']);
    expect(snap.completed).toBe(2); // summary + partsList closed; assembly still generating
    expect(snap.total).toBe(3);
  });

  it('final flush closes the last section and emits its content', () => {
    const c = createSectionCollector();
    c.push('## ASSEMBLY STEPS\nStep 1\nStep 2');
    const snap = c.finish();
    const assembly = snap.sections.find((s) => s.key === 'assembly');
    expect(assembly?.content).toBe('Step 1\nStep 2');
    expect(assembly?.status).toBe('complete');
    expect(snap.completed).toBe(snap.total);
  });

  it('keeps an incomplete section as generating (no premature complete)', () => {
    const c = createSectionCollector();
    const snap = c.push('## COMPONENT LIST\n| Name | Qty |\n| esp32 | 1');
    const parts = snap.sections.find((s) => s.key === 'partsList');
    expect(parts?.status).toBe('generating');
    // pending "| esp32 | 1" (no newline) is shown as live body, not withheld.
    expect(parts?.content).toContain('| esp32 | 1');
  });

  it('handles CRLF line endings, including a \\r\\n split across chunks', () => {
    const c = createSectionCollector();
    c.push('## PROJECT SUMMARY\r\nLine A\r');
    let snap = c.push('\n## ASSEMBLY STEPS\r\nStep 1\r\n');
    const summary = snap.sections.find((s) => s.key === 'summary');
    expect(summary?.content).toBe('Line A');
    expect(summary?.status).toBe('complete');
    snap = c.finish();
    expect(snap.sections.find((s) => s.key === 'assembly')?.content).toBe('Step 1');
  });

  it('recognizes Romanian alias headings', () => {
    const sections = collectSections(
      '## Rezumat\nOk\n## Lista de componente\n| x |\n## Model 3D\ncube();\n## Asamblare\nPas 1\n'
    );
    expect(sections.map((s) => s.key)).toEqual(['summary', 'partsList', 'cad', 'assembly']);
  });

  it('routes unknown headings to the "other" bucket', () => {
    const sections = collectSections('## Random Notes\nblah\n');
    expect(sections[0].key).toBe('other');
    expect(sections[0].heading).toBe('Random Notes');
  });

  it('collects leading preamble before the first heading as "other"', () => {
    const sections = collectSections('Intro text line\n## PROJECT SUMMARY\nBody\n');
    expect(sections[0].key).toBe('other');
    expect(sections[0].content).toBe('Intro text line');
    expect(sections[1].key).toBe('summary');
  });

  it('reset() clears all state so the collector can be reused after abort', () => {
    const c = createSectionCollector();
    c.push('## PROJECT SUMMARY\nSomething\n');
    c.reset();
    const empty = c.snapshot();
    expect(empty.sections).toEqual([]);
    expect(empty.activeKey).toBeNull();
    expect(empty.total).toBe(0);
    const snap = c.push('## ASSEMBLY STEPS\nFresh\n');
    expect(snap.sections.map((s) => s.key)).toEqual(['assembly']);
  });

  it('is equivalent to a single-shot collect for the same full text', () => {
    const full =
      '## PROJECT SUMMARY\nA\n## CAD 3D MODEL\ncube();\n## ASSEMBLY STEPS\nStep\n';
    const oneShot = collectSections(full);
    const c = createSectionCollector();
    for (const ch of full.match(/.{1,7}/gs) ?? []) c.push(ch);
    const streamed = c.finish().sections;
    expect(streamed.map((s) => ({ key: s.key, content: s.content }))).toEqual(
      oneShot.map((s) => ({ key: s.key, content: s.content }))
    );
  });
});
