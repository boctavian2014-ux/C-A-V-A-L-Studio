/** Shared CAD error hints (renderer + main safe). */
export const OPENSCAD_MISSING_HINT_RO =
  'OpenSCAD nu e instalat. Apasă „Instalează OpenSCAD” sau folosește text-to-3D pe cloud (TRELLIS pe serverul CAD) ori cheia Meshy (Setări → mesh.apiKey).';

export const MESH_REQUIRED_HINT_RO =
  'Pentru obiecte libere (animale, insecte, figurine, robot jucărie, mobilier organic) e nevoie de cheia PiAPI Trellis (sau Meshy) în Setări → AI & Chei API. OpenSCAD e doar pentru piese mecanice precise.';

export const MESH_REQUIRED_HINT_EN =
  'For free-form objects (animals, insects, figurines, toy robots, organic furniture) add a PiAPI Trellis key (or Meshy) in Settings → AI & API Keys. OpenSCAD is only for precise mechanical parts.';

const LEGACY_MESHY_ONLY_HINT_RE =
  /adaugă cheia Meshy în Setări.*mesh\.apiKey\s*\/\s*MESHY_API_KEY|add a Meshy API key in Settings \(mesh\.apiKey\s*\/\s*MESHY_API_KEY\)/i;

export function isLibraryModeUnsupportedError(error: string | null | undefined): boolean {
  if (!error?.trim()) return false;
  return /expected one of.*"openscad".*"mesh"|Invalid option.*openscad.*mesh|generationMode.*library/i.test(
    error
  );
}

export function normalizeCadErrorMessage(error: string | null | undefined): string | null {
  if (!error?.trim()) return null;
  if (LEGACY_MESHY_ONLY_HINT_RE.test(error) || /Pentru obiecte libere.*adaugă cheia Meshy/i.test(error)) {
    return MESH_REQUIRED_HINT_RO;
  }
  if (/For free-form objects.*add a Meshy API key/i.test(error) && !/TRELLIS/i.test(error)) {
    return MESH_REQUIRED_HINT_EN;
  }
  if (/OpenSCAD CLI not installed|OpenSCAD nu e instalat/i.test(error)) {
    return OPENSCAD_MISSING_HINT_RO;
  }
  if (
    /No text-to-3D provider|MESH_WORKER_URL|TRELLIS/i.test(error) ||
    (/MESHY_API_KEY not configured|mesh\.apiKey|Meshy/i.test(error) &&
      /lipsește|missing|adaugă|add|required|neconfigurat|free-form|libere|configure/i.test(error))
  ) {
    if (/MESHY_API_KEY not configured|No text-to-3D provider/i.test(error) && !/TRELLIS/i.test(error)) {
      return MESH_REQUIRED_HINT_RO;
    }
    return error;
  }
  if (/MESHY_API_KEY not configured/i.test(error)) {
    return MESH_REQUIRED_HINT_RO;
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
