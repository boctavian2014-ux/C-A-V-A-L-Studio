import { Router } from "express";
import { DeterministicEmbeddingProvider } from "../../../context-engine/embeddings";
import type { MarketplaceExtension } from "../../api";
import type { MarketplaceRegistry } from "../registry";

export const createSearchRouter = (registry: MarketplaceRegistry): Router => {
  const router = Router();
  const embeddings = new DeterministicEmbeddingProvider();

  router.get("/", async (request, response) => {
    const query = request.query.q?.toString() ?? "";
    const mode = request.query.mode?.toString() ?? "hybrid";
    const sortBy = request.query.sortBy as "relevance" | "downloads" | "rating" | "trending" | undefined;
    const fullTextResults = await registry.search({
      text: query,
      category: request.query.category?.toString(),
      sortBy: sortBy ?? "relevance",
      limit: Number(request.query.limit ?? 50)
    });

    if (mode === "full-text" || query.trim().length === 0) {
      response.json(fullTextResults);
      return;
    }

    const allExtensions = await registry.search({ limit: 500 });
    const semanticResults = await semanticRank(query, allExtensions, embeddings);
    const merged = mergeResults(fullTextResults, semanticResults)
      .sort((left, right) => right.searchScore - left.searchScore)
      .slice(0, Number(request.query.limit ?? 50));

    response.json(merged);
  });

  router.get("/autocomplete", async (request, response) => {
    const query = request.query.q?.toString().toLowerCase() ?? "";
    const extensions = await registry.search({ limit: 500 });
    response.json(extensions
      .flatMap((extension) => [extension.displayName, extension.name, ...extension.tags])
      .filter((value) => value.toLowerCase().includes(query))
      .slice(0, 10));
  });

  return router;
};

const semanticRank = async (
  query: string,
  extensions: MarketplaceExtension[],
  embeddings: DeterministicEmbeddingProvider
): Promise<Array<MarketplaceExtension & { searchScore: number }>> => {
  const queryVector = await embeddings.embed(query);
  const ranked = await Promise.all(extensions.map(async (extension) => {
    const vector = await embeddings.embed(`${extension.displayName}\n${extension.description}\n${extension.tags.join(" ")}`);
    return {
      ...extension,
      searchScore: cosineSimilarity(queryVector, vector) * 100 + extension.rating * 4 + extension.downloads / 1_000 + extension.trendingScore
    };
  }));

  return ranked.sort((left, right) => right.searchScore - left.searchScore);
};

const mergeResults = (
  fullText: MarketplaceExtension[],
  semantic: Array<MarketplaceExtension & { searchScore: number }>
): Array<MarketplaceExtension & { searchScore: number }> => {
  const byId = new Map<string, MarketplaceExtension & { searchScore: number }>();

  semantic.forEach((extension) => byId.set(extension.id, extension));
  fullText.forEach((extension, index) => {
    const existing = byId.get(extension.id);
    byId.set(extension.id, {
      ...(existing ?? extension),
      searchScore: (existing?.searchScore ?? 0) + 100 - index
    });
  });

  return [...byId.values()];
};

const cosineSimilarity = (left: number[], right: number[]): number => {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }

  return leftNorm === 0 || rightNorm === 0 ? 0 : dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
};
