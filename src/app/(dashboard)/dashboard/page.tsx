import Link from "next/link";
import { getTenantContext } from "@/lib/tenant-prisma";
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
  Plus,
  Play,
  Clock,
  TrendingUp,
  Calendar,
  ArrowRight,
  Star,
} from "lucide-react";
import {
  getDashboardStats,
  getRecentRuns,
  getTopCandidatesToday,
  getScheduledRuns,
} from "@/server/db/dashboard";
import type { RecentRun, TopCandidate, ScheduledRun } from "@/types";

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    SUCCEEDED: "default",
    RUNNING: "secondary",
    FAILED: "destructive",
    QUEUED: "outline",
  };

  return (
    <Badge variant={variants[status] || "outline"} className="text-xs">
      {status}
    </Badge>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function formatScheduledTime(date: Date | null): string {
  if (!date) return "Not scheduled";

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (isToday) return `Today at ${timeStr}`;
  if (isTomorrow) return `Tomorrow at ${timeStr}`;
  if (date < nextWeek) {
    return `${date.toLocaleDateString([], { weekday: "long" })} at ${timeStr}`;
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) + ` at ${timeStr}`;
}

export default async function DashboardPage() {
  // Get default org for internal tool
  const { orgId } = await getTenantContext();

  // Fetch all dashboard data in parallel
  const [stats, recentRuns, topCandidates, scheduledRuns] = await Promise.all([
    getDashboardStats(orgId),
    getRecentRuns(orgId, 5),
    getTopCandidatesToday(orgId, 5),
    getScheduledRuns(orgId, 5),
  ]);

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            Welcome to Clip Scout
          </h1>
          <p className="text-muted-foreground">
            Here&apos;s what&apos;s happening with your clip discovery.
          </p>
        </div>
        <Link href="/queries/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Query
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Queries</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalQueries}</div>
            <p className="text-xs text-muted-foreground">Saved query definitions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Runs Today</CardTitle>
            <Play className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.runsToday}</div>
            <p className="text-xs text-muted-foreground">Query executions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Candidates Found
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.candidatesFound}</div>
            <p className="text-xs text-muted-foreground">Total discovered clips</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Shortlisted</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.shortlisted}</div>
            <p className="text-xs text-muted-foreground">Ready for export</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Runs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Runs</CardTitle>
              <Link href="/runs">
                <Button variant="ghost" size="sm">
                  View all
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
            <CardDescription>Your latest query executions</CardDescription>
          </CardHeader>
          <CardContent>
            {recentRuns.length > 0 ? (
              <div className="space-y-4">
                {recentRuns.map((run: RecentRun) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{run.queryName}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(run.createdAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {run.candidatesFound > 0 && (
                        <span className="text-sm text-muted-foreground">
                          {run.candidatesFound} candidates
                        </span>
                      )}
                      <StatusBadge status={run.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Play className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No runs yet</p>
                <Link href="/queries/new">
                  <Button variant="link" size="sm">
                    Create your first query
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Next Scheduled Runs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Scheduled Runs</CardTitle>
              <Link href="/queries">
                <Button variant="ghost" size="sm">
                  Manage
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
            <CardDescription>Upcoming automatic query runs</CardDescription>
          </CardHeader>
          <CardContent>
            {scheduledRuns.length > 0 ? (
              <div className="space-y-4">
                {scheduledRuns.map((run: ScheduledRun) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{run.queryName}</p>
                      <Badge variant="outline" className="text-xs">
                        {run.scheduleType}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {formatScheduledTime(run.nextRunAt)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No scheduled runs</p>
                <Link href="/queries/new">
                  <Button variant="link" size="sm">
                    Create a scheduled query
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Candidates Today */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Top Candidates Today</CardTitle>
            <Link href="/candidates">
              <Button variant="ghost" size="sm">
                View all
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <CardDescription>
            Highest relevance candidates from today&apos;s runs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topCandidates.length > 0 ? (
            <div className="space-y-4">
              {topCandidates.map((candidate: TopCandidate) => (
                <div
                  key={candidate.id}
                  className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                >
                  <div className="space-y-1 flex-1">
                    <p className="text-sm font-medium line-clamp-1">
                      {candidate.title}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{candidate.channelName}</span>
                      <span>•</span>
                      <Badge variant="outline" className="text-xs">
                        {candidate.sport}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {Math.round(candidate.score * 100)}%
                      </p>
                      <p className="text-xs text-muted-foreground">relevance</p>
                    </div>
                    <Link href={`/candidates/${candidate.id}`}>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No candidates found today</p>
              <p className="text-xs mt-1">Run a query to discover new clips</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
