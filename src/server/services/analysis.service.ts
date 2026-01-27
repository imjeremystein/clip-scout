import { prisma } from "@/lib/prisma";
import { analyzeTranscript, VideoAnalysisResult } from "@/lib/anthropic";
import { calculateRelevanceScore } from "./scoring.service";
import { chunkTranscript, TranscriptChunk } from "./transcript.service";

export interface AnalysisConfig {
  useAI: boolean; // Whether to use Claude for analysis
  useEmbeddings: boolean; // Whether to use OpenAI embeddings for scoring
  maxMoments: number; // Maximum moments to extract per video
  minRelevanceScore: number; // Minimum score to be considered a candidate
}

const DEFAULT_CONFIG: AnalysisConfig = {
  useAI: true,
  useEmbeddings: true,
  maxMoments: 5,
  minRelevanceScore: 0.3,
};

export interface AnalyzedVideo {
  videoId: string;
  relevanceScore: number;
  scoreBreakdown: Record<string, number>;
  summary?: string;
  whyRelevant?: string;
  moments: Array<{
    startSeconds: number;
    endSeconds: number;
    label: string;
    description: string;
    confidence: number;
  }>;
  entities: {
    people: string[];
    teams: string[];
    events: string[];
    topics: string[];
  };
}

/**
 * Analyze a video's transcript and score its relevance
 */
export async function analyzeVideo(
  videoId: string,
  transcriptId: string,
  keywords: string[],
  sport: string,
  config: AnalysisConfig = DEFAULT_CONFIG
): Promise<AnalyzedVideo | null> {
  // Fetch video and transcript data
  const video = await prisma.youTubeVideo.findUnique({
    where: { id: videoId },
  });

  const transcript = await prisma.transcript.findUnique({
    where: { id: transcriptId },
    include: {
      segments: {
        orderBy: { startSeconds: "asc" },
      },
    },
  });

  if (!video || !transcript) {
    return null;
  }

  // Calculate relevance score
  const { totalScore, breakdown } = await calculateRelevanceScore(
    {
      transcript: transcript.fullText,
      videoTitle: video.title,
      channelName: video.channelTitle,
      viewCount: video.viewCount,
      likeCount: video.likeCount,
      publishedAt: video.publishedAt,
      durationSeconds: video.durationSeconds,
    },
    keywords,
    sport,
    config.useEmbeddings
  );

  // Skip if below minimum threshold
  if (totalScore < config.minRelevanceScore) {
    return null;
  }

  let aiAnalysis: VideoAnalysisResult | null = null;

  // Use Claude for detailed analysis if enabled and score is promising
  if (config.useAI && totalScore >= 0.4) {
    try {
      aiAnalysis = await analyzeTranscript(
        transcript.fullText,
        keywords,
        sport,
        video.title,
        video.channelTitle
      );
    } catch (error) {
      console.error(`AI analysis failed for video ${videoId}:`, error);
    }
  }

  // Extract moments - use AI results or fall back to keyword-based extraction
  let moments: AnalyzedVideo["moments"] = [];

  if (aiAnalysis && aiAnalysis.keyMoments.length > 0) {
    moments = aiAnalysis.keyMoments.slice(0, config.maxMoments).map((m) => ({
      startSeconds: m.startSeconds,
      endSeconds: m.endSeconds,
      label: m.label,
      description: m.description,
      confidence: m.confidence,
    }));
  } else {
    // Fall back to keyword-based moment extraction
    const chunks = chunkTranscript(transcript.segments);
    moments = extractKeywordMoments(chunks, keywords, config.maxMoments);
  }

  // Merge adjacent moments
  moments = mergeAdjacentMoments(moments, 10); // 10 second gap threshold

  return {
    videoId,
    relevanceScore: aiAnalysis?.relevanceScore
      ? (totalScore + aiAnalysis.relevanceScore) / 2 // Average scores
      : totalScore,
    scoreBreakdown: breakdown,
    summary: aiAnalysis?.summary,
    whyRelevant: aiAnalysis?.whyRelevant,
    moments,
    entities: aiAnalysis?.entities || {
      people: [],
      teams: [],
      events: [],
      topics: [],
    },
  };
}

/**
 * Extract moments based on keyword matches in transcript chunks
 */
function extractKeywordMoments(
  chunks: TranscriptChunk[],
  keywords: string[],
  maxMoments: number
): AnalyzedVideo["moments"] {
  const moments: Array<{
    startSeconds: number;
    endSeconds: number;
    label: string;
    description: string;
    confidence: number;
    matchCount: number;
  }> = [];

  for (const chunk of chunks) {
    const lowerText = chunk.text.toLowerCase();
    const matchedKeywords: string[] = [];

    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
      }
    }

    if (matchedKeywords.length > 0) {
      moments.push({
        startSeconds: chunk.startSeconds,
        endSeconds: chunk.endSeconds,
        label: matchedKeywords[0], // Use first matched keyword as label
        description: chunk.text.slice(0, 200),
        confidence: matchedKeywords.length / keywords.length,
        matchCount: matchedKeywords.length,
      });
    }
  }

  // Sort by match count and return top moments
  return moments
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, maxMoments)
    .map(({ matchCount, ...moment }) => moment);
}

