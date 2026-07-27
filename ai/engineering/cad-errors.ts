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
  if (/MESHY_API_KEY not configured|mesh\.apiKey|Meshy/i.test(error) && /lipsește|missing|adaugă|add|required|neconfigurat|free-form|libere/i.test(error)) {
    return error;
  }
  if (/MESHY_API_KEY not configured/i.test(error)) {
    return 'Cheia Meshy lipsește. Adaugă mesh.apiKey în Setări → AI & Chei API pentru animale, insecte, figurine și orice obiect 3D liber.';
  }
  if (/Recursion detected|Current top level object is empty/i.test(error)) {
    return 'Modelul OpenSCAD generat era invalid (modul recursiv / geometrie goală). Reîncearcă Generează STL — serverul repară automat modulele care umbresc hull/difference.';
  }
  if (isLibraryModeUnsupportedError(error)) {
    return 'Serverul CAD cloud nu suportă încă mode-ul librărie. Reîncearcă — fallback OpenSCAD ar trebui să ruleze automat.';
  }
  if (/Internal server error|internal_error|Failed to create CAD job/i.test(error)) {
    return 'Serverul CAD cloud are o eroare la crearea job-ului (deseori Supabase). App-ul încearcă automat CAD local — verifică OpenSCAD + cheia OpenRouter, sau Setări → CAD Cloud 3D.';
  }
  return error;
}
