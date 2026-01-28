const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Get all SportsGrid sources
  const sources = await prisma.source.findMany({
    where: { type: 'SPORTSGRID_API' }
  });

  if (sources.length === 0) {
    console.log('No SportsGrid sources found');
    return;
  }

  for (const source of sources) {
    console.log('\nProcessing source:', source.name, source.id);
    const sportName = source.config?.sport || source.sport.toLowerCase();
    console.log('Fetching odds for sport:', sportName);

    // Direct API call
    const response = await fetch('https://web.sportsgrid.com/api/web/v1/getSingleSportGamesData', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ sport: sportName })
    });

    if (!response.ok) {
      console.log('API error:', response.status, response.statusText);
      continue;
    }

    const data = await response.json();
    const games = data?.data?.featured_games?.data || data?.featured_games?.data || [];

    console.log('Fetched', games.length, 'games from API');

    if (games.length === 0) {
      console.log('No games found for', sportName);
      continue;
    }

    await saveGames(games, source.id, source.orgId, source.sport);
  }
}

async function saveGames(games, sourceId, orgId, sport) {
  let saved = 0;
  for (const game of games) {
    if (!game.home_name || !game.away_name) continue;

    // Parse values
    let spread = null;
    if (game.home_spread_point) {
      const m = game.home_spread_point.match(/([+-]?\d+\.?\d*)/);
      if (m) spread = parseFloat(m[1]);
    }

    let homeMoneyline = null;
    if (game.home_ml_point) {
      const m = game.home_ml_point.match(/([+-]?\d+)/);
      if (m) homeMoneyline = parseInt(m[1], 10);
    }

    let awayMoneyline = null;
    if (game.away_ml_point) {
      const m = game.away_ml_point.match(/([+-]?\d+)/);
      if (m) awayMoneyline = parseInt(m[1], 10);
    }

    let overUnder = null;
    if (game.home_total_point) {
      const m = game.home_total_point.match(/(\d+\.?\d*)/);
      if (m) overUnder = parseFloat(m[1]);
    }

    let gameDate = new Date();
    if (game.scheduled_raw) {
      const parsed = new Date(game.scheduled_raw);
      if (!isNaN(parsed.getTime())) gameDate = parsed;
    }

    await prisma.oddsSnapshot.create({
      data: {
        orgId: orgId,
        sourceId: sourceId,
        sport: sport,
        homeTeam: game.home_name,
        awayTeam: game.away_name,
        gameDate: gameDate,
        externalGameId: game.key || null,
        homeMoneyline: homeMoneyline,
        awayMoneyline: awayMoneyline,
        spread: spread,
        spreadJuice: -110,
        overUnder: overUnder,
        overJuice: -110,
        underJuice: -110
      }
    });
    saved++;
    console.log(`  - ${game.away_name} @ ${game.home_name}: spread=${spread}, o/u=${overUnder}`);
  }

  console.log('Saved', saved, 'odds snapshots to database');

  // Update source last fetch time
  await prisma.source.update({
    where: { id: sourceId },
    data: {
      lastFetchAt: new Date(),
      lastSuccessAt: new Date()
    }
  });

  console.log('Updated source last fetch time');
}

main().catch(console.error).finally(() => prisma.$disconnect());
