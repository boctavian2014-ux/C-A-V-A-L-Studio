/** Shared CAD error hints (renderer + main safe). */
export const OPENSCAD_MISSING_HINT_RO =
  'OpenSCAD nu e instalat. Apasă „Instalează OpenSCAD” sau adaugă cheia Meshy în Setări (mesh.apiKey) pentru generare 3D direct din text.';

export function normalizeCadErrorMessage(error: string | null | undefined): string | null {
  if (!error?.trim()) return null;
  if (/OpenSCAD CLI not installed|OpenSCAD nu e instalat/i.test(error)) {
    return OPENSCAD_MISSING_HINT_RO;
  }
  if (/MESHY_API_KEY not configured/i.test(error)) {
    return 'Cheia Meshy lipsește. Adaugă mesh.apiKey în Setări pentru obiecte 3D libere (dulap, figurine).';
  }
  return error;
}
