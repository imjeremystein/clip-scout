import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import redis from "@/lib/redis";
import { QUEUE_NAMES, QueryRunJobData } from "@/lib/queue";
import { searchVideos, upsertYouTubeVideo } from "@/lib/youtube";
import {
  fetchTranscript,
  saveTranscript,
} from "@/server/services/transcript.service";
import {
  analyzeVideo,
  analyzeVideoMetadataOnly,
  rankCandidates,
  saveAnalysisResults,
  AnalysisConfig,
  AnalyzedVideo,
} from "@/server/services/analysis.service";
import { analyzeYouTubeVideo, isGeminiConfigured } from "@/lib/gemini";

// Analysis configuration
const ANALYSIS_CONFIG: AnalysisConfig = {
  useAI: process.env.ANTHROPIC_API_KEY ? true : false,
  useEmbeddings: process.env.OPENAI_API_KEY ? true : false,
  maxMoments: 5,
  minRelevanceScore: 0.3,
};

// Check if we should use Gemini for analysis
const USE_GEMINI = isGeminiConfigured();

// Process a query run job
async function processQueryRun(job: Job<QueryRunJobData>) {
  const { queryRunId, queryDefinitionId, orgId } = job.data;

  console.log(`[QueryRun] Starting job ${job.id} for query ${queryDefinitionId}`);

  try {
    // Update status to running
    await prisma.queryRun.update({
      where: { id: queryRunId },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        progress: 0,
        progressMessage: "Starting query run...",
      },
    });

    // Get query definition
    const queryDef = await prisma.queryDefinition.findUnique({
      where: { id: queryDefinitionId },
    });

    if (!queryDef) {
      throw new Error("Query definition not found");
    }

    // Cast JSON fields
    const keywords = queryDef.keywords as string[];
    const channelIds = queryDef.channelIds as string[];

    await job.updateProgress(5);
    await updateRunProgress(queryRunId, 5, "Searching YouTube...");

    // Step 1: Search YouTube
    const searchOptions = {
      keywords,
      sport: queryDef.sport,
      maxResults: Math.min(queryDef.maxResults, 50), // API limit per request
      publishedAfter: new Date(
        Date.now() - queryDef.recencyDays * 24 * 60 * 60 * 1000
      ),
      channelIds: channelIds.length > 0 ? channelIds : undefined,
    };

    const videos = await searchVideos(orgId, searchOptions);

    await prisma.queryRun.update({
      where: { id: queryRunId },
      data: { videosFetched: videos.length },
    });

    await job.updateProgress(15);
    await updateRunProgress(
      queryRunId,
      15,
      `Found ${videos.length} videos, fetching transcripts...`
    );

    // Step 2: Save videos and optionally fetch transcripts
    let transcriptsFetched = 0;
    const savedVideos: Array<{
      videoDbId: string;
      transcriptId: string | null;
      youtubeVideoId: string;
      videoData: typeof videos[0];
    }> = [];

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];

      try {
        // Save video to database
        const dbVideo = await upsertYouTubeVideo(orgId, video);

        let transcriptId: string | null = null;

        // Try to fetch transcript (but don't fail if unavailable)
        try {
          const transcript = await fetchTranscript(video.videoId);
          if (transcript) {
            const savedTranscript = await saveTranscript(
              orgId,
              dbVideo.id,
              transcript
            );
            transcriptId = savedTranscript.id;
            transcriptsFetched++;
          }
        } catch (transcriptError) {
          console.log(`[QueryRun] Transcript unavailable for ${video.videoId}`);
        }

        // Always add the video for processing (with or without transcript)
        savedVideos.push({
          videoDbId: dbVideo.id,
          transcriptId,
          youtubeVideoId: video.videoId,
          videoData: video,
        });

        // Update progress (15-45%)
        const progressPercent = 15 + Math.floor((i / videos.length) * 30);
        if (i % 5 === 0 || i === videos.length - 1) {
          await job.updateProgress(progressPercent);
          await updateRunProgress(
            queryRunId,
            progressPercent,
            `Processing ${i + 1}/${videos.length} videos...`
          );
        }
      } catch (error) {
        console.error(
          `[QueryRun] Error processing video ${video.videoId}:`,
          error
        );
      }
    }

    await prisma.queryRun.update({
      where: { id: queryRunId },
      data: { transcriptsFetched },
    });

    await job.updateProgress(45);
    await updateRunProgress(
      queryRunId,
      45,
      `Scoring ${savedVideos.length} videos...`
    );

    // Step 3: Analyze and score videos
    const analyzedVideos: AnalyzedVideo[] = [];
    let geminiAnalyzed = 0;

    for (let i = 0; i < savedVideos.length; i++) {
      const { videoDbId, transcriptId, youtubeVideoId, videoData } = savedVideos[i];

      try {
        let analysis: AnalyzedVideo | null = null;

        // Try Gemini first if configured (it provides transcript + analysis)
        if (USE_GEMINI && !transcriptId) {
          try {
            const geminiResult = await analyzeYouTubeVideo(
              youtubeVideoId,
              keywords,
              queryDef.sport
            );

            if (geminiResult && geminiResult.transcript) {
              // Save the transcript from Gemini
              const savedTranscript = await saveTranscript(
                orgId,
                videoDbId,
                {
                  segments: geminiResult.segments.map(s => ({
                    text: s.text,
                    start: s.startSeconds,
                    duration: s.endSeconds - s.startSeconds,
                  })),
                  fullText: geminiResult.transcript,
                  source: "THIRD_PARTY" as const,
                }
              );
              transcriptsFetched++;
              geminiAnalyzed++;

              // Create analysis from Gemini result
              analysis = {
                videoId: videoDbId,
                relevanceScore: 0.7, // Base score for Gemini-analyzed videos
                scoreBreakdown: { gemini: 1 },
                summary: geminiResult.summary,
                whyRelevant: `Analyzed by AI. Mentions: ${geminiResult.entities.topics.join(", ") || "sports content"}`,
                moments: geminiResult.keyMoments.map(m => ({
                  startSeconds: m.startSeconds,
                  endSeconds: m.endSeconds,
                  label: m.label,
                  description: m.description,
                  confidence: 0.8,
                })),
                entities: {
                  people: geminiResult.entities.people || [],
                  teams: geminiResult.entities.teams || [],
                  events: [],
                  topics: geminiResult.entities.topics || [],
                },
              };
            }
          } catch (geminiError) {
            console.log(`[QueryRun] Gemini analysis failed for ${youtubeVideoId}:`, geminiError);
          }
        }

        // Fall back to existing analysis methods
        if (!analysis) {
          if (transcriptId) {
            // Full analysis with transcript
            analysis = await analyzeVideo(
              videoDbId,
              transcriptId,
              keywords,
              queryDef.sport,
              ANALYSIS_CONFIG
            );
          } else {
            // Basic analysis without transcript (based on metadata only)
            analysis = await analyzeVideoMetadataOnly(
              videoDbId,
              videoData,
              keywords,
              queryDef.sport
            );
          }
        }

        if (analysis) {
          analyzedVideos.push(analysis);
        }

        // Update progress (45-85%)
        const progressPercent =
          45 + Math.floor((i / savedVideos.length) * 40);
        if (i % 3 === 0 || i === savedVideos.length - 1) {
          await job.updateProgress(progressPercent);
          await updateRunProgress(
            queryRunId,
            progressPercent,
            `Analyzed ${i + 1}/${savedVideos.length} videos (${geminiAnalyzed} with AI, ${analyzedVideos.length} candidates)...`
          );
        }
      } catch (error) {
        console.error(`[QueryRun] Error analyzing video ${videoDbId}:`, error);
      }
    }

    // Update transcript count
    await prisma.queryRun.update({
      where: { id: queryRunId },
      data: { transcriptsFetched },
    });

    await prisma.queryRun.update({
      where: { id: queryRunId },
      data: { videosProcessed: savedVideos.length },
    });

    await job.updateProgress(85);
    await updateRunProgress(queryRunId, 85, "Ranking candidates...");

    // Step 4: Rank and save top candidates
    const topCandidates = rankCandidates(analyzedVideos, 100);

    await job.updateProgress(90);
    await updateRunProgress(
      queryRunId,
      90,
      `Saving ${topCandidates.length} candidates...`
    );

    // Save candidates to database
    for (const candidate of topCandidates) {
      try {
        await saveAnalysisResults(
          orgId,
          queryRunId,
          queryDefinitionId,
          candidate
        );
      } catch (error) {
        console.error(
          `[QueryRun] Error saving candidate ${candidate.videoId}:`,
          error
        );
      }
    }

    // Update final stats
    await prisma.queryRun.update({
      where: { id: queryRunId },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        progress: 100,
        progressMessage: "Completed",
        candidatesProduced: topCandidates.length,
      },
    });

    await job.updateProgress(100);
    console.log(
      `[QueryRun] Job ${job.id} completed with ${topCandidates.length} candidates`
    );
  } catch (error) {
    console.error(`[QueryRun] Job ${job.id} failed:`, error);

    await prisma.queryRun.update({
      where: { id: queryRunId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });

    throw error;
  }
}

// Update run progress in database
async function updateRunProgress(
  runId: string,
  progress: number,
  message: string
) {
  await prisma.queryRun.update({
    where: { id: runId },
    data: {
      progress,
      progressMessage: message,
    },
  });
}

// Create the query run worker
export function createQueryRunWorker() {
  const worker = new Worker<QueryRunJobData>(
    QUEUE_NAMES.QUERY_RUN,
    processQueryRun,
    {
      connection: redis,
      concurrency: 2, // Process up to 2 runs concurrently
    }
  );

  worker.on("completed", (job) => {
    console.log(`[QueryRun] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[QueryRun] Job ${job?.id} failed:`, err);
  });

  return worker;
}
