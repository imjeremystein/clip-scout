import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Clock,
  Video,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { stripHtml } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getNewsItem } from "@/server/actions/news";
import { formatDistanceToNow, format } from "date-fns";
import { ClipMatchActions } from "@/components/features/news/clip-match-actions";

interface NewsDetailPageProps {
  params: Promise<{ id: string }>;
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

const MATCH_STATUS_COLORS: Record<string, string> = {
  PENDING: "text-yellow-600",
  MATCHED: "text-green-600",
  NO_MATCH: "text-gray-600",
  DISMISSED: "text-red-600",
};

export default async function NewsDetailPage({ params }: NewsDetailPageProps) {
  const { id } = await params;

  let newsItem;
  try {
    newsItem = await getNewsItem(id);
  } catch {
    notFound();
  }

  const teams = newsItem.teams as string[];
  const players = newsItem.players as string[];
  const topics = newsItem.topics as string[];
  const scoreBreakdown = newsItem.scoreBreakdown as Record<string, number>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/news">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className={TYPE_COLORS[newsItem.type] || TYPE_COLORS.ANALYSIS}
              >
                {newsItem.type}
              </Badge>
              <Badge variant="outline">{newsItem.sport}</Badge>
              <span className="text-sm text-muted-foreground">
                Score: {Math.round(newsItem.importanceScore)}
              </span>
            </div>
            <h1 className="text-2xl font-bold">{newsItem.headline}</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{newsItem.source.name}</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(newsItem.publishedAt, { addSuffix: true })}
              </span>
              {newsItem.author && <span>By {newsItem.author}</span>}
            </div>
          </div>
        </div>
        {newsItem.url && (
          <Button variant="outline" asChild>
            <a href={newsItem.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              View Source
            </a>
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Content */}
        <div className="md:col-span-2 space-y-6">
          {/* Content */}
          <Card>
            <CardHeader>
              <CardTitle>Content</CardTitle>
            </CardHeader>
            <CardContent>
              {newsItem.content ? (
                <p className="whitespace-pre-wrap">{stripHtml(newsItem.content)}</p>
              ) : (
                <p className="text-muted-foreground">No content available</p>
              )}

              {newsItem.aiAnalysis && (
                <div className="mt-4 pt-4 border-t">
                  <h4 className="font-medium mb-2">AI Analysis</h4>
                  <p className="text-sm text-muted-foreground">
                    {newsItem.aiAnalysis}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Clip Matches */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5" />
                Matched Clips
              </CardTitle>
              <CardDescription>
                Video clips that match this news item
              </CardDescription>
            </CardHeader>
            <CardContent>
              {newsItem.clipMatches.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    No clips matched yet
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {newsItem.clipMatches.map((match) => (
                    <div
                      key={match.id}
                      className="flex items-start gap-4 p-4 border rounded-lg"
                    >
                      {match.candidate?.video && (
                        <img
                          src={match.candidate.video.thumbnailUrl || undefined}
                          alt=""
                          className="w-32 h-20 object-cover rounded"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-medium ${MATCH_STATUS_COLORS[match.status]}`}
                          >
                            {match.status}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Score: {Math.round(match.matchScore * 100)}%
                          </span>
                        </div>
                        {match.candidate?.video && (
                          <>
                            <h4 className="font-medium line-clamp-2 mt-1">
                              {match.candidate.video.title}
                            </h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              {match.candidate.video.channelTitle}
                            </p>
                          </>
                        )}
                        {match.matchReason && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {match.matchReason}
                          </p>
                        )}
                      </div>
                      <ClipMatchActions
                        clipMatchId={match.id}
                        status={match.status}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Entities */}
          <Card>
            <CardHeader>
              <CardTitle>Extracted Entities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {teams.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Teams</h4>
                  <div className="flex flex-wrap gap-1">
                    {teams.map((team) => (
                      <Badge key={team} variant="secondary">
                        {team}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {players.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Players</h4>
                  <div className="flex flex-wrap gap-1">
                    {players.map((player) => (
                      <Badge key={player} variant="outline">
                        {player}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {topics.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Topics</h4>
                  <div className="flex flex-wrap gap-1">
                    {topics.map((topic) => (
                      <Badge key={topic} variant="outline">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {teams.length === 0 && players.length === 0 && topics.length === 0 && (
                <p className="text-sm text-muted-foreground">No entities extracted</p>
              )}
            </CardContent>
          </Card>

          {/* Score Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Score Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(scoreBreakdown).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-muted-foreground capitalize">
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </span>
                    <span>{typeof value === "number" ? value.toFixed(2) : String(value)}</span>
                  </div>
                ))}
                {Object.keys(scoreBreakdown).length === 0 && (
                  <p className="text-sm text-muted-foreground">No breakdown available</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span>{newsItem.source.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span>{newsItem.source.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Published</span>
                <span>{format(newsItem.publishedAt, "PPp")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ingested</span>
                <span>{format(newsItem.createdAt, "PPp")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Processed</span>
                <span>{newsItem.isProcessed ? "Yes" : "No"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paired</span>
                <span>{newsItem.isPaired ? "Yes" : "No"}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
