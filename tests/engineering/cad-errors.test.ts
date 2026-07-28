import { describe, expect, it } from 'vitest';
import {
  MESH_REQUIRED_HINT_RO,
  normalizeCadErrorMessage,
} from '../../ai/engineering/cad-errors';

describe('normalizeCadErrorMessage', () => {
  it('rewrites legacy Meshy-only free-form hint to TRELLIS + Meshy', () => {
    const legacy =
      'Pentru obiecte libere (animale, insecte, figurine, robot jucărie, mobilier organic) adaugă cheia Meshy în Setări → AI & Chei API (mesh.apiKey / MESHY_API_KEY). OpenSCAD e doar pentru piese mecanice precise.';
    expect(normalizeCadErrorMessage(legacy)).toBe(MESH_REQUIRED_HINT_RO);
    expect(normalizeCadErrorMessage(legacy)).toMatch(/PiAPI Trellis|TRELLIS|Meshy/i);
    expect(normalizeCadErrorMessage(legacy)).toMatch(/Meshy/);
  });
});
