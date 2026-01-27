import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

// Use Gemini 2.5 Flash for video analysis
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

export interface VideoTranscriptResult {
  transcript: string;
  segments: Array<{
    text: string;
    startSeconds: number;
    endSeconds: number;
  }>;
  summary: string;
  keyMoments: Array<{
    label: string;
    startSeconds: number;
    endSeconds: number;
    description: string;
  }>;
  entities: {
    people: string[];
    teams: string[];
    topics: string[];
  };
}

/**
 * Use Gemini to analyze a YouTube video and extract transcript + insights
 */
export async function analyzeYouTubeVideo(
  youtubeVideoId: string,
  keywords: string[],
  sport: string
): Promise<VideoTranscriptResult | null> {
  if (!process.env.GOOGLE_AI_API_KEY) {
    console.log("[Gemini] No API key configured");
    return null;
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;

  const prompt = `Analyze this YouTube video about ${sport}.

Video URL: ${youtubeUrl}

Please provide:
1. A full transcript of what is said in the video (as accurate as possible)
2. A brief summary (2-3 sentences)
3. Key moments with timestamps that relate to these keywords: ${keywords.join(", ")}
4. People, teams, and topics mentioned

Respond in this exact JSON format:
{
  "transcript": "Full transcript text here...",
  "segments": [
    {"text": "segment text", "startSeconds": 0, "endSeconds": 30},
    ...
  ],
  "summary": "Brief summary...",
  "keyMoments": [
    {"label": "Moment name", "startSeconds": 45, "endSeconds": 60, "description": "What happens"},
    ...
  ],
  "entities": {
    "people": ["Name 1", "Name 2"],
    "teams": ["Team 1"],
    "topics": ["Topic 1"]
  }
}

Only include key moments that are truly noteworthy. If you cannot access the video, return null for all fields.`;

  try {
    console.log(`[Gemini] Analyzing video ${youtubeVideoId}...`);

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log("[Gemini] No JSON found in response");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as VideoTranscriptResult;

    // Validate we got actual content
    if (!parsed.transcript || parsed.transcript.length < 50) {
      console.log("[Gemini] Transcript too short or empty");
      return null;
    }

    console.log(`[Gemini] Got transcript (${parsed.transcript.length} chars) and ${parsed.keyMoments?.length || 0} moments`);
    return parsed;
  } catch (error) {
    console.error("[Gemini] Error analyzing video:", error);
    return null;
  }
}

/**
 * Check if Gemini API is configured
 */
export function isGeminiConfigured(): boolean {
  return !!process.env.GOOGLE_AI_API_KEY;
}
