import Link from "next/link";
import { Newspaper, ExternalLink, Video, Clock, CheckCircle2 } from "lucide-react";
import { stripHtml } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getNewsFeed, getUnmatchedNewsCount, getLastFetchInfo } from "@/server/actions/news";
import { formatDistanceToNow } from "date-fns";
import { NewsFeedFilters } from "@/components/features/news/news-feed-filters";
import { RefreshButton } from "@/components/features/sources/refresh-button";

interface NewsPageProps {
  searchParams: Promise<{
    sport?: string;
    type?: string;
    minScore?: string;
  }>;
}

const TYPE_COLORS: Record<string, string> = {
  BREAKING: "bg-red-100 text-red-800",
  TRADE: "bg-purple-100 text-purple-800",
  INJURY: "bg-orange-100 text-orange-800",
  GAME_RESULT: "bg-green-100 text-green-800",
  BETTING_LINE: "bg-blue-100 text-blue-800",
  RUMOR: "bg-yellow-100 text-yellow-800",
  ANALYSIS: "bg-gray-100 text-gray-800",
  SCHEDULE: "bg-cyan-100 text-cyan-800",
};

export default async function NewsPage({ searchParams }: NewsPageProps) {
  const params = await searchParams;
  const sport = params.sport as "NFL" | "NBA" | "MLB" | "NHL" | "SOCCER" | "BOXING" | "SPORTS_BETTING" | undefined;
  const type = params.type;
  const minScore = params.minScore ? parseInt(params.minScore, 10) : 0;

  const [newsResult, unmatchedCount, fetchInfo] = await Promise.all([
    getNewsFeed({ sport, type, minScore, limit: 50 }),
    getUnmatchedNewsCount(),
    getLastFetchInfo("news"),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">News Feed</h1>
          <p className="text-muted-foreground">
            {newsResult.total} news items
            {unmatchedCount > 0 && (
              <span className="text-orange-600 ml-2">
                ({unmatchedCount} need clip pairing)
              </span>
            )}
          </p>
        </div>
        <RefreshButton
          type="news"
          lastFetchAt={fetchInfo.lastFetchAt}
          nextFetchAt={fetchInfo.nextFetchAt}
          sourceCount={fetchInfo.sourceCount}
        />
      </div>

      {/* Filters */}
      <NewsFeedFilters />

      {/* News Grid */}
      {newsResult.items.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Newspaper className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No news items yet</h3>
            <p className="text-muted-foreground">
              News will appear here once sources start fetching data.
            </p>
            <Button asChild className="mt-4">
              <Link href="/admin/sources">Configure Sources</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {newsResult.items.map((item) => (
            <Card key={item.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={TYPE_COLORS[item.type] || TYPE_COLORS.ANALYSIS}
                    >
                      {item.type}
                    </Badge>
                    {item.clipMatches.length > 0 && (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Clip Matched
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Score: {Math.round(item.importanceScore)}
                  </span>
                </div>
                <CardTitle className="text-base line-clamp-2">
                  <Link
                    href={`/news/${item.id}`}
                    className="hover:underline"
                  >
                    {item.headline}
                  </Link>
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <span>{item.source.name}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(item.publishedAt, { addSuffix: true })}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                {item.content && (
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                    {stripHtml(item.content)}
                  </p>
                )}

                {/* Teams and Players */}
                {((item.teams as string[]).length > 0 ||
                  (item.players as string[]).length > 0) && (
                  <div className="flex flex-wrap gap-1 mb-4">
                    {(item.teams as string[]).slice(0, 3).map((team) => (
                      <Badge key={team} variant="outline" className="text-xs">
                        {team}
                      </Badge>
                    ))}
                    {(item.players as string[]).slice(0, 2).map((player) => (
                      <Badge key={player} variant="outline" className="text-xs">
                        {player}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Clip Matches - show count if multiple */}
                {item.clipMatches.length > 1 && (
                  <div className="mt-auto pt-2 border-t">
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <Video className="h-4 w-4" />
                      <span>{item.clipMatches.length} clips matched</span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between mt-4 pt-2 border-t">
                  <Badge variant="outline">{item.sport}</Badge>
                  <div className="flex items-center gap-2">
                    {item.url && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={item.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/news/${item.id}`}>View</Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
