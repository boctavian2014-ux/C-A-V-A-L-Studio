import { describe, expect, it } from 'vitest';
import {
  extractPartsListRows,
  extractScadBlock,
  missingRoboticsSections,
  parseRoboticsPlan,
  partsListToCsv,
  pickBestRoboticsMarkdown,
  roboticsPlanToEngProject,
  roboticsPlanToMarkdown,
  ROBOTICS_SECTION_ORDER,
  roboticsSystemPrompt,
} from '../../ai/engineering/robotics-format';

describe('robotics-format', () => {
  it('exposes RoboticsAI ULTRA system prompt', () => {
    const prompt = roboticsSystemPrompt();
    expect(prompt).toContain('RoboticsAI ULTRA');
    expect(prompt).toContain('## COMPONENT LIST');
    expect(prompt).not.toMatch(/^##\s*BOM\b/m);
  });

  it('parses 17-section markdown plan', () => {
    const md = [
      '## PROJECT SUMMARY',
      'Robot pe roți cu ESP32.',
      '## MECHANICAL DESIGN',
      'Șasiu 120×80 mm.',
      '## CAD 3D MODEL',
      '```openscad',
      'cube([10,10,10]);',
      '```',
      '## COMPONENT LIST',
      '| Name | Part/Code | Qty | Role | Notes |',
      '| --- | --- | --- | --- | --- |',
      '| ESP32 | DevKit | 1 | MCU | 45 RON |',
      '## ASSEMBLY STEPS',
      '1. Montează șasiul.',
    ].join('\n');

    const plan = parseRoboticsPlan(md);
    expect(plan.sections.summary).toContain('ESP32');
    expect(plan.sections.mechanical).toContain('Șasiu');
    expect(plan.sections.cad).toContain('openscad');
    expect(plan.sections.partsList).toContain('ESP32');
    expect(plan.sections.assembly).toContain('Montează');
    expect(plan.partsListRows).toHaveLength(1);
    expect(plan.partsListRows[0]?.name).toBe('ESP32');
    expect(missingRoboticsSections(plan)).toEqual([]);
  });

  it('still parses legacy ## BOM headings into partsList', () => {
    const md = [
      '## BOM',
      '| Name | Part/Code | Qty | Role | Notes |',
      '| --- | --- | --- | --- | --- |',
      '| Motor | N20 | 2 | Drive | 12V |',
    ].join('\n');

    const plan = parseRoboticsPlan(md);
    expect(plan.sections.partsList).toContain('N20');
    expect(plan.partsListRows[0]?.name).toBe('Motor');
  });

  it('extracts OpenSCAD block', () => {
    const scad = extractScadBlock('## CAD\n```openscad\ncylinder(h=10,r=5);\n```');
    expect(scad).toContain('cylinder');
  });

  it('exports component list to CSV', () => {
    const rows = extractPartsListRows(
      '| Name | Part/Code | Qty | Role | Notes |\n| MCU | ESP32 | 1 | Control | |'
    );
    const csv = partsListToCsv(rows);
    expect(csv).toContain('Name,Part/Code,Qty,Role,Notes');
    expect(csv).toContain('"MCU"');
  });

  it('converts plan to EngProject with parts and build files', () => {
    const plan = parseRoboticsPlan([
      '## PROJECT SUMMARY',
      'Braț robotic simplu',
      '## CAD 3D MODEL',
      '```openscad\nmodule arm() { cube(10); }\n```',
      '## COMPONENT LIST',
      '| Name | Part/Code | Qty | Role | Notes |',
      '| --- | --- | --- | --- | --- |',
      '| Servo | SG90 | 2 | Actuator | 25 RON |',
      '## ELECTRONICS & WIRING',
      'ESP32 GPIO -> servo signal',
    ].join('\n'));

    const project = roboticsPlanToEngProject(plan);
    expect(project.spec.title).toBeTruthy();
    expect(project.parts).toHaveLength(1);
    expect(project.parts[0]?.name).toBe('Servo');
    expect(project.build.some((f) => f.name === 'model.scad')).toBe(true);
    expect(project.schema.nodes.length).toBeGreaterThan(0);
  });

  it('parses numbered section headings like "1. ## PROJECT SUMMARY"', () => {
    const md = [
      '1. ## PROJECT SUMMARY',
      'Robot ESP32.',
      '6. ## COMPONENT LIST',
      '| Name | Part/Code | Qty | Role | Notes |',
      '| --- | --- | --- | --- | --- |',
      '| ESP32 | DevKit | 1 | MCU | |',
      '10. ## ASSEMBLY STEPS',
      'Montează roțile.',
      '```openscad',
      'cube(10);',
      '```',
    ].join('\n');

    const plan = parseRoboticsPlan(md);
    expect(plan.sections.summary).toContain('ESP32');
    expect(plan.sections.partsList).toContain('DevKit');
    expect(plan.sections.assembly).toContain('Montează');
    expect(plan.sections.cad).toContain('openscad');
    expect(missingRoboticsSections(plan)).toEqual([]);
  });

  it('pickBestRoboticsMarkdown prefers markdown over JSON reasoning', () => {
    const content = '## PROJECT SUMMARY\nRobot test\n## CAD 3D MODEL\n```openscad\ncube(1);\n```';
    const reasoning = '{"spec":{"title":"ignored"}}';
    expect(pickBestRoboticsMarkdown(content, reasoning)).toContain('## PROJECT SUMMARY');
  });
});
