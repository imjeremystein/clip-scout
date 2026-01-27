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
  Plus,
  Play,
  Calendar,
  Clock,
  MoreHorizontal,
  Settings,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RunNowButton } from "@/components/features/queries/run-now-button";

async function getQueries(orgId: string) {
  return prisma.queryDefinition.findMany({
    where: {
      orgId,
      deletedAt: null,
    },
    include: {
      _count: {
        select: { queryRuns: true },
      },
      queryRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          createdAt: true,
          candidatesProduced: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatNextRun(date: Date | null): string {
  if (!date) return "Not scheduled";

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (isToday) return `Today at ${timeStr}`;
  if (isTomorrow) return `Tomorrow at ${timeStr}`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) + ` at ${timeStr}`;
}

export default async function QueriesPage() {
  const { orgId } = await getTenantContext();


  const queries = await getQueries(orgId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Queries</h1>
          <p className="text-muted-foreground">
            Manage your saved search queries
          </p>
        </div>
        <Link href="/queries/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Query
          </Button>
        </Link>
      </div>

      {/* Query List */}
      {queries.length > 0 ? (
        <div className="grid gap-4">
          {queries.map((query) => {
            const lastRun = query.queryRuns[0];
            return (
              <Card key={query.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        <Link
                          href={`/queries/${query.id}`}
                          className="hover:underline"
                        >
                          {query.name}
                        </Link>
                        <Badge variant="outline">{query.sport}</Badge>
                        {!query.isActive && (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {query.description ||
                          `Searching for: ${(query.keywords as string[]).slice(0, 3).join(", ")}${(query.keywords as string[]).length > 3 ? "..." : ""}`}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <RunNowButton queryId={query.id} queryName={query.name} />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/queries/${query.id}/edit`}>
                              <Settings className="mr-2 h-4 w-4" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-6 text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Play className="h-4 w-4" />
                        <span>{query._count.queryRuns} runs</span>
                      </div>
                      {lastRun && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          <span>
                            Last run {formatRelativeTime(lastRun.createdAt)}
                            {lastRun.candidatesProduced > 0 &&
                              ` (${lastRun.candidatesProduced} found)`}
                          </span>
                        </div>
                      )}
                    </div>
                    {query.isScheduled && query.nextRunAt && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>Next: {formatNextRun(query.nextRunAt)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Play className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No queries yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first query to start discovering relevant clips.
            </p>
            <Link href="/queries/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Query
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
