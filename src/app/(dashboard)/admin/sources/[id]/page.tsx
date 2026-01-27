import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Edit, Trash2, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSource } from "@/server/actions/sources";
import { RunSourceButton } from "@/components/features/sources/run-source-button";
import { DeleteSourceButton } from "@/components/features/sources/delete-source-button";
import { formatDistanceToNow, format } from "date-fns";

interface SourceDetailPageProps {
  params: Promise<{ id: string }>;
}

const STATUS_COLORS: Record<string, string> = {
  QUEUED: "text-blue-600",
  RUNNING: "text-yellow-600",
  SUCCEEDED: "text-green-600",
  FAILED: "text-red-600",
  SKIPPED: "text-gray-600",
};

const STATUS_ICONS: Record<string, typeof Clock> = {
  QUEUED: Clock,
  RUNNING: Clock,
  SUCCEEDED: CheckCircle,
  FAILED: XCircle,
  SKIPPED: AlertCircle,
};

export default async function SourceDetailPage({ params }: SourceDetailPageProps) {
  const { id } = await params;

  let source;
  try {
    source = await getSource(id);
  } catch {
    notFound();
  }

  const config = source.config as Record<string, unknown>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/sources">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{source.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline">{source.type.replace(/_/g, " ")}</Badge>
              <Badge variant="outline">{source.sport}</Badge>
              <Badge
                variant={source.status === "ACTIVE" ? "default" : "destructive"}
              >
                {source.status}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RunSourceButton sourceId={source.id} variant="outline" />
          <Button variant="outline" asChild>
            <Link href={`/admin/sources/${source.id}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </Button>
          <DeleteSourceButton sourceId={source.id} sourceName={source.name} />
        </div>
      </div>

      {/* Error Banner */}
      {source.status === "ERROR" && source.lastErrorMessage && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-red-900">Last Error</h3>
                <p className="text-sm text-red-700 mt-1">
                  {source.lastErrorMessage}
                </p>
                {source.lastErrorAt && (
                  <p className="text-xs text-red-500 mt-1">
                    {formatDistanceToNow(source.lastErrorAt, { addSuffix: true })}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(config).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="text-sm text-muted-foreground">{key}</span>
                <span className="text-sm font-mono">
                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Schedule */}
        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Automatic</span>
              <span className="text-sm">{source.isScheduled ? "Yes" : "No"}</span>
            </div>
            {source.isScheduled && (
              <>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Frequency</span>
                  <span className="text-sm">
                    {source.scheduleType === "HOURLY"
                      ? `Every ${source.refreshInterval} minutes`
                      : source.scheduleType}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Timezone</span>
                  <span className="text-sm">{source.scheduleTimezone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Next Fetch</span>
                  <span className="text-sm">
                    {source.nextFetchAt
                      ? formatDistanceToNow(source.nextFetchAt, { addSuffix: true })
                      : "Not scheduled"}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Statistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total Fetches</span>
              <span className="text-sm font-medium">{source.fetchCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Error Count</span>
              <span className="text-sm font-medium text-red-600">{source.errorCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">News Items</span>
              <span className="text-sm font-medium">{source._count.newsItems}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Last Success</span>
              <span className="text-sm">
                {source.lastSuccessAt
                  ? formatDistanceToNow(source.lastSuccessAt, { addSuffix: true })
                  : "Never"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Timestamps */}
        <Card>
          <CardHeader>
            <CardTitle>Timestamps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Created</span>
              <span className="text-sm">
                {format(source.createdAt, "PPp")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Updated</span>
              <span className="text-sm">
                {format(source.updatedAt, "PPp")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Last Fetch</span>
              <span className="text-sm">
                {source.lastFetchAt
                  ? format(source.lastFetchAt, "PPp")
                  : "Never"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fetch History */}
      <Card>
        <CardHeader>
          <CardTitle>Fetch History</CardTitle>
          <CardDescription>Recent fetch attempts</CardDescription>
        </CardHeader>
        <CardContent>
          {source.fetchRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No fetch history yet. Click "Run" to fetch data from this source.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Triggered By</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>New</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {source.fetchRuns.map((run) => {
                  const StatusIcon = STATUS_ICONS[run.status] || Clock;
                  const duration = run.finishedAt
                    ? Math.round(
                        (new Date(run.finishedAt).getTime() -
                          new Date(run.startedAt).getTime()) /
                          1000
                      )
                    : null;

                  return (
                    <TableRow key={run.id}>
                      <TableCell>
                        <div className={`flex items-center gap-2 ${STATUS_COLORS[run.status]}`}>
                          <StatusIcon className="h-4 w-4" />
                          <span className="text-sm">{run.status}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {run.triggeredBy}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(run.startedAt, { addSuffix: true })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {duration !== null ? `${duration}s` : "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{run.itemsFetched}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-green-600">{run.newItems}</span>
                      </TableCell>
                      <TableCell>
                        {run.errorMessage && (
                          <span
                            className="text-sm text-red-600 truncate max-w-[200px] block"
                            title={run.errorMessage}
                          >
                            {run.errorMessage}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
