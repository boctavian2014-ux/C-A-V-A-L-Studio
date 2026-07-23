/** Shared CAD error hints (renderer + main safe). */
export const OPENSCAD_MISSING_HINT_RO =
  'OpenSCAD nu e instalat. Apasă „Instalează OpenSCAD” sau adaugă cheia Meshy în Setări (mesh.apiKey) pentru generare 3D direct din text.';

export function isLibraryModeUnsupportedError(error: string | null | undefined): boolean {
  if (!error?.trim()) return false;
  return /expected one of.*"openscad".*"mesh"|Invalid option.*openscad.*mesh|generationMode.*library/i.test(
    error
  );
}

export function normalizeCadErrorMessage(error: string | null | undefined): string | null {
  if (!error?.trim()) return null;
  if (/OpenSCAD CLI not installed|OpenSCAD nu e instalat/i.test(error)) {
    return OPENSCAD_MISSING_HINT_RO;
  }
  if (/MESHY_API_KEY not configured/i.test(error)) {
    return 'Cheia Meshy lipsește. Adaugă mesh.apiKey în Setări pentru obiecte 3D libere (dulap, figurine).';
  }
  if (isLibraryModeUnsupportedError(error)) {
    return 'Serverul CAD cloud nu suportă încă mode-ul librărie. Reîncearcă — fallback OpenSCAD ar trebui să ruleze automat.';
  }
  if (/Internal server error|internal_error/i.test(error)) {
    return 'Eroare pe serverul CAD cloud. Reîncearcă peste câteva secunde sau verifică Setări → CAD Cloud 3D / cheile OpenRouter.';
  }
  return error;
}
