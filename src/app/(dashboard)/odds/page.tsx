import { DollarSign, TrendingUp, TrendingDown, Minus } from "lucide-react";
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
import { format, startOfDay, endOfDay } from "date-fns";
import { getLastFetchInfo } from "@/server/actions/news";
import { RefreshButton } from "@/components/features/sources/refresh-button";

export default async function OddsPage() {
  const { orgId } = await getTenantContext();
  const fetchInfo = await getLastFetchInfo("odds");

  // Get today's odds snapshots grouped by game
  const today = new Date();
  const oddsSnapshots = await prisma.oddsSnapshot.findMany({
    where: {
      orgId,
      gameDate: {
        gte: startOfDay(today),
        lte: endOfDay(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)), // Next 7 days
      },
    },
    orderBy: [{ gameDate: "asc" }, { createdAt: "desc" }],
  });

  // Group by game (using home/away/date as key) and get latest snapshot
  const gameMap = new Map<string, typeof oddsSnapshots[0]>();
  for (const odds of oddsSnapshots) {
    const key = `${odds.homeTeam}-${odds.awayTeam}-${odds.gameDate.toISOString().split("T")[0]}`;
    if (!gameMap.has(key)) {
      gameMap.set(key, odds);
    }
  }

  const games = Array.from(gameMap.values());

  // Group by sport
  const gamesBySport = games.reduce(
    (acc, game) => {
      if (!acc[game.sport]) {
        acc[game.sport] = [];
      }
      acc[game.sport].push(game);
      return acc;
    },
    {} as Record<string, typeof games>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Betting Odds</h1>
          <p className="text-muted-foreground">
            Current betting lines for upcoming games
          </p>
        </div>
        <RefreshButton
          type="odds"
          lastFetchAt={fetchInfo.lastFetchAt}
          nextFetchAt={fetchInfo.nextFetchAt}
          sourceCount={fetchInfo.sourceCount}
        />
      </div>

      {Object.keys(gamesBySport).length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <DollarSign className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No odds data yet</h3>
            <p className="text-muted-foreground">
              Odds will appear here once SportsGrid sources start fetching data.
            </p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(gamesBySport).map(([sport, sportGames]) => (
          <Card key={sport}>
            <CardHeader>
              <CardTitle>{sport}</CardTitle>
              <CardDescription>
                {sportGames.length} game{sportGames.length !== 1 ? "s" : ""} with odds
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Game</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Spread</TableHead>
                    <TableHead className="text-right">O/U</TableHead>
                    <TableHead className="text-right">Away ML</TableHead>
                    <TableHead className="text-right">Home ML</TableHead>
                    <TableHead className="text-center">Movement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sportGames.map((game) => {
                    const spreadMoved =
                      game.previousSpread !== null &&
                      game.previousSpread !== undefined &&
                      game.spread !== null &&
                      game.spread !== game.previousSpread;
                    const ouMoved =
                      game.previousOverUnder !== null &&
                      game.previousOverUnder !== undefined &&
                      game.overUnder !== null &&
                      game.overUnder !== game.previousOverUnder;

                    return (
                      <TableRow key={game.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{game.awayTeam}</div>
                            <div className="text-muted-foreground">@ {game.homeTeam}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {format(game.gameDate, "EEE, MMM d")}
                            <br />
                            <span className="text-muted-foreground">
                              {format(game.gameDate, "h:mm a")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {game.spread !== null ? (
                            <span className={spreadMoved ? "text-yellow-600" : ""}>
                              {game.spread > 0 ? "+" : ""}
                              {game.spread}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {game.overUnder !== null ? (
                            <span className={ouMoved ? "text-yellow-600" : ""}>
                              {game.overUnder}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {game.awayMoneyline !== null ? (
                            <span
                              className={game.awayMoneyline > 0 ? "text-green-600" : ""}
                            >
                              {game.awayMoneyline > 0 ? "+" : ""}
                              {game.awayMoneyline}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {game.homeMoneyline !== null ? (
                            <span
                              className={game.homeMoneyline > 0 ? "text-green-600" : ""}
                            >
                              {game.homeMoneyline > 0 ? "+" : ""}
                              {game.homeMoneyline}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {spreadMoved || ouMoved ? (
                            <div className="flex items-center justify-center gap-1">
                              {spreadMoved && (
                                game.spread! > game.previousSpread! ? (
                                  <TrendingUp className="h-4 w-4 text-green-600" />
                                ) : (
                                  <TrendingDown className="h-4 w-4 text-red-600" />
                                )
                              )}
                              {ouMoved && (
                                game.overUnder! > game.previousOverUnder! ? (
                                  <TrendingUp className="h-4 w-4 text-blue-600" />
                                ) : (
                                  <TrendingDown className="h-4 w-4 text-orange-600" />
                                )
                              )}
                            </div>
                          ) : (
                            <Minus className="h-4 w-4 text-muted-foreground mx-auto" />
                          )}
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