/**
 * Merge adjacent moments that are close together
 */
function mergeAdjacentMoments(
  moments: AnalyzedVideo["moments"],
  gapThreshold: number
): AnalyzedVideo["moments"] {
  if (moments.length <= 1) return moments;

  // Sort by start time
  const sorted = [...moments].sort((a, b) => a.startSeconds - b.startSeconds);

  const merged: AnalyzedVideo["moments"] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];

    // Check if moments should be merged
    if (next.startSeconds - current.endSeconds <= gapThreshold) {
      // Merge: extend end time and combine descriptions
      current.endSeconds = Math.max(current.endSeconds, next.endSeconds);
      current.label = `${current.label} + ${next.label}`;
      current.description = `${current.description}\n---\n${next.description}`;
      current.confidence = Math.max(current.confidence, next.confidence);
    } else {
      // Don't merge: save current and start new
      merged.push(current);
      current = { ...next };
    }
  }

  // Don't forget the last one
  merged.push(current);

  // Limit total duration of merged clips to 90 seconds
  return merged.map((m) => {
    const duration = m.endSeconds - m.startSeconds;
    if (duration > 90) {
      return {
        ...m,
        endSeconds: m.startSeconds + 90,
      };
    }
    return m;
  });
}

/**
 * Analyze a video using only its metadata (no transcript)
 * Used when transcript is unavailable
 */
export async function analyzeVideoMetadataOnly(
  videoId: string,
  videoData: {
    title: string;
    description: string;
    channelTitle: string;
    viewCount?: number;
    likeCount?: number;
    publishedAt: Date;
  },
  keywords: string[],
  sport: string
): Promise<AnalyzedVideo | null> {
  // Calculate a simple relevance score based on metadata
  const titleLower = videoData.title.toLowerCase();
  const descLower = videoData.description.toLowerCase();
  const combinedText = `${titleLower} ${descLower}`;

  // Count keyword matches
  let keywordMatches = 0;
  const matchedKeywords: string[] = [];
  for (const keyword of keywords) {
    const keywordLower = keyword.toLowerCase();
    if (combinedText.includes(keywordLower)) {
      keywordMatches++;
      matchedKeywords.push(keyword);
    }
  }

  // Calculate base score from keyword matches
  const keywordScore = keywords.length > 0 ? keywordMatches / keywords.length : 0;

  // Engagement score (log scale)
  let engagementScore = 0.5;
  if (videoData.viewCount && videoData.viewCount > 0) {
    engagementScore = Math.min(Math.log10(videoData.viewCount) / 7, 1);
  }

  // Recency score
  const daysSincePublished = (Date.now() - videoData.publishedAt.getTime()) / (1000 * 60 * 60 * 24);
  let recencyScore = 0.5;
  if (daysSincePublished <= 1) recencyScore = 1.0;
  else if (daysSincePublished <= 7) recencyScore = 0.8;
  else if (daysSincePublished <= 14) recencyScore = 0.6;
  else if (daysSincePublished <= 30) recencyScore = 0.4;

  // Combined score (weighted)
  const relevanceScore = keywordScore * 0.5 + engagementScore * 0.25 + recencyScore * 0.25;

  // Skip if score is too low
  if (relevanceScore < 0.2) {
    return null;
  }

  return {
    videoId,
    relevanceScore,
    scoreBreakdown: {
      keywordScore,
      engagementScore,
      recencyScore,
    },
    summary: `Video about ${sport}: ${videoData.title}`,
    whyRelevant: matchedKeywords.length > 0
      ? `Contains keywords: ${matchedKeywords.join(', ')}`
      : `Related to ${sport} content`,
    moments: [], // No moments without transcript
    entities: {
      people: [],
      teams: [],
      events: [],
      topics: matchedKeywords,
    },
  };
}

/**
 * Rank candidates and return top N
 */
export function rankCandidates(
  candidates: AnalyzedVideo[],
  topN: number = 100
): AnalyzedVideo[] {
  return candidates
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, topN);
}

/**
 * Save analysis results to database
 */
export async function saveAnalysisResults(
  orgId: string,
  queryRunId: string,
  queryDefinitionId: string,
  analysis: AnalyzedVideo
): Promise<string> {
  const candidate = await prisma.candidate.create({
    data: {
      orgId,
      youtubeVideoId: analysis.videoId,
      queryRunId,
      queryDefinitionId,
      relevanceScore: analysis.relevanceScore,
      status: "NEW",
      aiSummary: analysis.summary,
      whyRelevant: analysis.whyRelevant,
      entitiesJson: analysis.entities,
      moments: {
        create: analysis.moments.map((moment) => ({
          orgId,
          label: moment.label,
          startSeconds: moment.startSeconds,
          endSeconds: moment.endSeconds,
          confidence: moment.confidence,
          supportingQuote: moment.description,
        })),
      },
    },
  });

  return candidate.id;
}
