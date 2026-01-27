import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seed() {
  const org = await prisma.organization.findFirst();
  const source = await prisma.source.findFirst({ where: { orgId: org?.id } });

  if (!org || !source) {
    console.log("Missing org or source");
    return;
  }

  // Clean up existing sample data
  console.log("Cleaning up existing sample data...");
  await prisma.gameResult.deleteMany({ where: { orgId: org.id } });
  await prisma.oddsSnapshot.deleteMany({ where: { orgId: org.id } });
  await prisma.newsItem.deleteMany({ where: { orgId: org.id, externalId: { startsWith: "sample-" } } });

  console.log("Creating sample news items...");

  const newsItems = [
    {
      externalId: "sample-1",
      type: "TRADE" as const,
      sport: "NFL" as const,
      headline: "Breaking: Chiefs acquire star wide receiver in blockbuster trade",
      content:
        "The Kansas City Chiefs have completed a major trade to acquire a top-tier wide receiver, sources confirm. The deal includes multiple draft picks and sends shockwaves through the league.",
      publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      author: "Adam Schefter",
      teams: ["Kansas City Chiefs"],
      players: [],
      topics: ["trade", "wide receiver"],
      importanceScore: 85,
      scoreBreakdown: { recency: 0.9, topicWeight: 0.9, entityRelevance: 0.8 },
      isProcessed: true,
    },
    {
      externalId: "sample-2",
      type: "INJURY" as const,
      sport: "NBA" as const,
      headline: "Lakers star questionable for playoff game with ankle injury",
      content:
        "The Los Angeles Lakers announced that their star player is listed as questionable for tonight's crucial playoff matchup after suffering an ankle injury in practice.",
      publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      author: "Shams Charania",
      teams: ["Los Angeles Lakers"],
      players: [],
      topics: ["injury", "playoffs"],
      importanceScore: 78,
      scoreBreakdown: { recency: 0.8, topicWeight: 0.85, entityRelevance: 0.75 },
      isProcessed: true,
    },
    {
      externalId: "sample-3",
      type: "GAME_RESULT" as const,
      sport: "NFL" as const,
      headline: "Bills defeat Dolphins 31-24 in AFC East showdown",
      content:
        "The Buffalo Bills secured a crucial division win against the Miami Dolphins with a final score of 31-24. The quarterback threw for 3 touchdowns in the victory.",
      publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      author: "ESPN",
      teams: ["Buffalo Bills", "Miami Dolphins"],
      players: [],
      topics: ["game result", "AFC East"],
      importanceScore: 65,
      scoreBreakdown: { recency: 0.7, topicWeight: 0.7, entityRelevance: 0.6 },
      isProcessed: true,
    },
    {
      externalId: "sample-4",
      type: "BETTING_LINE" as const,
      sport: "NBA" as const,
      headline: "Line movement: Celtics now 7-point favorites vs Knicks",
      content:
        "Sharp money has moved the line significantly as the Boston Celtics are now 7-point favorites against the New York Knicks, up from the opening 4.5.",
      publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      author: "Action Network",
      teams: ["Boston Celtics", "New York Knicks"],
      players: [],
      topics: ["betting", "line movement"],
      importanceScore: 72,
      scoreBreakdown: { recency: 0.95, topicWeight: 0.8, bettingRelevance: 0.9 },
      isProcessed: true,
    },
    {
      externalId: "sample-5",
      type: "BREAKING" as const,
      sport: "NFL" as const,
      headline: "BREAKING: Star QB signs record-breaking contract extension",
      content:
        "In a historic move, one of the league's top quarterbacks has signed the largest contract extension in NFL history, sources tell ESPN.",
      publishedAt: new Date(Date.now() - 30 * 60 * 1000),
      author: "Ian Rapoport",
      teams: [],
      players: [],
      topics: ["contract", "breaking news"],
      importanceScore: 92,
      scoreBreakdown: { recency: 0.98, topicWeight: 0.95, timeSensitivity: 1.0 },
      isProcessed: true,
    },
  ];

  for (const item of newsItems) {
    await prisma.newsItem.upsert({
      where: {
        orgId_sourceId_externalId: {
          orgId: org.id,
          sourceId: source.id,
          externalId: item.externalId,
        },
      },
      update: item,
      create: {
        orgId: org.id,
        sourceId: source.id,
        ...item,
      },
    });
    console.log("Created:", item.headline.substring(0, 50) + "...");
  }

  console.log("\nCreating sample odds...");

  const oddsData = [
    {
      sport: "NFL" as const,
      homeTeam: "Kansas City Chiefs",
      awayTeam: "Buffalo Bills",
      gameDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      homeMoneyline: -150,
      awayMoneyline: 130,
      spread: -3.5,
      overUnder: 48.5,
    },
    {
      sport: "NBA" as const,
      homeTeam: "Boston Celtics",
      awayTeam: "New York Knicks",
      gameDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      homeMoneyline: -280,
      awayMoneyline: 230,
      spread: -7,
      overUnder: 215.5,
    },
    {
      sport: "NFL" as const,
      homeTeam: "San Francisco 49ers",
      awayTeam: "Dallas Cowboys",
      gameDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      homeMoneyline: -120,
      awayMoneyline: 100,
      spread: -1.5,
      overUnder: 51.5,
    },
  ];

  for (const odds of oddsData) {
    await prisma.oddsSnapshot.create({
      data: {
        orgId: org.id,
        sourceId: source.id,
        ...odds,
      },
    });
    console.log("Created odds:", odds.awayTeam, "@", odds.homeTeam);
  }

  console.log("\nCreating sample results...");

  const resultsData = [
    {
      sport: "NFL" as const,
      homeTeam: "Miami Dolphins",
      awayTeam: "Buffalo Bills",
      gameDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      homeScore: 24,
      awayScore: 31,
      status: "FINAL",
      spreadWinner: "AWAY",
      totalResult: "OVER",
    },
    {
      sport: "NBA" as const,
      homeTeam: "Los Angeles Lakers",
      awayTeam: "Golden State Warriors",
      gameDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      homeScore: 118,
      awayScore: 112,
      status: "FINAL",
      spreadWinner: "HOME",
      totalResult: "OVER",
    },
  ];

  for (const result of resultsData) {
    await prisma.gameResult.create({
      data: {
        orgId: org.id,
        ...result,
      },
    });
    console.log(
      "Created result:",
      result.awayTeam,
      "@",
      result.homeTeam,
      "-",
      result.awayScore + "-" + result.homeScore
    );
  }

  console.log("\nDone! Refresh the pages to see data.");
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
