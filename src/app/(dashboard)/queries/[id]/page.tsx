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
  Calendar,
  Clock,
  Edit,
  Play,
  TrendingUp,
} from "lucide-react";
import { RunNowButton } from "@/components/features/queries/run-now-button";

async function getQuery(orgId: string, queryId: string) {
  return prisma.queryDefinition.findFirst({
    where: {
      id: queryId,
      orgId,
      deletedAt: null,
    },
    include: {
      createdByUser: {
        select: { name: true, email: true },
      },
      _count: {
        select: { queryRuns: true, candidates: true },
      },
    },
  });
}

async function getRecentRuns(orgId: string, queryId: string, limit = 10) {
  return prisma.queryRun.findMany({
    where: {
      orgId,
      queryDefinitionId: queryId,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
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

export default async function QueryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await getTenantContext();


  const query = await getQuery(orgId, id);

  if (!query) {
    notFound();
  }

  const recentRuns = await getRecentRuns(orgId, id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/queries">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{query.name}</h1>
            <Badge variant="outline">{query.sport}</Badge>
            {!query.isActive && <Badge variant="secondary">Inactive</Badge>}
          </div>
          <p className="text-muted-foreground">
            {query.description || "No description"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RunNowButton queryId={query.id} queryName={query.name} />
          <Link href={`/queries/${query.id}/edit`}>
            <Button variant="outline">
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{query._count.queryRuns}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Candidates Found</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{query._count.candidates}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">
              {query.isScheduled ? query.scheduleType : "Manual"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Next Run</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">
              {query.nextRunAt
                ? formatDate(query.nextRunAt)
                : "Not scheduled"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Query Details */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Search Criteria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Keywords</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {(query.keywords as string[]).map((keyword) => (
                  <Badge key={keyword} variant="secondary">
                    {keyword}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Recency</p>
              <p>Last {query.recencyDays} days</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Max Results</p>
              <p>{query.maxResults} videos per run</p>
            </div>
            {(query.channelIds as string[]).length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Channel Filter</p>
                <p>{(query.channelIds as string[]).length} channels</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Schedule Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>
                {query.isScheduled
                  ? `${query.scheduleType} schedule`
                  : "Manual runs only"}
              </span>
            </div>
            {query.isScheduled && (
              <>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>Timezone: {query.scheduleTimezone}</span>
                </div>
                {query.scheduleCron && (
                  <div>
                    <p className="text-sm text-muted-foreground">Cron: {query.scheduleCron}</p>
                  </div>
                )}
              </>
            )}
            <div className="pt-2 border-t">
              <p className="text-sm text-muted-foreground">
                Created by {query.createdByUser?.name || query.createdByUser?.email} on{" "}
                {formatDate(query.createdAt)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Runs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Runs</CardTitle>
            <Link href={`/runs?query=${query.id}`}>
              <Button variant="ghost" size="sm">
                View all
              </Button>
            </Link>
          </div>
          <CardDescription>History of query executions</CardDescription>
        </CardHeader>
        <CardContent>
          {recentRuns.length > 0 ? (
            <div className="space-y-4">
              {recentRuns.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={run.status} />
                      <span className="text-sm text-muted-foreground">
                        {run.triggeredBy}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDate(run.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {run.candidatesProduced} candidates
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {run.videosProcessed} videos processed
                      </p>
                    </div>
                    <Link href={`/runs/${run.id}`}>
                      <Button variant="outline" size="sm">
                        <TrendingUp className="mr-2 h-4 w-4" />
                        View
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Play className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No runs yet</p>
              <p className="text-sm">Click "Run Now" to execute this query</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
