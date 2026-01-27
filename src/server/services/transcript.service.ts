import { YoutubeTranscript } from "youtube-transcript";
import { prisma } from "@/lib/prisma";
import redis from "@/lib/redis";

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

interface TranscriptResult {
  segments: TranscriptSegment[];
  fullText: string;
  source: "YOUTUBE_API" | "AUTOGEN" | "THIRD_PARTY";
}

const TRANSCRIPT_CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

// Cache key for transcript
function getTranscriptCacheKey(videoId: string): string {
  return `transcript:${videoId}`;
}

// Fetch transcript from YouTube (using youtube-transcript library)
export async function fetchTranscript(
  youtubeVideoId: string
): Promise<TranscriptResult | null> {
  // Check Redis cache first
  const cached = await redis.get(getTranscriptCacheKey(youtubeVideoId));
  if (cached) {
    return JSON.parse(cached);
  }

  try {
    const transcriptData = await YoutubeTranscript.fetchTranscript(youtubeVideoId);

    if (!transcriptData || transcriptData.length === 0) {
      return null;
    }

    const segments: TranscriptSegment[] = transcriptData.map((item) => ({
      text: item.text,
      start: item.offset / 1000, // Convert ms to seconds
      duration: item.duration / 1000,
    }));

    const fullText = segments.map((s) => s.text).join(" ");

    const result: TranscriptResult = {
      segments,
      fullText,
      source: "YOUTUBE_API",
    };

    // Cache the result
    await redis.setex(
      getTranscriptCacheKey(youtubeVideoId),
      TRANSCRIPT_CACHE_TTL,
      JSON.stringify(result)
    );

    return result;
  } catch (error) {
    console.error(`Failed to fetch transcript for ${youtubeVideoId}:`, error);
    return null;
  }
}

// Save transcript to database
export async function saveTranscript(
  orgId: string,
  videoId: string,
  transcriptResult: TranscriptResult
) {
  const transcript = await prisma.transcript.create({
    data: {
      orgId,
      videoId,
      fullText: transcriptResult.fullText,
      sourceType: transcriptResult.source,
      language: "en",
      segments: {
        create: transcriptResult.segments.map((segment) => ({
          orgId,
          startSeconds: segment.start,
          endSeconds: segment.start + segment.duration,
          text: segment.text,
        })),
      },
    },
    include: {
      segments: true,
    },
  });

  return transcript;
}

// Get transcript from database
export async function getStoredTranscript(videoId: string) {
  return prisma.transcript.findFirst({
    where: { videoId },
    include: {
      segments: {
        orderBy: { startSeconds: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

// Chunk transcript for AI analysis
export interface TranscriptChunk {
  text: string;
  startSeconds: number;
  endSeconds: number;
  segmentIds: string[];
}

export function chunkTranscript(
  segments: Array<{ id: string; startSeconds: number; endSeconds: number; text: string }>,
  options: {
    targetDurationSeconds?: number;
    overlapSeconds?: number;
    maxChunkSize?: number;
  } = {}
): TranscriptChunk[] {
  const {
    targetDurationSeconds = 30,
    overlapSeconds = 5,
    maxChunkSize = 2000, // characters
  } = options;

  if (segments.length === 0) return [];

  const chunks: TranscriptChunk[] = [];
  let currentChunk: TranscriptChunk = {
    text: "",
    startSeconds: segments[0].startSeconds,
    endSeconds: segments[0].endSeconds,
    segmentIds: [],
  };

  for (const segment of segments) {
    const wouldExceedDuration =
      segment.endSeconds - currentChunk.startSeconds > targetDurationSeconds;
    const wouldExceedSize =
      currentChunk.text.length + segment.text.length > maxChunkSize;

    if ((wouldExceedDuration || wouldExceedSize) && currentChunk.text.length > 0) {
      // Save current chunk
      chunks.push({ ...currentChunk });

      // Start new chunk with overlap
      const overlapStart = Math.max(
        currentChunk.startSeconds,
        segment.startSeconds - overlapSeconds
      );

      // Find segments that overlap with the new chunk start
      const overlapSegments = segments.filter(
        (s) => s.startSeconds >= overlapStart && s.startSeconds < segment.startSeconds
      );

      currentChunk = {
        text: overlapSegments.map((s) => s.text).join(" "),
        startSeconds: overlapStart,
        endSeconds: segment.endSeconds,
        segmentIds: overlapSegments.map((s) => s.id),
      };
    }

    // Add segment to current chunk
    currentChunk.text =
      currentChunk.text.length > 0
        ? `${currentChunk.text} ${segment.text}`
        : segment.text;
    currentChunk.endSeconds = segment.endSeconds;
    currentChunk.segmentIds.push(segment.id);
  }

  // Add final chunk
  if (currentChunk.text.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// Format timestamp for display
export function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
