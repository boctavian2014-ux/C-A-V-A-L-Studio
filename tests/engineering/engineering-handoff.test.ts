import { describe, it, expect } from 'vitest';
import {
  formatEngineeringContextForCoding,
  buildSoftwareHandoffPrompt,
} from '../../ai/engineering/engineering-handoff';
import type { EngProject } from '../../ai/engineering/engineering-generator';

const sampleProject: EngProject = {
  spec: {
    title: 'Senzor aer ESP32',
    summary: 'Nod IoT cu BME680 și ecran OLED.',
    dimensions: '80×60×25 mm',
    weight: '120 g',
    materials: ['PLA', 'PCB FR4'],
    tolerances: '±0.2 mm',
  },
  schema: {
    nodes: [
      { id: 'mcu1', label: 'ESP32-WROOM', role: 'mcu' },
      { id: 's1', label: 'BME680', role: 'sensor' },
    ],
    connections: [{ from: 'mcu1', to: 's1', label: 'I2C SDA/SCL' }],
    powerBudget: '250 mA @ 3.3 V',
    protocols: ['I2C', 'WiFi'],
  },
  parts: [
    {
      name: 'ESP32-WROOM-32',
      qty: 1,
      unitPrice: 45,
      currency: 'RON',
      shop: 'Optimus Digital',
      shopUrl: 'https://example.com',
    },
  ],
  build: [
    { name: 'enclosure.stl', kind: 'stl', note: 'Carcasă cu fante ventilație', content: 'box(80,60,25);' },
    { name: 'main.ino', kind: 'firmware', note: 'Sketch Arduino/ESP32', content: 'void setup() {}' },
  ],
};

describe('engineering-handoff', () => {
  it('includes spec, schema, parts and build in context', () => {
    const ctx = formatEngineeringContextForCoding(sampleProject, 'Vreau senzor aer');
    expect(ctx).toContain('Senzor aer ESP32');
    expect(ctx).toContain('ESP32-WROOM');
    expect(ctx).toContain('BME680');
    expect(ctx).toContain('Optimus Digital');
    expect(ctx).toContain('enclosure.stl');
    expect(ctx).toContain('Vreau senzor aer');
  });

  it('builds a software prompt from project title', () => {
    const prompt = buildSoftwareHandoffPrompt(sampleProject);
    expect(prompt).toContain('Senzor aer ESP32');
    expect(prompt).toContain('contextul Engineering');
  });
});
