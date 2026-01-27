import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/tenant-prisma";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Star,
  Clock,
  Eye,
  ThumbsUp,
  Calendar,
  ExternalLink,
  Play,
} from "lucide-react";
import { CandidateStatusButton } from "@/components/features/candidates/candidate-status-button";
import { TranscriptViewer } from "@/components/features/candidates/transcript-viewer";
import { VideoPlayer } from "@/components/features/candidates/video-player";
import { LoggerButton } from "@/components/features/logger/logger-button";

async function getCandidate(orgId: string, candidateId: string) {
  return prisma.candidate.findFirst({
    where: {
      id: candidateId,
      orgId,
      deletedAt: null,
    },
    include: {
      video: true,
      queryDefinition: {
        select: { name: true, sport: true, keywords: true },
      },
      queryRun: {
        select: { id: true, createdAt: true },
      },
      moments: {
        orderBy: { startSeconds: "asc" },
      },
      logEntries: {
        include: {
          createdByUser: {
            select: { name: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });
}

async function getTranscript(videoId: string) {
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

function formatDate(date: Date): string {
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatNumber(num: number | null): string {
  if (!num) return "N/A";
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "N/A";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await getTenantContext();

  const candidate = await getCandidate(orgId, id);

  if (!candidate) {
    notFound();
  }

  const transcript = await getTranscript(candidate.video.id);

  const entities = candidate.entitiesJson as {
    people?: string[];
    teams?: string[];
    events?: string[];
    topics?: string[];
  } | null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/candidates">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold line-clamp-1">
              {candidate.video.title}
            </h1>
            <Badge variant="outline">{candidate.queryDefinition.sport}</Badge>
          </div>
          <p className="text-muted-foreground">
            {candidate.video.channelTitle} • Found via &quot;
            {candidate.queryDefinition.name}&quot;
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right mr-4">
            <p className="text-3xl font-bold">
              {Math.round(candidate.relevanceScore * 100)}%
            </p>
            <p className="text-xs text-muted-foreground">relevance score</p>
          </div>
          <CandidateStatusButton
            candidateId={candidate.id}
            currentStatus={candidate.status}
            targetStatus="SHORTLISTED"
          />
          <CandidateStatusButton
            candidateId={candidate.id}
            currentStatus={candidate.status}
            targetStatus="DISMISSED"
          />
          <LoggerButton
            candidateId={candidate.id}
            candidateTitle={candidate.video.title}
            defaultSport={candidate.queryDefinition.sport as any}
            variant="outline"
          />
          <a
            href={`https://www.youtube.com/watch?v=${candidate.video.youtubeVideoId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline">
              <ExternalLink className="mr-2 h-4 w-4" />
              YouTube
            </Button>
          </a>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Video Player */}
          <Card>
            <CardContent className="p-0">
              <VideoPlayer
                videoId={candidate.video.youtubeVideoId}
                moments={candidate.moments}
              />
            </CardContent>
          </Card>

          {/* Key Moments */}
          {candidate.moments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5" />
                  Key Moments
                </CardTitle>
                <CardDescription>
                  AI-identified highlights and talking points
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {candidate.moments.map((moment, index) => (
                    <div
                      key={moment.id}
                      className="flex gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex-shrink-0 w-20 text-center">
                        <p className="font-mono text-sm font-medium">
                          {formatDuration(moment.startSeconds)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          to {formatDuration(moment.endSeconds)}
                        </p>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{moment.label}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {Math.round(moment.confidence * 100)}% confidence
                          </span>
                        </div>
                        {moment.supportingQuote && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            &quot;{moment.supportingQuote}&quot;
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Transcript */}
          <Card>
            <CardHeader>
              <CardTitle>Transcript</CardTitle>
              <CardDescription>
                Full video transcript with keyword highlighting
              </CardDescription>
            </CardHeader>
            <CardContent>
              {transcript ? (
                <TranscriptViewer
                  segments={transcript.segments}
                  keywords={candidate.queryDefinition.keywords as string[]}
                  moments={candidate.moments}
                />
              ) : (
                <p className="text-muted-foreground">
                  Transcript not available
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Video Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Video Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <span>{formatNumber(candidate.video.viewCount)} views</span>
              </div>
              <div className="flex items-center gap-3">
                <ThumbsUp className="h-4 w-4 text-muted-foreground" />
                <span>{formatNumber(candidate.video.likeCount)} likes</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>
                  {formatDuration(candidate.video.durationSeconds)} duration
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Published {formatDate(candidate.video.publishedAt)}</span>
              </div>
            </CardContent>
          </Card>

          {/* AI Insights */}
          <Card>
            <CardHeader>
              <CardTitle>AI Insights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {candidate.aiSummary && (
                <div>
                  <p className="text-sm font-medium mb-1">Summary</p>
                  <p className="text-sm text-muted-foreground">
                    {candidate.aiSummary}
                  </p>
                </div>
              )}
              {candidate.whyRelevant && (
                <div>
                  <p className="text-sm font-medium mb-1">Why Relevant</p>
                  <p className="text-sm text-muted-foreground">
                    {candidate.whyRelevant}
                  </p>
                </div>
              )}
              {entities && (
                <div>
                  <p className="text-sm font-medium mb-2">Entities</p>
                  <div className="flex flex-wrap gap-1">
                    {entities.people?.map((person) => (
                      <Badge key={person} variant="secondary" className="text-xs">
                        {person}
                      </Badge>
                    ))}
                    {entities.teams?.map((team) => (
                      <Badge key={team} variant="outline" className="text-xs">
                        {team}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity Log */}
          {candidate.logEntries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {candidate.logEntries.map((entry) => (
                    <div key={entry.id} className="text-sm">
                      <p className="font-medium">
                        {entry.createdByUser?.name || "User"}
                      </p>
                      {entry.title && (
                        <p className="font-medium text-xs">{entry.title}</p>
                      )}
                      <p className="text-muted-foreground">{entry.note}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(entry.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
