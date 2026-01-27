import Link from "next/link";

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
  Clock,
  Play,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  ListFilter,
} from "lucide-react";

async function getRuns(orgId: string, queryId?: string) {
  return prisma.queryRun.findMany({
    where: {
      orgId,
      ...(queryId && { queryDefinitionId: queryId }),
    },
    include: {
      queryDefinition: {
        select: { id: true, name: true, sport: true },
      },
      triggeredByUser: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(start: Date, end: Date | null): string {
  if (!end) return "In progress";
  const diffMs = end.getTime() - start.getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "SUCCEEDED":
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case "FAILED":
      return <XCircle className="h-5 w-5 text-destructive" />;
    case "RUNNING":
      return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
    default:
      return <Clock className="h-5 w-5 text-muted-foreground" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    SUCCEEDED: "default",
    RUNNING: "secondary",
    FAILED: "destructive",
    QUEUED: "outline",
  };

  return (
    <Badge variant={variants[status] || "outline"}>
      {status}
    </Badge>
  );
}

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string }>;
}) {
  const { query: queryId } = await searchParams;
  const { orgId } = await getTenantContext();


  const runs = await getRuns(orgId, queryId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Query Runs</h1>
          <p className="text-muted-foreground">
            History of all query executions
          </p>
        </div>
        {queryId && (
          <Link href="/runs">
            <Button variant="outline">
              <ListFilter className="mr-2 h-4 w-4" />
              Show All Runs
            </Button>
          </Link>
        )}
      </div>

      {/* Runs List */}
      {runs.length > 0 ? (
        <div className="space-y-4">
          {runs.map((run) => (
            <Card key={run.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <StatusIcon status={run.status} />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/queries/${run.queryDefinition.id}`}
                          className="font-medium hover:underline"
                        >
                          {run.queryDefinition.name}
                        </Link>
                        <Badge variant="outline">{run.queryDefinition.sport}</Badge>
                        <StatusBadge status={run.status} />
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(run.createdAt)}
                        </span>
                        <span>
                          Duration: {formatDuration(run.createdAt, run.finishedAt)}
                        </span>
                        <span>
                          Triggered: {run.triggeredBy}
                          {run.triggeredByUser && ` by ${run.triggeredByUser.name}`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-lg font-semibold">
                        {run.candidatesProduced}
                      </p>
                      <p className="text-xs text-muted-foreground">candidates</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold">
                        {run.videosProcessed}
                      </p>
                      <p className="text-xs text-muted-foreground">videos</p>
                    </div>
                    <Link href={`/runs/${run.id}`}>
                      <Button variant="outline" size="sm">
                        View
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
                {run.status === "RUNNING" && run.progress !== null && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span>{run.progressMessage || "Processing..."}</span>
                      <span>{run.progress}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${run.progress}%` }}
                      />
                    </div>
                  </div>
                )}
                {run.status === "FAILED" && run.errorMessage && (
                  <div className="mt-4 p-3 bg-destructive/10 rounded-md">
                    <p className="text-sm text-destructive">{run.errorMessage}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Play className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No runs yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Run a query to start discovering relevant clips.
            </p>
            <Link href="/queries">
              <Button>Go to Queries</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
