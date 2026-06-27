export interface ScaffoldFile {
  path: string;
  content: string;
}

export const FASHION_MATCHING_ROOT = 'fashion-matching-engine';

export function getFashionMatchingScaffoldFiles(): ScaffoldFile[] {
  return [
    {
      path: `${FASHION_MATCHING_ROOT}/README.md`,
      content: `# Fashion Product Matching Engine

Enterprise-grade multimodal matching: barcode, OCR, image, NFC/DPP URL.

## Stack
- Python 3.11+
- FastAPI API
- CLIP (visual) + Sentence-BERT (text) — wire in \`embeddings.py\`
- FAISS HNSW index — \`matching.py\`

## Run
\`\`\`bash
pip install -r requirements.txt
uvicorn api.main:app --reload
\`\`\`

## Pipeline
\`src/fashion_matching/pipeline.py\` — end-to-end orchestration.
`,
    },
    {
      path: `${FASHION_MATCHING_ROOT}/requirements.txt`,
      content: `fastapi>=0.115.0
uvicorn[standard]>=0.32.0
pydantic>=2.9.0
numpy>=1.26.0
faiss-cpu>=1.8.0
sentence-transformers>=3.0.0
torch>=2.2.0
transformers>=4.44.0
pillow>=10.4.0
python-multipart>=0.0.9
`,
    },
    {
      path: `${FASHION_MATCHING_ROOT}/src/fashion_matching/__init__.py`,
      content: `"""Fashion Product Matching Engine — multimodal identify, normalize, match, dedupe."""

from .pipeline import FashionMatchingPipeline

__all__ = ["FashionMatchingPipeline"]
`,
    },
    {
      path: `${FASHION_MATCHING_ROOT}/src/fashion_matching/types.py`,
      content: `from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class MultimodalInput(BaseModel):
    barcode: str | None = None
    ocr_text: str | None = None
    image_urls: list[str] = Field(default_factory=list)
    nfc_url: str | None = None
    dpp_url: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProductRecord(BaseModel):
    id: str
    brand: str
    model: str
    color: str | None = None
    season: str | None = None
    collection: str | None = None
    category: str | None = None
    gender: Literal["men", "women", "unisex"] | None = None
    sku: str | None = None
    ean: str | None = None
    mpn: str | None = None
    material: str | None = None
    images: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class MatchScores(BaseModel):
    exact_match: float = Field(ge=0, le=1)
    variant_match: float = Field(ge=0, le=1)
    visual_similarity: float = Field(ge=0, le=1)
    text_similarity: float = Field(ge=0, le=1)
    metadata_match: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)


class VariantHit(BaseModel):
    product: ProductRecord
    relation: Literal[
        "exact_same",
        "same_model_different_color",
        "same_model_different_season",
        "same_style_different_brand",
    ]
    score: float


class SimilarProduct(BaseModel):
    product: ProductRecord
    visual_similarity: float
    text_similarity: float
    hybrid_score: float
    reason: str


class MatchingResult(BaseModel):
    product: ProductRecord | None
    scores: MatchScores
    variants: list[VariantHit]
    similar_products: list[SimilarProduct]
`,
    },
    {
      path: `${FASHION_MATCHING_ROOT}/src/fashion_matching/normalization.py`,
      content: `"""Normalization Layer — fashion-specific text + metadata cleanup."""

from __future__ import annotations

import re
from dataclasses import dataclass


COLOR_MAP = {
    "blk": "black",
    "navy blu": "navy",
    "off white": "off-white",
}

SEASON_RE = re.compile(r"\\b(SS|FW|AW|RESORT)?\\s?(\\d{2})\\b", re.I)
EAN_RE = re.compile(r"\\b(\\d{8,14})\\b")
SKU_RE = re.compile(r"\\b([A-Z0-9][A-Z0-9._/-]{3,})\\b", re.I)


@dataclass
class NormalizedProductHints:
    brand: str | None
    model: str | None
    sku: str | None
    ean: str | None
    mpn: str | None
    color: str | None
    size: str | None
    season: str | None
    collection: str | None
    clean_text: str


def clean_text(raw: str) -> str:
    t = raw.lower().strip()
    t = re.sub(r"[^\\w\\s/.-]", " ", t)
    t = re.sub(r"\\s+", " ", t)
    return t


def standardize_color(token: str | None) -> str | None:
    if not token:
        return None
    key = token.lower().strip()
    return COLOR_MAP.get(key, key)


def extract_season(text: str) -> str | None:
    m = SEASON_RE.search(text)
    if not m:
        return None
    prefix = (m.group(1) or "SS").upper()
    return f"{prefix}{m.group(2)}"


def normalize_ocr(ocr_text: str, barcode: str | None = None) -> NormalizedProductHints:
    clean = clean_text(ocr_text)
    ean = barcode or (EAN_RE.search(clean).group(1) if EAN_RE.search(clean) else None)
    sku_match = SKU_RE.search(clean.upper())
    parts = clean.split()
    brand = parts[0].title() if parts else None
    return NormalizedProductHints(
        brand=brand,
        model=" ".join(parts[1:4]).title() if len(parts) > 1 else None,
        sku=sku_match.group(1) if sku_match else None,
        ean=ean,
        mpn=None,
        color=standardize_color(parts[-1] if parts else None),
        size=None,
        season=extract_season(clean),
        collection=None,
        clean_text=clean,
    )
`,
    },
    {
      path: `${FASHION_MATCHING_ROOT}/src/fashion_matching/embeddings.py`,
      content: `"""Embedding Layer — CLIP (image) + Sentence-BERT (text) + fusion."""

from __future__ import annotations

import numpy as np


class EmbeddingService:
    """Wire CLIP ViT-L/14 + Sentence-BERT in production."""

    text_dim = 384
    image_dim = 768

    def embed_text(self, text: str) -> np.ndarray:
        # TODO: sentence-transformers/all-MiniLM-L6-v2 or fashion-tuned model
        rng = np.random.default_rng(abs(hash(text)) % (2**32))
        v = rng.normal(size=self.text_dim)
        return v / (np.linalg.norm(v) + 1e-9)

    def embed_image_bytes(self, data: bytes) -> np.ndarray:
        rng = np.random.default_rng(sum(data[:64]) if data else 0)
        v = rng.normal(size=self.image_dim)
        return v / (np.linalg.norm(v) + 1e-9)

    def fuse(self, text_vec: np.ndarray, image_vec: np.ndarray, w_text=0.4, w_img=0.6) -> np.ndarray:
        t = text_vec / (np.linalg.norm(text_vec) + 1e-9)
        padded = np.zeros_like(t)
        n = min(len(t), len(image_vec))
        padded[:n] = image_vec[:n] / (np.linalg.norm(image_vec[:n]) + 1e-9)
        fused = w_text * t + w_img * padded
        return fused / (np.linalg.norm(fused) + 1e-9)
`,
    },
    {
      path: `${FASHION_MATCHING_ROOT}/src/fashion_matching/matching.py`,
      content: `"""Matching Layer — FAISS HNSW + metadata filters."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

try:
    import faiss  # type: ignore
except ImportError:  # pragma: no cover
    faiss = None  # type: ignore

from .types import ProductRecord


@dataclass
class SearchHit:
    product: ProductRecord
    distance: float


class ProductIndex:
    def __init__(self, dim: int = 384):
        self.dim = dim
        self._products: list[ProductRecord] = []
        self._index = faiss.IndexHNSWFlat(dim, 32) if faiss else None

    def add(self, product: ProductRecord, vector: np.ndarray) -> None:
        self._products.append(product)
        if self._index is not None:
            self._index.add(vector.reshape(1, -1).astype("float32"))

    def search(
        self,
        query: np.ndarray,
        k: int = 50,
        brand: str | None = None,
        category: str | None = None,
        gender: str | None = None,
    ) -> list[SearchHit]:
        if not self._products:
            return []
        if self._index is None:
            return [SearchHit(p, 0.5) for p in self._products[:k]]

        distances, indices = self._index.search(query.reshape(1, -1).astype("float32"), k)
        hits: list[SearchHit] = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx < 0 or idx >= len(self._products):
                continue
            p = self._products[idx]
            if brand and p.brand.lower() != brand.lower():
                continue
            if category and (p.category or "").lower() != category.lower():
                continue
            if gender and (p.gender or "") != gender:
                continue
            hits.append(SearchHit(product=p, distance=float(dist)))
        return hits
`,
    },
    {
      path: `${FASHION_MATCHING_ROOT}/src/fashion_matching/scoring.py`,
      content: `"""Confidence Scoring Engine."""

from __future__ import annotations

from .types import MatchScores


def metadata_match_score(query_meta: dict, product_meta: dict) -> float:
    if not query_meta or not product_meta:
        return 0.0
    keys = set(query_meta) & set(product_meta)
    if not keys:
        return 0.0
    matches = sum(1 for k in keys if str(query_meta[k]).lower() == str(product_meta[k]).lower())
    return matches / len(keys)


def compute_scores(
    visual: float,
    text: float,
    metadata: float,
    *,
    brand_mismatch: bool = False,
    exact_code_boost: float = 0.0,
) -> MatchScores:
    if brand_mismatch:
        visual *= 0.6
        text *= 0.5
    confidence = 0.45 * visual + 0.35 * text + 0.20 * metadata
    confidence = min(1.0, confidence + exact_code_boost)
    exact = min(1.0, 0.5 * text + 0.3 * metadata + 0.2 * visual + exact_code_boost)
    variant = min(1.0, 0.4 * text + 0.35 * visual + 0.25 * metadata)
    return MatchScores(
        exact_match=exact,
        variant_match=variant,
        visual_similarity=visual,
        text_similarity=text,
        metadata_match=metadata,
        confidence=confidence,
    )
`,
    },
    {
      path: `${FASHION_MATCHING_ROOT}/src/fashion_matching/variant_resolver.py`,
      content: `"""Variant Resolver — color, season, collection, material."""

from __future__ import annotations

from .types import ProductRecord, VariantHit


def resolve_variants(query: ProductRecord, candidates: list[ProductRecord]) -> list[VariantHit]:
    out: list[VariantHit] = []
    for c in candidates:
        if c.id == query.id:
            continue
        same_brand = c.brand.lower() == query.brand.lower()
        same_model = c.model.lower() == query.model.lower()
        if same_brand and same_model and c.color == query.color and c.season == query.season:
            rel = "exact_same"
        elif same_brand and same_model and c.color != query.color:
            rel = "same_model_different_color"
        elif same_brand and same_model and c.season != query.season:
            rel = "same_model_different_season"
        else:
            rel = "same_style_different_brand"
        score = 0.9 if rel.startswith("same_model") else 0.65
        out.append(VariantHit(product=c, relation=rel, score=score))
    return sorted(out, key=lambda v: v.score, reverse=True)[:10]
`,
    },
    {
      path: `${FASHION_MATCHING_ROOT}/src/fashion_matching/similarity.py`,
      content: `"""Similarity Engine — hybrid visual + semantic."""

from __future__ import annotations

from .types import ProductRecord, SimilarProduct


def hybrid_score(visual: float, text: float, w_visual=0.55, w_text=0.45) -> float:
    return w_visual * visual + w_text * text


def find_similar(
    anchor: ProductRecord,
    pool: list[ProductRecord],
    visual_scores: dict[str, float],
    text_scores: dict[str, float],
) -> list[SimilarProduct]:
    results: list[SimilarProduct] = []
    for p in pool:
        if p.id == anchor.id:
            continue
        v = visual_scores.get(p.id, 0.0)
        t = text_scores.get(p.id, 0.0)
        h = hybrid_score(v, t)
        reason = "similar_visual" if v > t else "similar_style"
        results.append(
            SimilarProduct(
                product=p,
                visual_similarity=v,
                text_similarity=t,
                hybrid_score=h,
                reason=reason,
            )
        )
    return sorted(results, key=lambda s: s.hybrid_score, reverse=True)[:20]
`,
    },
    {
      path: `${FASHION_MATCHING_ROOT}/src/fashion_matching/pipeline.py`,
      content: `"""End-to-end Product Matching Pipeline."""

from __future__ import annotations

from .embeddings import EmbeddingService
from .matching import ProductIndex
from .normalization import normalize_ocr
from .output_formatter import format_result
from .scoring import compute_scores, metadata_match_score
from .similarity import find_similar
from .types import MatchingResult, MultimodalInput, ProductRecord
from .variant_resolver import resolve_variants


class FashionMatchingPipeline:
    def __init__(self, index: ProductIndex | None = None):
        self.embeddings = EmbeddingService()
        self.index = index or ProductIndex()

    def match(self, raw: MultimodalInput) -> MatchingResult:
        hints = normalize_ocr(raw.ocr_text or "", raw.barcode)
        text_vec = self.embeddings.embed_text(hints.clean_text)
        image_vec = self.embeddings.embed_image_bytes(b"")
        fused = self.embeddings.fuse(text_vec, image_vec)

        hits = self.index.search(
            fused,
            k=50,
            brand=hints.brand,
        )

        if not hits:
            return format_result(None, [], [], compute_scores(0, 0, 0))

        top = hits[0].product
        visual = max(0.0, 1.0 - hits[0].distance)
        text = 0.85 if hints.sku and hints.sku == top.sku else 0.6
        meta = metadata_match_score(raw.metadata, top.metadata)
        boost = 0.15 if hints.ean and hints.ean == top.ean else 0.0
        brand_mismatch = bool(hints.brand and hints.brand.lower() != top.brand.lower())

        scores = compute_scores(
            visual,
            text,
            meta,
            brand_mismatch=brand_mismatch,
            exact_code_boost=boost,
        )

        pool = [h.product for h in hits]
        variants = resolve_variants(top, pool)
        similar = find_similar(
            top,
            pool,
            {p.id: max(0, 1 - h.distance) for h, p in zip(hits, pool)},
            {p.id: text for p in pool},
        )

        return format_result(top, scores, variants, similar)
`,
    },
    {
      path: `${FASHION_MATCHING_ROOT}/src/fashion_matching/output_formatter.py`,
      content: `from __future__ import annotations

from .types import MatchScores, MatchingResult, ProductRecord, SimilarProduct, VariantHit


def format_result(
    product: ProductRecord | None,
    scores: MatchScores,
    variants: list[VariantHit],
    similar: list[SimilarProduct],
) -> MatchingResult:
    return MatchingResult(
        product=product,
        scores=scores,
        variants=variants,
        similar_products=similar,
    )
`,
    },
    {
      path: `${FASHION_MATCHING_ROOT}/api/main.py`,
      content: `from fastapi import FastAPI, File, Form, UploadFile

from src.fashion_matching.pipeline import FashionMatchingPipeline
from src.fashion_matching.types import MultimodalInput

app = FastAPI(title="Fashion Product Matching Engine", version="1.0.0")
pipeline = FashionMatchingPipeline()


@app.post("/v1/match")
async def match_product(
    barcode: str | None = Form(default=None),
    ocr_text: str | None = Form(default=None),
    nfc_url: str | None = Form(default=None),
    image: UploadFile | None = File(default=None),
):
    image_urls: list[str] = []
    if image:
        image_urls.append(f"upload://{image.filename}")
    payload = MultimodalInput(
        barcode=barcode,
        ocr_text=ocr_text,
        nfc_url=nfc_url,
        image_urls=image_urls,
    )
    result = pipeline.match(payload)
    return result.model_dump()
`,
    },
    {
      path: `${FASHION_MATCHING_ROOT}/tests/test_scoring.py`,
      content: `from src.fashion_matching.scoring import compute_scores


def test_confidence_formula():
    s = compute_scores(0.88, 0.75, 0.9)
    assert 0.8 <= s.confidence <= 0.9
    assert s.exact_match > 0.5
`,
    },
  ];
}
