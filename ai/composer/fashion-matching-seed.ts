import {
  FASHION_MATCHING_ROOT,
  getFashionMatchingScaffoldFiles,
} from '../scaffolds/fashion-matching/manifest';
import { isFashionMatchingEngineRequest } from '../scaffolds/fashion-matching/detect';

function joinWorkspace(root: string, relative: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  const clean = relative.replace(/^[/\\]+/, '').replace(/\//g, sep);
  return `${root}${sep}${clean}`;
}

function parentDir(filePath: string): string {
  const sep = filePath.includes('\\') ? '\\' : '/';
  const idx = filePath.lastIndexOf(sep);
  return idx > 0 ? filePath.slice(0, idx) : filePath;
}

export { isFashionMatchingEngineRequest, FASHION_MATCHING_ROOT };

/** Write the Fashion Product Matching Engine scaffold into the workspace. */
export async function seedFashionMatchingEngine(projectPath: string): Promise<string[]> {
  const caval = window.caval;
  if (!caval?.fs?.writeFile) return [];

  const written: string[] = [];
  const mkdirDone = new Set<string>();

  for (const file of getFashionMatchingScaffoldFiles()) {
    const abs = joinWorkspace(projectPath, file.path);
    const dir = parentDir(abs);
    if (!mkdirDone.has(dir) && caval.fs.createDir) {
      await caval.fs.createDir(dir);
      mkdirDone.add(dir);
    }
    const res = await caval.fs.writeFile(abs, file.content);
    if (res.ok) written.push(file.path);
  }

  return written;
}

export function fashionMatchingSeedPrompt(): string {
  return [
    'SCAFFOLD: Proiectul fashion-matching-engine/ a fost creat în workspace.',
    'Extinde implementarea: CLIP ViT-L/14, Sentence-BERT, FAISS IVF-PQ, deduplicare, teste.',
    'Folosește write_file pentru fișiere noi. Nu refuza — scrie cod Python funcțional.',
  ].join(' ');
}

/** Local response when LLM refuses — full architecture without calling the model. */
export function buildFashionMatchingAssistantReply(fileCount: number): string {
  return [
    `## Product Matching Engine (Fashion) — creat în workspace`,
    '',
    `Am generat **${fileCount} fișiere** în \`fashion-matching-engine/\`. Deschide **pipeline.py** în editorul central.`,
    '',
    '### Arhitectură',
    '| Layer | Fișier | Rol |',
    '|-------|--------|-----|',
    '| Input | `types.py` | barcode, OCR, image URLs, NFC/DPP |',
    '| Normalization | `normalization.py` | brand, SKU/EAN, culori, sezoane SS24/FW23 |',
    '| Embeddings | `embeddings.py` | CLIP + Sentence-BERT + fusion |',
    '| Matching | `matching.py` | FAISS HNSW, top-K=50, filtre brand/categorie/gen |',
    '| Variants | `variant_resolver.py` | culoare, sezon, same model vs style |',
    '| Similarity | `similarity.py` | Visual + text hybrid score |',
    '| Scoring | `scoring.py` | `0.45*visual + 0.35*text + 0.20*metadata` |',
    '| Output | `output_formatter.py` + `types.py` | JSON product/scores/variants/similar |',
    '| API | `api/main.py` | FastAPI `POST /v1/match` |',
    '',
    '### Scoruri',
    '- **ExactMatchScore** — SKU/EAN + metadata',
    '- **VariantScore** — același model, altă culoare/sezon',
    '- **VisualSimilarityScore** — cosine pe embedding imagine',
    '- **ConfidenceScore** — fusion ponderat (vezi `scoring.py`)',
    '',
    '### Rulează',
    '```bash',
    'cd fashion-matching-engine',
    'pip install -r requirements.txt',
    'uvicorn api.main:app --reload',
    '```',
    '',
    'Spune în chat ce vrei extins: **CLIP real**, **index FAISS cu produse**, **deduplicare**, **OCR Tesseract**.',
  ].join('\n');
}
