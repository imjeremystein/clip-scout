import Link from "next/link";
import { Plus, Rss, Globe, Trophy, DollarSign, AlertCircle, Clock, Pause, Play } from "lucide-react";
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
import { getSources, getSourceHealthStats } from "@/server/actions/sources";
import { RunSourceButton } from "@/components/features/sources/run-source-button";
import { formatDistanceToNow } from "date-fns";

const SOURCE_TYPE_ICONS: Record<string, typeof Rss> = {
  RSS_FEED: Rss,
  WEBSITE_SCRAPE: Globe,
  ESPN_API: Trophy,
  DRAFTKINGS_API: DollarSign,
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-500",
  PAUSED: "bg-yellow-500",
  ERROR: "bg-red-500",
  RATE_LIMITED: "bg-orange-500",
};

export default async function SourcesPage() {
  const [sources, healthStats] = await Promise.all([
    getSources(),
    getSourceHealthStats(),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">News Sources</h1>
          <p className="text-muted-foreground">
            Configure and manage news ingestion sources
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/sources/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Source
          </Link>
        </Button>
      </div>

      {/* Health Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{healthStats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {healthStats.active}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Success Rate (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{healthStats.successRate}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Errors / Rate Limited
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {healthStats.error} / {healthStats.rateLimited}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sources Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Sources</CardTitle>
          <CardDescription>
            Manage your news and odds data sources
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <div className="text-center py-12">
              <Rss className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No sources yet</h3>
              <p className="text-muted-foreground">
                Add your first news source to start ingesting content.
              </p>
              <Button asChild className="mt-4">
                <Link href="/admin/sources/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Source
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Sport</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Last Fetch</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((source) => {
                  const Icon = SOURCE_TYPE_ICONS[source.type] || Rss;
                  return (
                    <TableRow key={source.id}>
                      <TableCell>
                        <Link
                          href={`/admin/sources/${source.id}`}
                          className="font-medium hover:underline"
                        >
                          {source.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            {source.type.replace(/_/g, " ")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{source.sport}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-2 w-2 rounded-full ${STATUS_COLORS[source.status]}`}
                          />
                          <span className="text-sm">{source.status}</span>
                          {source.status === "ERROR" && source.lastErrorMessage && (
                            <span title={source.lastErrorMessage}>
                              <AlertCircle className="h-4 w-4 text-red-500" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {source.isScheduled ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {source.scheduleType === "HOURLY"
                              ? `Every ${source.refreshInterval}m`
                              : source.scheduleType}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Manual</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {source.lastFetchAt ? (
                          <span className="text-sm text-muted-foreground">
                            {formatDistanceToNow(source.lastFetchAt, { addSuffix: true })}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{source._count.newsItems}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <RunSourceButton sourceId={source.id} />
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/admin/sources/${source.id}`}>View</Link>
                          </Button>
                        </div>
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
