import { Trophy, CheckCircle, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant-prisma";
import { format, subDays } from "date-fns";

export default async function ResultsPage() {
  const { orgId } = await getTenantContext();

  // Get recent game results (last 7 days)
  const results = await prisma.gameResult.findMany({
    where: {
      orgId,
      gameDate: {
        gte: subDays(new Date(), 7),
      },
    },
    orderBy: [{ gameDate: "desc" }, { createdAt: "desc" }],
  });

  // Group by sport
  const resultsBySport = results.reduce(
    (acc, result) => {
      if (!acc[result.sport]) {
        acc[result.sport] = [];
      }
      acc[result.sport].push(result);
      return acc;
    },
    {} as Record<string, typeof results>
  );

  const getStatusIcon = (status: string | null) => {
    switch (status?.toUpperCase()) {
      case "FINAL":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "IN_PROGRESS":
        return <Clock className="h-4 w-4 text-yellow-600 animate-pulse" />;
      case "SCHEDULED":
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const getSpreadResult = (result: string | null) => {
    switch (result) {
      case "HOME":
        return <Badge variant="outline" className="text-green-600">Home</Badge>;
      case "AWAY":
        return <Badge variant="outline" className="text-green-600">Away</Badge>;
      case "PUSH":
        return <Badge variant="outline" className="text-yellow-600">Push</Badge>;
      default:
        return <span className="text-muted-foreground">-</span>;
    }
  };

  const getTotalResult = (result: string | null) => {
    switch (result) {
      case "OVER":
        return <Badge variant="outline" className="text-green-600">Over</Badge>;
      case "UNDER":
        return <Badge variant="outline" className="text-green-600">Under</Badge>;
      case "PUSH":
        return <Badge variant="outline" className="text-yellow-600">Push</Badge>;
      default:
        return <span className="text-muted-foreground">-</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Game Results</h1>
        <p className="text-muted-foreground">
          Recent game scores and betting outcomes
        </p>
      </div>

      {Object.keys(resultsBySport).length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Trophy className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No results yet</h3>
            <p className="text-muted-foreground">
              Game results will appear here once sources start fetching score data.
            </p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(resultsBySport).map(([sport, sportResults]) => (
          <Card key={sport}>
            <CardHeader>
              <CardTitle>{sport}</CardTitle>
              <CardDescription>
                {sportResults.length} game{sportResults.length !== 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Game</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-center">Score</TableHead>
                    <TableHead className="text-center">Spread</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sportResults.map((result) => {
                    const isFinal = result.status?.toUpperCase() === "FINAL";
                    const homeWon =
                      result.homeScore !== null &&
                      result.awayScore !== null &&
                      result.homeScore > result.awayScore;
                    const awayWon =
                      result.homeScore !== null &&
                      result.awayScore !== null &&
                      result.awayScore > result.homeScore;

                    return (
                      <TableRow key={result.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(result.status)}
                            <span className="text-sm">{result.status || "Unknown"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div
                              className={`font-medium ${awayWon && isFinal ? "text-green-600" : ""}`}
                            >
                              {result.awayTeam}
                            </div>
                            <div
                              className={`text-muted-foreground ${homeWon && isFinal ? "text-green-600 font-medium" : ""}`}
                            >
                              @ {result.homeTeam}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {format(result.gameDate, "EEE, MMM d")}
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {result.awayScore !== null && result.homeScore !== null ? (
                            <div>
                              <div className={awayWon && isFinal ? "font-bold" : ""}>
                                {result.awayScore}
                              </div>
                              <div className={homeWon && isFinal ? "font-bold" : ""}>
                                {result.homeScore}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {getSpreadResult(result.spreadWinner)}
                        </TableCell>
                        <TableCell className="text-center">
                          {getTotalResult(result.totalResult)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
