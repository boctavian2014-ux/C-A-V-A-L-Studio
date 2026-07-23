import { describe, expect, it } from 'vitest';
import {
  extractJsonObject,
  parseRoboticsComponentBom,
} from '../../ai/engineering/robotics-components-schema';
import { classifyAgainstCatalog, ROBOTICS_STANDARD_CATALOG } from '../../ai/engineering/robotics-standard-catalog';

describe('robotics component schema', () => {
  it('parses bom json', () => {
    const bom = parseRoboticsComponentBom({
      components: [
        {
          id: 'chassis',
          name: 'Chassis 250mm',
          category: 'structure',
          mode: 'custom',
          qty: 1,
          dimensions: { width: 250, height: 150, depth: 40, unit: 'mm' },
        },
        {
          name: 'MG996R bracket',
          category: 'mechanical',
          mode: 'standard',
          standardKey: 'mg996r_servo_bracket',
          qty: 4,
        },
      ],
      assemblyHints: 'Mount servos first',
    });
    expect(bom).not.toBeNull();
    expect(bom!.components).toHaveLength(2);
    expect(bom!.components[0].id).toBe('chassis');
    expect(bom!.assemblyHints).toContain('servos');
  });

  it('extracts fenced json', () => {
    const raw = '```json\n{"components":[{"id":"a","name":"Wheel","category":"mechanical","mode":"custom","qty":2}]}\n```';
    const bom = parseRoboticsComponentBom(extractJsonObject(raw));
    expect(bom?.components[0].name).toBe('Wheel');
  });
});

describe('robotics standard catalog classifier', () => {
  it('keeps known standardKey', () => {
    const c = classifyAgainstCatalog(
      { name: 'x', mode: 'custom' as const, standardKey: 'wheel_65mm' },
      ROBOTICS_STANDARD_CATALOG
    );
    expect(c.mode).toBe('standard');
    expect(c.standardKey).toBe('wheel_65mm');
  });

  it('fuzzy matches names to catalog', () => {
    const c = classifyAgainstCatalog(
      { name: 'MG996R servo bracket', mode: 'custom' as const },
      ROBOTICS_STANDARD_CATALOG
    );
    expect(c.mode).toBe('standard');
    expect(c.standardKey).toBe('mg996r_servo_bracket');
  });

  it('leaves unique chassis as custom', () => {
    const c = classifyAgainstCatalog(
      { name: 'hexapod central frame 300mm', mode: 'standard' as const },
      ROBOTICS_STANDARD_CATALOG
    );
    expect(c.mode).toBe('custom');
  });
});
