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
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Video,
  FileText,
  TrendingUp,
} from "lucide-react";

async function getRun(orgId: string, runId: string) {
  return prisma.queryRun.findFirst({
    where: {
      id: runId,
      orgId,
    },
    include: {
      queryDefinition: {
        select: { id: true, name: true, sport: true, keywords: true },
      },
      triggeredByUser: {
        select: { name: true, email: true },
      },
    },
  });
}

async function getCandidates(orgId: string, runId: string) {
  return prisma.candidate.findMany({
    where: {
      orgId,
      queryRunId: runId,
      deletedAt: null,
    },
    include: {
      video: {
        select: {
          youtubeVideoId: true,
          title: true,
          channelTitle: true,
          thumbnailUrl: true,
          durationSeconds: true,
        },
      },
      moments: {
        orderBy: { startSeconds: "asc" },
        take: 3,
      },
    },
    orderBy: { relevanceScore: "desc" },
    take: 100,
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "N/A";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "SUCCEEDED":
      return <CheckCircle2 className="h-6 w-6 text-green-500" />;
    case "FAILED":
      return <XCircle className="h-6 w-6 text-destructive" />;
    case "RUNNING":
      return <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />;
    default:
      return <Clock className="h-6 w-6 text-muted-foreground" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    NEW: "outline",
    SHORTLISTED: "default",
    DISMISSED: "secondary",
    EXPORTED: "default",
  };

  return (
    <Badge variant={variants[status] || "outline"} className="text-xs">
      {status}
    </Badge>
  );
}

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await getTenantContext();


  const run = await getRun(orgId, id);

  if (!run) {
    notFound();
  }

  const candidates = await getCandidates(orgId, id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/runs">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <StatusIcon status={run.status} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">
              Run: {run.queryDefinition.name}
            </h1>
            <Badge variant="outline">{run.queryDefinition.sport}</Badge>
          </div>
          <p className="text-muted-foreground">
            {run.triggeredBy} run
            {run.triggeredByUser && ` by ${run.triggeredByUser.name}`}
            {" • "}
            {formatDate(run.createdAt)}
          </p>
        </div>
        <Link href={`/queries/${run.queryDefinition.id}`}>
          <Button variant="outline">View Query</Button>
        </Link>
      </div>

      {/* Progress (if running) */}
      {run.status === "RUNNING" && (
        <Card>
          <CardContent className="py-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {run.progressMessage || "Processing..."}
              </span>
              <span>{run.progress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-3">
              <div
                className="bg-primary h-3 rounded-full transition-all"
                style={{ width: `${run.progress}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error (if failed) */}
      {run.status === "FAILED" && run.errorMessage && (
        <Card className="border-destructive">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Run Failed</p>
                <p className="text-sm text-muted-foreground">{run.errorMessage}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Video className="h-4 w-4" />
              Videos Fetched
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{run.videosFetched}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Transcripts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{run.transcriptsFetched}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Play className="h-4 w-4" />
              Videos Processed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{run.videosProcessed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Candidates Found
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{run.candidatesProduced}</div>
          </CardContent>
        </Card>
      </div>

      {/* Candidates */}
      <Card>
        <CardHeader>
          <CardTitle>Top Candidates</CardTitle>
          <CardDescription>
            {candidates.length} candidates ranked by relevance score
          </CardDescription>
        </CardHeader>
        <CardContent>
          {candidates.length > 0 ? (
            <div className="space-y-4">
              {candidates.map((candidate, index) => (
                <div
                  key={candidate.id}
                  className="flex items-start gap-4 border-b pb-4 last:border-0 last:pb-0"
                >
                  <div className="text-2xl font-bold text-muted-foreground w-8">
                    #{index + 1}
                  </div>
                  {candidate.video.thumbnailUrl && (
                    <img
                      src={candidate.video.thumbnailUrl}
                      alt={candidate.video.title}
                      className="w-32 h-20 object-cover rounded"
                    />
                  )}
                  <div className="flex-1 space-y-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium line-clamp-1">
                          {candidate.video.title}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {candidate.video.channelTitle}
                          {candidate.video.durationSeconds &&
                            ` • ${formatDuration(candidate.video.durationSeconds)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={candidate.status} />
                        <div className="text-right">
                          <p className="font-semibold">
                            {Math.round(candidate.relevanceScore * 100)}%
                          </p>
                          <p className="text-xs text-muted-foreground">score</p>
                        </div>
                      </div>
                    </div>
                    {candidate.aiSummary && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {candidate.aiSummary}
                      </p>
                    )}
                    {candidate.moments.length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {candidate.moments.map((moment) => (
                          <Badge key={moment.id} variant="secondary" className="text-xs">
                            {formatDuration(moment.startSeconds)} - {moment.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Link href={`/candidates/${candidate.id}`}>
                    <Button variant="outline" size="sm">
                      View
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No candidates found yet</p>
              {run.status === "RUNNING" && (
                <p className="text-sm">Check back when the run completes</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
