import Anthropic from "@anthropic-ai/sdk";

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Model configuration
const CLAUDE_MODEL = "claude-3-5-sonnet-20241022";

export interface MomentAnalysis {
  label: string;
  startSeconds: number;
  endSeconds: number;
  description: string;
  confidence: number;
  entities: string[];
  sentiment: "positive" | "negative" | "neutral";
}

export interface VideoAnalysisResult {
  summary: string;
  whyRelevant: string;
  keyMoments: MomentAnalysis[];
  entities: {
    people: string[];
    teams: string[];
    events: string[];
    topics: string[];
  };
  relevanceScore: number;
}

/**
 * Analyze video transcript to extract key moments and insights
 */
export async function analyzeTranscript(
  transcript: string,
  keywords: string[],
  sport: string,
  videoTitle: string,
  channelName: string
): Promise<VideoAnalysisResult> {
  const systemPrompt = `You are an expert sports content analyst specializing in ${sport}. Your task is to analyze video transcripts and identify key moments that would be valuable for broadcast discussion.

Focus on:
- Dramatic moments, turning points, or controversial plays
- Expert analysis or insider information
- Breaking news or significant announcements
- Memorable quotes or soundbites
- Statistical insights or records

Respond with a JSON object (no markdown formatting).`;

  const userPrompt = `Analyze this ${sport} video transcript and identify the most relevant moments for broadcast discussion.

Video Title: ${videoTitle}
Channel: ${channelName}
Keywords of Interest: ${keywords.join(", ")}

Transcript:
${transcript.slice(0, 15000)} ${transcript.length > 15000 ? "... [truncated]" : ""}

Provide your analysis as a JSON object with this structure:
{
  "summary": "Brief 2-3 sentence summary of the video content",
  "whyRelevant": "Explanation of why this video is relevant to the search keywords",
  "keyMoments": [
    {
      "label": "Short label for the moment (e.g., 'Game-winning touchdown')",
      "startSeconds": <approximate start time in seconds>,
      "endSeconds": <approximate end time in seconds>,
      "description": "Detailed description of what happens",
      "confidence": <0-1 confidence score>,
      "entities": ["list", "of", "mentioned", "entities"],
      "sentiment": "positive|negative|neutral"
    }
  ],
  "entities": {
    "people": ["names of people mentioned"],
    "teams": ["team names"],
    "events": ["game names, tournaments, etc"],
    "topics": ["main topics discussed"]
  },
  "relevanceScore": <0-1 overall relevance to keywords>
}

Only include moments that are genuinely noteworthy. Limit to 5 key moments maximum.`;

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
    system: systemPrompt,
  });

  // Extract text content from response
  const responseText = message.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { type: "text"; text: string }).text)
    .join("");

  // Parse JSON response
  try {
    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    return JSON.parse(jsonMatch[0]) as VideoAnalysisResult;
  } catch (error) {
    console.error("Failed to parse Claude response:", error);
    // Return a default result on parse failure
    return {
      summary: "Analysis could not be completed",
      whyRelevant: "Unable to determine relevance",
      keyMoments: [],
      entities: { people: [], teams: [], events: [], topics: [] },
      relevanceScore: 0.5,
    };
  }
}

/**
 * Generate a concise summary for a video
 */
export async function summarizeVideo(
  transcript: string,
  videoTitle: string,
  sport: string
): Promise<string> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Summarize this ${sport} video in 2-3 sentences. Focus on the main topic and key takeaways.

Title: ${videoTitle}

Transcript excerpt:
${transcript.slice(0, 5000)}`,
      },
    ],
    system:
      "You are a sports content summarizer. Provide concise, informative summaries.",
  });

  const responseText = message.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { type: "text"; text: string }).text)
    .join("");

  return responseText;
}

/**
 * Extract entities from text
 */
export async function extractEntities(
  text: string,
  sport: string
): Promise<{ people: string[]; teams: string[]; events: string[] }> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Extract named entities from this ${sport} content. Return JSON with keys: people, teams, events.

Text:
${text.slice(0, 3000)}`,
      },
    ],
    system:
      "You are an entity extraction system. Return only valid JSON with arrays of strings.",
  });

  const responseText = message.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { type: "text"; text: string }).text)
    .join("");

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Fall through to default
  }

  return { people: [], teams: [], events: [] };
}

export { anthropic, CLAUDE_MODEL };
