import { google, youtube_v3 } from "googleapis";
import { prisma } from "./prisma";

// Sport-specific search query templates
const SPORT_QUERY_TEMPLATES: Record<string, string[]> = {
  NFL: ["NFL", "football", "touchdown", "quarterback"],
  NBA: ["NBA", "basketball", "slam dunk", "three pointer"],
  MLB: ["MLB", "baseball", "home run", "pitcher"],
  NHL: ["NHL", "hockey", "goal", "hat trick"],
  CBB: ["college basketball", "NCAA basketball", "march madness", "final four"],
  CFB: ["college football", "NCAA football", "bowl game", "playoff"],
  SOCCER: ["soccer", "football", "goal", "premier league", "champions league"],
  BOXING: ["boxing", "knockout", "title fight", "heavyweight"],
  SPORTS_BETTING: ["sports betting", "odds", "spread", "moneyline", "over under"],
};

export interface YouTubeSearchOptions {
  keywords: string[];
  sport: string;
  maxResults?: number;
  publishedAfter?: Date;
  channelIds?: string[];
  videoDuration?: "any" | "short" | "medium" | "long";
  order?: "relevance" | "date" | "viewCount" | "rating";
}

export interface YouTubeVideoResult {
  videoId: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: Date;
  thumbnailUrl: string;
  duration?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  hasCaptions?: boolean;
}

// Get YouTube client for an organization
async function getYouTubeClient(orgId: string): Promise<youtube_v3.Youtube> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { youtubeApiKeyEncrypted: true },
  });

  const apiKey = org?.youtubeApiKeyEncrypted || process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error("No YouTube API key configured");
  }

  return google.youtube({
    version: "v3",
    auth: apiKey,
  });
}

// Build search query from keywords and sport
function buildSearchQuery(options: YouTubeSearchOptions): string {
  const sportTerms = SPORT_QUERY_TEMPLATES[options.sport] || [];
  const keywordTerms = options.keywords;

  // Combine sport context with user keywords
  const allTerms = [...new Set([...sportTerms.slice(0, 2), ...keywordTerms])];

  return allTerms.join(" ");
}

// Search for videos
export async function searchVideos(
  orgId: string,
  options: YouTubeSearchOptions
): Promise<YouTubeVideoResult[]> {
  const youtube = await getYouTubeClient(orgId);
  const searchQuery = buildSearchQuery(options);

  const searchParams: youtube_v3.Params$Resource$Search$List = {
    part: ["snippet"],
    q: searchQuery,
    type: ["video"],
    maxResults: Math.min(options.maxResults || 50, 50),
    order: options.order || "relevance",
    videoCaption: "closedCaption", // Only videos with captions
    videoDuration: options.videoDuration || "medium",
    safeSearch: "moderate",
  };

  if (options.publishedAfter) {
    searchParams.publishedAfter = options.publishedAfter.toISOString();
  }

  if (options.channelIds && options.channelIds.length === 1) {
    searchParams.channelId = options.channelIds[0];
  }

  const searchResponse = await youtube.search.list(searchParams);

  if (!searchResponse.data.items?.length) {
    return [];
  }

  // Get video IDs for details fetch
  const videoIds = searchResponse.data.items
    .map((item) => item.id?.videoId)
    .filter((id): id is string => !!id);

  // Fetch detailed video info
  const videosResponse = await youtube.videos.list({
    part: ["snippet", "contentDetails", "statistics"],
    id: videoIds,
  });

  const results: YouTubeVideoResult[] = [];

  for (const video of videosResponse.data.items || []) {
    if (!video.id || !video.snippet) continue;

    results.push({
      videoId: video.id,
      title: video.snippet.title || "",
      description: video.snippet.description || "",
      channelId: video.snippet.channelId || "",
      channelTitle: video.snippet.channelTitle || "",
      publishedAt: new Date(video.snippet.publishedAt || Date.now()),
      thumbnailUrl:
        video.snippet.thumbnails?.high?.url ||
        video.snippet.thumbnails?.default?.url ||
        "",
      duration: video.contentDetails?.duration || undefined,
      viewCount: video.statistics?.viewCount
        ? parseInt(video.statistics.viewCount, 10)
        : undefined,
      likeCount: video.statistics?.likeCount
        ? parseInt(video.statistics.likeCount, 10)
        : undefined,
      commentCount: video.statistics?.commentCount
        ? parseInt(video.statistics.commentCount, 10)
        : undefined,
      hasCaptions: video.contentDetails?.caption === "true",
    });
  }

  return results;
}

// Parse ISO 8601 duration to seconds
export function parseDuration(isoDuration: string): number {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);

  return hours * 3600 + minutes * 60 + seconds;
}

// Get video details by ID
export async function getVideoDetails(
  orgId: string,
  videoId: string
): Promise<YouTubeVideoResult | null> {
  const youtube = await getYouTubeClient(orgId);

  const response = await youtube.videos.list({
    part: ["snippet", "contentDetails", "statistics"],
    id: [videoId],
  });

  const video = response.data.items?.[0];
  if (!video || !video.snippet) return null;

  return {
    videoId: video.id || videoId,
    title: video.snippet.title || "",
    description: video.snippet.description || "",
    channelId: video.snippet.channelId || "",
    channelTitle: video.snippet.channelTitle || "",
    publishedAt: new Date(video.snippet.publishedAt || Date.now()),
    thumbnailUrl:
      video.snippet.thumbnails?.high?.url ||
      video.snippet.thumbnails?.default?.url ||
      "",
    duration: video.contentDetails?.duration || undefined,
    viewCount: video.statistics?.viewCount
      ? parseInt(video.statistics.viewCount, 10)
      : undefined,
    likeCount: video.statistics?.likeCount
      ? parseInt(video.statistics.likeCount, 10)
      : undefined,
    commentCount: video.statistics?.commentCount
      ? parseInt(video.statistics.commentCount, 10)
      : undefined,
    hasCaptions: video.contentDetails?.caption === "true",
  };
}

// Save or update video in database
export async function upsertYouTubeVideo(
  orgId: string,
  videoData: YouTubeVideoResult
) {
  const durationSeconds = videoData.duration
    ? parseDuration(videoData.duration)
    : undefined;

  const updateData = {
    title: videoData.title,
    description: videoData.description,
    channelId: videoData.channelId,
    channelTitle: videoData.channelTitle,
    thumbnailUrl: videoData.thumbnailUrl,
    viewCount: videoData.viewCount,
    likeCount: videoData.likeCount,
    commentCount: videoData.commentCount,
    hasCaptions: videoData.hasCaptions,
    ...(durationSeconds !== undefined && { durationSeconds }),
  };

  return prisma.youTubeVideo.upsert({
    where: {
      orgId_youtubeVideoId: {
        orgId,
        youtubeVideoId: videoData.videoId,
      },
    },
    update: updateData,
    create: {
      orgId,
      youtubeVideoId: videoData.videoId,
      publishedAt: videoData.publishedAt,
      ...updateData,
    },
  });
}

// Get cached video from database
export async function getCachedVideo(orgId: string, youtubeVideoId: string) {
  return prisma.youTubeVideo.findUnique({
    where: {
      orgId_youtubeVideoId: {
        orgId,
        youtubeVideoId,
      },
    },
    include: {
      transcripts: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
}
