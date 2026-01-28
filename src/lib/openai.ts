import OpenAI from "openai";
import redis from "./redis";
import crypto from "crypto";

// Initialize OpenAI client only if API key is present
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Embedding model configuration
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_CACHE_TTL = 30 * 24 * 60 * 60; // 30 days

// Generate a cache key from content
function getEmbeddingCacheKey(text: string): string {
  const hash = crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
  return `embedding:${EMBEDDING_MODEL}:${hash}`;
}

/**
 * Get embedding for a single text
 */
export async function getEmbedding(text: string): Promise<number[]> {
  if (!openai) {
    throw new Error("OpenAI API key not configured. Set OPENAI_API_KEY environment variable.");
  }

  // Check cache first
  const cacheKey = getEmbeddingCacheKey(text);
  const cached = await redis.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  // Generate embedding
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const embedding = response.data[0].embedding;

  // Cache the result
  await redis.setex(cacheKey, EMBEDDING_CACHE_TTL, JSON.stringify(embedding));

  return embedding;
}

/**
 * Get embeddings for multiple texts (batched)
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (!openai) {
    throw new Error("OpenAI API key not configured. Set OPENAI_API_KEY environment variable.");
  }

  if (texts.length === 0) return [];

  // Check cache for each text
  const cacheKeys = texts.map(getEmbeddingCacheKey);
  const cachedResults = await redis.mget(...cacheKeys);

  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];
  const results: (number[] | null)[] = cachedResults.map((cached, i) => {
    if (cached) {
      return JSON.parse(cached);
    }
    uncachedIndices.push(i);
    uncachedTexts.push(texts[i]);
    return null;
  });

  // Fetch uncached embeddings in batches
  if (uncachedTexts.length > 0) {
    const batchSize = 100; // OpenAI limit
    for (let i = 0; i < uncachedTexts.length; i += batchSize) {
      const batch = uncachedTexts.slice(i, i + batchSize);
      const batchIndices = uncachedIndices.slice(i, i + batchSize);

      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
      });

      // Store results and cache
      const pipeline = redis.pipeline();
      for (let j = 0; j < response.data.length; j++) {
        const embedding = response.data[j].embedding;
        const originalIndex = batchIndices[j];
        results[originalIndex] = embedding;

        // Add to cache pipeline
        const cacheKey = cacheKeys[originalIndex];
        pipeline.setex(cacheKey, EMBEDDING_CACHE_TTL, JSON.stringify(embedding));
      }
      await pipeline.exec();
    }
  }

  return results as number[][];
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Embeddings must have the same dimensions");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Find most similar texts to a query
 */
export async function findMostSimilar(
  queryText: string,
  candidates: Array<{ id: string; text: string }>,
  topK = 10
): Promise<Array<{ id: string; text: string; similarity: number }>> {
  const queryEmbedding = await getEmbedding(queryText);
  const candidateTexts = candidates.map((c) => c.text);
  const candidateEmbeddings = await getEmbeddings(candidateTexts);

  const results = candidates.map((candidate, i) => ({
    ...candidate,
    similarity: cosineSimilarity(queryEmbedding, candidateEmbeddings[i]),
  }));

  return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}

export { openai, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
