import Anthropic from "@anthropic-ai/sdk";
import type { NewsItem, Sport, NewsItemType } from "@prisma/client";

/**
 * AI-powered analysis service for news items.
 * Uses Claude to extract entities, classify content, and generate summaries.
 */

// Initialize Anthropic client (only if API key is available)
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export interface AIAnalysisResult {
  teams: string[];
  players: string[];
  topics: string[];
  newsType: NewsItemType;
  timeSensitivity: "high" | "medium" | "low";
  summary: string;
  bettingImpact?: string;
  confidence: number;
}

/**
 * Check if AI analysis is available.
 */
export function isAIConfigured(): boolean {
  return anthropic !== null;
}

/**
 * Analyze a news item using Claude.
 */
export async function analyzeNewsItem(
  newsItem: NewsItem
): Promise<AIAnalysisResult | null> {
  if (!anthropic) {
    console.log("[AIAnalyzer] Anthropic API not configured, skipping AI analysis");
    return null;
  }

  try {
    const prompt = buildAnalysisPrompt(newsItem.headline, newsItem.content, newsItem.sport);

    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Extract text content
    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return null;
    }

    // Parse the JSON response
    return parseAnalysisResponse(textContent.text);
  } catch (error) {
    console.error("[AIAnalyzer] Error analyzing news item:", error);
    return null;
  }
}

/**
 * Analyze multiple news items in batch.
 */
export async function batchAnalyzeNewsItems(
  newsItems: NewsItem[],
  concurrency: number = 3
): Promise<Map<string, AIAnalysisResult | null>> {
  const results = new Map<string, AIAnalysisResult | null>();

  if (!anthropic) {
    // Return empty results if AI not configured
    for (const item of newsItems) {
      results.set(item.id, null);
    }
    return results;
  }

  // Process in batches to respect rate limits
  const batches: NewsItem[][] = [];
  for (let i = 0; i < newsItems.length; i += concurrency) {
    batches.push(newsItems.slice(i, i + concurrency));
  }

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const analysis = await analyzeNewsItem(item);
        return { id: item.id, analysis };
      })
    );

    for (const { id, analysis } of batchResults) {
      results.set(id, analysis);
    }

    // Small delay between batches to avoid rate limiting
    if (batches.indexOf(batch) < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}

/**
 * Build the analysis prompt for Claude.
 */
function buildAnalysisPrompt(
  headline: string,
  content: string | null,
  sport: Sport
): string {
  return `Analyze this ${sport} sports news article and extract structured information.

HEADLINE: ${headline}

CONTENT: ${content || "(No content available)"}

Please analyze and respond with ONLY a JSON object (no markdown, no explanation) with these fields:
{
  "teams": ["team names mentioned"],
  "players": ["player names mentioned"],
  "topics": ["relevant topics like trade, injury, signing, draft, etc."],
  "newsType": "TRADE|INJURY|GAME_RESULT|BETTING_LINE|RUMOR|ANALYSIS|BREAKING|SCHEDULE",
  "timeSensitivity": "high|medium|low",
  "summary": "1-2 sentence summary",
  "bettingImpact": "brief note on betting implications if any, or null",
  "confidence": 0.0-1.0
}

Rules:
- teams: Use full team names (e.g., "Los Angeles Lakers" not "Lakers")
- players: Use full names (e.g., "LeBron James" not "LeBron")
- newsType: Choose the single most appropriate type
- timeSensitivity: "high" for breaking/urgent news, "low" for analysis/features
- confidence: Your confidence in the analysis accuracy

Respond with ONLY the JSON object.`;
}

/**
 * Parse the AI response into structured data.
 */
function parseAnalysisResponse(text: string): AIAnalysisResult | null {
  try {
    // Try to extract JSON from the response
    let jsonStr = text.trim();

    // Handle potential markdown code blocks
    if (jsonStr.startsWith("```")) {
      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        jsonStr = match[1].trim();
      }
    }

    const parsed = JSON.parse(jsonStr);

    // Validate and normalize the response
    return {
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
      players: Array.isArray(parsed.players) ? parsed.players : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      newsType: validateNewsType(parsed.newsType),
      timeSensitivity: validateTimeSensitivity(parsed.timeSensitivity),
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      bettingImpact: parsed.bettingImpact || undefined,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    };
  } catch (error) {
    console.error("[AIAnalyzer] Error parsing response:", error);
    return null;
  }
}

/**
 * Validate and normalize news type.
 */
function validateNewsType(type: unknown): NewsItemType {
  const validTypes = [
    "TRADE",
    "INJURY",
    "GAME_RESULT",
    "BETTING_LINE",
    "RUMOR",
    "ANALYSIS",
    "BREAKING",
    "SCHEDULE",
  ];

  if (typeof type === "string" && validTypes.includes(type.toUpperCase())) {
    return type.toUpperCase() as NewsItemType;
  }

  return "ANALYSIS";
}

/**
 * Validate and normalize time sensitivity.
 */
function validateTimeSensitivity(sensitivity: unknown): "high" | "medium" | "low" {
  if (
    typeof sensitivity === "string" &&
    ["high", "medium", "low"].includes(sensitivity.toLowerCase())
  ) {
    return sensitivity.toLowerCase() as "high" | "medium" | "low";
  }

  return "medium";
}

/**
 * Generate a brief summary using AI.
 */
export async function generateSummary(
  headline: string,
  content: string | null
): Promise<string | null> {
  if (!anthropic) {
    return null;
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Summarize this sports news in 1-2 sentences:

HEADLINE: ${headline}

CONTENT: ${content || "(No content)"}

Summary:`,
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (textContent && textContent.type === "text") {
      return textContent.text.trim();
    }

    return null;
  } catch (error) {
    console.error("[AIAnalyzer] Error generating summary:", error);
    return null;
  }
}

/**
 * Classify the betting impact of a news item.
 */
export async function classifyBettingImpact(
  newsItem: NewsItem
): Promise<{
  hasImpact: boolean;
  impact: "high" | "medium" | "low" | "none";
  reason?: string;
} | null> {
  if (!anthropic) {
    return null;
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Analyze this ${newsItem.sport} sports news for betting impact.

HEADLINE: ${newsItem.headline}

CONTENT: ${newsItem.content || "(No content)"}

Does this news likely affect betting lines? Respond with ONLY a JSON object:
{
  "hasImpact": true/false,
  "impact": "high|medium|low|none",
  "reason": "brief explanation"
}`,
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return null;
    }

    const parsed = JSON.parse(textContent.text.trim());
    return {
      hasImpact: !!parsed.hasImpact,
      impact: parsed.impact || "none",
      reason: parsed.reason,
    };
  } catch (error) {
    console.error("[AIAnalyzer] Error classifying betting impact:", error);
    return null;
  }
}
