const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Team abbreviation to full name mapping
const NFL_TEAMS = {
  'ARI': 'Arizona Cardinals', 'ATL': 'Atlanta Falcons', 'BAL': 'Baltimore Ravens',
  'BUF': 'Buffalo Bills', 'CAR': 'Carolina Panthers', 'CHI': 'Chicago Bears',
  'CIN': 'Cincinnati Bengals', 'CLE': 'Cleveland Browns', 'DAL': 'Dallas Cowboys',
  'DEN': 'Denver Broncos', 'DET': 'Detroit Lions', 'GB': 'Green Bay Packers',
  'HOU': 'Houston Texans', 'IND': 'Indianapolis Colts', 'JAX': 'Jacksonville Jaguars',
  'KC': 'Kansas City Chiefs', 'LV': 'Las Vegas Raiders', 'LAC': 'Los Angeles Chargers',
  'LAR': 'Los Angeles Rams', 'MIA': 'Miami Dolphins', 'MIN': 'Minnesota Vikings',
  'NE': 'New England Patriots', 'NO': 'New Orleans Saints', 'NYG': 'New York Giants',
  'NYJ': 'New York Jets', 'PHI': 'Philadelphia Eagles', 'PIT': 'Pittsburgh Steelers',
  'SF': 'San Francisco 49ers', 'SEA': 'Seattle Seahawks', 'TB': 'Tampa Bay Buccaneers',
  'TEN': 'Tennessee Titans', 'WAS': 'Washington Commanders'
};

const NBA_TEAMS = {
  'ATL': 'Atlanta Hawks', 'BOS': 'Boston Celtics', 'BKN': 'Brooklyn Nets',
  'CHA': 'Charlotte Hornets', 'CHI': 'Chicago Bulls', 'CLE': 'Cleveland Cavaliers',
  'DAL': 'Dallas Mavericks', 'DEN': 'Denver Nuggets', 'DET': 'Detroit Pistons',
  'GSW': 'Golden State Warriors', 'HOU': 'Houston Rockets', 'IND': 'Indiana Pacers',
  'LAC': 'Los Angeles Clippers', 'LAL': 'Los Angeles Lakers', 'MEM': 'Memphis Grizzlies',
  'MIA': 'Miami Heat', 'MIL': 'Milwaukee Bucks', 'MIN': 'Minnesota Timberwolves',
  'NOP': 'New Orleans Pelicans', 'NYK': 'New York Knicks', 'OKC': 'Oklahoma City Thunder',
  'ORL': 'Orlando Magic', 'PHI': 'Philadelphia 76ers', 'PHX': 'Phoenix Suns',
  'POR': 'Portland Trail Blazers', 'SAC': 'Sacramento Kings', 'SAS': 'San Antonio Spurs',
  'TOR': 'Toronto Raptors', 'UTA': 'Utah Jazz', 'WAS': 'Washington Wizards'
};

function getFullTeamName(abbrev, sport) {
  if (sport === 'NFL') return NFL_TEAMS[abbrev] || abbrev;
  if (sport === 'NBA') return NBA_TEAMS[abbrev] || abbrev;
  return abbrev;
}

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

    // Convert abbreviations to full team names
    const homeTeam = getFullTeamName(game.home_name, sport);
    const awayTeam = getFullTeamName(game.away_name, sport);

    // Parse values
    let spread = null;
    if (game.home_spread_point && game.home_spread_point !== 'N/A') {
      const m = game.home_spread_point.match(/([+-]?\d+\.?\d*)/);
      if (m) spread = parseFloat(m[1]);
    }

    let homeMoneyline = null;
    if (game.home_ml_point && game.home_ml_point !== 'N/A') {
      const m = game.home_ml_point.match(/([+-]?\d+)/);
      if (m) homeMoneyline = parseInt(m[1], 10);
    }

    let awayMoneyline = null;
    if (game.away_ml_point && game.away_ml_point !== 'N/A') {
      const m = game.away_ml_point.match(/([+-]?\d+)/);
      if (m) awayMoneyline = parseInt(m[1], 10);
    }

    let overUnder = null;
    if (game.home_total_point && game.home_total_point !== 'N/A') {
      const m = game.home_total_point.match(/(\d+\.?\d*)/);
      if (m) overUnder = parseFloat(m[1]);
    }

    let gameDate = new Date();
    if (game.scheduled_raw) {
      const parsed = new Date(game.scheduled_raw);
      if (!isNaN(parsed.getTime())) gameDate = parsed;
    }

    // Delete existing snapshot for this game (by externalGameId or team+date combo)
    if (game.key) {
      await prisma.oddsSnapshot.deleteMany({
        where: { externalGameId: game.key, orgId: orgId }
      });
    } else {
      await prisma.oddsSnapshot.deleteMany({
        where: {
          orgId: orgId,
          homeTeam: homeTeam,
          awayTeam: awayTeam,
          gameDate: gameDate
        }
      });
    }

    await prisma.oddsSnapshot.create({
      data: {
        orgId: orgId,
        sourceId: sourceId,
        sport: sport,
        homeTeam: homeTeam,
        awayTeam: awayTeam,
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
    console.log(`  - ${awayTeam} @ ${homeTeam}: spread=${spread}, o/u=${overUnder}, ML=${awayMoneyline}/${homeMoneyline}`);
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
