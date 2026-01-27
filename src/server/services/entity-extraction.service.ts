import type { Sport } from "@prisma/client";

/**
 * Entity extraction service for news items.
 * Extracts teams, players, and topics from news content.
 */

export interface ExtractedEntities {
  teams: string[];
  players: string[];
  topics: string[];
}

/**
 * Extract entities from news content.
 * Uses rule-based extraction with sport-specific dictionaries.
 */
export function extractEntities(
  headline: string,
  content: string | null | undefined,
  sport: Sport
): ExtractedEntities {
  const text = `${headline} ${content || ""}`;

  return {
    teams: extractTeams(text, sport),
    players: extractPlayers(text, sport),
    topics: extractTopics(text),
  };
}

/**
 * Extract team names from text.
 */
function extractTeams(text: string, sport: Sport): string[] {
  const teams = SPORT_TEAMS[sport] || [];
  const found: string[] = [];
  const lowerText = text.toLowerCase();

  for (const team of teams) {
    // Check for team name or common abbreviation
    const patterns = [
      team.name.toLowerCase(),
      team.city.toLowerCase(),
      team.abbreviation.toLowerCase(),
      `${team.city.toLowerCase()} ${team.name.toLowerCase()}`,
    ];

    for (const pattern of patterns) {
      if (lowerText.includes(pattern)) {
        found.push(team.fullName);
        break;
      }
    }
  }

  return [...new Set(found)];
}

/**
 * Extract player names from text.
 * Uses common name patterns and sport-specific keyword detection.
 */
function extractPlayers(text: string, sport: Sport): string[] {
  const players: string[] = [];

  // Pattern for capitalized names (First Last or First M. Last)
  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+(?:-[A-Z][a-z]+)?)\b/g;

  let match;
  while ((match = namePattern.exec(text)) !== null) {
    const name = match[1];

    // Filter out common false positives
    if (!isTeamName(name, sport) && !isCommonPhrase(name)) {
      players.push(name);
    }
  }

  return [...new Set(players)];
}

/**
 * Extract topics from text.
 */
function extractTopics(text: string): string[] {
  const topics: string[] = [];
  const lowerText = text.toLowerCase();

  // Topic keywords and their mappings
  const topicPatterns: Array<{ pattern: RegExp; topic: string }> = [
    { pattern: /\b(trade|traded|trading|deal)\b/i, topic: "trade" },
    { pattern: /\b(injur(?:y|ed|ies)|out for|day-to-day|questionable|doubtful|probable)\b/i, topic: "injury" },
    { pattern: /\b(sign(?:ed|ing|s)?|free agent|contract|extension)\b/i, topic: "signing" },
    { pattern: /\b(draft(?:ed)?|pick|selection|prospect)\b/i, topic: "draft" },
    { pattern: /\b(retire(?:d|ment|s)?)\b/i, topic: "retirement" },
    { pattern: /\b(suspen(?:d|ded|sion))\b/i, topic: "suspension" },
    { pattern: /\b(fir(?:e|ed|ing)|coach|manag(?:er|ement))\b/i, topic: "coaching" },
    { pattern: /\b(playoff|postseason|elimination|clinch)\b/i, topic: "playoffs" },
    { pattern: /\b(champion|title|trophy|ring)\b/i, topic: "championship" },
    { pattern: /\b(record|milestone|historic|first-ever)\b/i, topic: "milestone" },
    { pattern: /\b(odds|betting|line|spread|over\/under)\b/i, topic: "betting" },
    { pattern: /\b(mvp|all-star|pro bowl|all-pro)\b/i, topic: "awards" },
    { pattern: /\b(breakout|emerging|rising|rookie)\b/i, topic: "rising-star" },
    { pattern: /\b(controversy|scandal|investigation)\b/i, topic: "controversy" },
    { pattern: /\b(stat(?:s|istics)?|numbers|analytics)\b/i, topic: "analytics" },
  ];

  for (const { pattern, topic } of topicPatterns) {
    if (pattern.test(lowerText)) {
      topics.push(topic);
    }
  }

  return [...new Set(topics)];
}

/**
 * Check if a name is actually a team name.
 */
function isTeamName(name: string, sport: Sport): boolean {
  const teams = SPORT_TEAMS[sport] || [];
  const lowerName = name.toLowerCase();

  return teams.some(
    (team) =>
      team.fullName.toLowerCase() === lowerName ||
      team.name.toLowerCase() === lowerName ||
      team.city.toLowerCase() === lowerName
  );
}

/**
 * Check if a name is a common phrase/false positive.
 */
function isCommonPhrase(name: string): boolean {
  const commonPhrases = new Set([
    "Breaking News",
    "Sports Center",
    "First Take",
    "Get Up",
    "Around The",
    "According To",
    "Sources Say",
    "Per Sources",
    "Multiple Sources",
    "League Sources",
    "Team Sources",
    "Free Agency",
    "Trade Deadline",
    "All Star",
    "Pro Bowl",
    "Super Bowl",
    "World Series",
    "Stanley Cup",
    "NBA Finals",
    "United States",
    "New York",
    "Los Angeles",
    "San Francisco",
    "San Diego",
    "San Antonio",
    "Las Vegas",
  ]);

  return commonPhrases.has(name);
}

/**
 * Team data structure.
 */
interface TeamInfo {
  fullName: string;
  city: string;
  name: string;
  abbreviation: string;
}

/**
 * Sport team dictionaries.
 */
const SPORT_TEAMS: Partial<Record<Sport, TeamInfo[]>> = {
  NFL: [
    { fullName: "Arizona Cardinals", city: "Arizona", name: "Cardinals", abbreviation: "ARI" },
    { fullName: "Atlanta Falcons", city: "Atlanta", name: "Falcons", abbreviation: "ATL" },
    { fullName: "Baltimore Ravens", city: "Baltimore", name: "Ravens", abbreviation: "BAL" },
    { fullName: "Buffalo Bills", city: "Buffalo", name: "Bills", abbreviation: "BUF" },
    { fullName: "Carolina Panthers", city: "Carolina", name: "Panthers", abbreviation: "CAR" },
    { fullName: "Chicago Bears", city: "Chicago", name: "Bears", abbreviation: "CHI" },
    { fullName: "Cincinnati Bengals", city: "Cincinnati", name: "Bengals", abbreviation: "CIN" },
    { fullName: "Cleveland Browns", city: "Cleveland", name: "Browns", abbreviation: "CLE" },
    { fullName: "Dallas Cowboys", city: "Dallas", name: "Cowboys", abbreviation: "DAL" },
    { fullName: "Denver Broncos", city: "Denver", name: "Broncos", abbreviation: "DEN" },
    { fullName: "Detroit Lions", city: "Detroit", name: "Lions", abbreviation: "DET" },
    { fullName: "Green Bay Packers", city: "Green Bay", name: "Packers", abbreviation: "GB" },
    { fullName: "Houston Texans", city: "Houston", name: "Texans", abbreviation: "HOU" },
    { fullName: "Indianapolis Colts", city: "Indianapolis", name: "Colts", abbreviation: "IND" },
    { fullName: "Jacksonville Jaguars", city: "Jacksonville", name: "Jaguars", abbreviation: "JAX" },
    { fullName: "Kansas City Chiefs", city: "Kansas City", name: "Chiefs", abbreviation: "KC" },
    { fullName: "Las Vegas Raiders", city: "Las Vegas", name: "Raiders", abbreviation: "LV" },
    { fullName: "Los Angeles Chargers", city: "Los Angeles", name: "Chargers", abbreviation: "LAC" },
    { fullName: "Los Angeles Rams", city: "Los Angeles", name: "Rams", abbreviation: "LAR" },
    { fullName: "Miami Dolphins", city: "Miami", name: "Dolphins", abbreviation: "MIA" },
    { fullName: "Minnesota Vikings", city: "Minnesota", name: "Vikings", abbreviation: "MIN" },
    { fullName: "New England Patriots", city: "New England", name: "Patriots", abbreviation: "NE" },
    { fullName: "New Orleans Saints", city: "New Orleans", name: "Saints", abbreviation: "NO" },
    { fullName: "New York Giants", city: "New York", name: "Giants", abbreviation: "NYG" },
    { fullName: "New York Jets", city: "New York", name: "Jets", abbreviation: "NYJ" },
    { fullName: "Philadelphia Eagles", city: "Philadelphia", name: "Eagles", abbreviation: "PHI" },
    { fullName: "Pittsburgh Steelers", city: "Pittsburgh", name: "Steelers", abbreviation: "PIT" },
    { fullName: "San Francisco 49ers", city: "San Francisco", name: "49ers", abbreviation: "SF" },
    { fullName: "Seattle Seahawks", city: "Seattle", name: "Seahawks", abbreviation: "SEA" },
    { fullName: "Tampa Bay Buccaneers", city: "Tampa Bay", name: "Buccaneers", abbreviation: "TB" },
    { fullName: "Tennessee Titans", city: "Tennessee", name: "Titans", abbreviation: "TEN" },
    { fullName: "Washington Commanders", city: "Washington", name: "Commanders", abbreviation: "WAS" },
  ],
  NBA: [
    { fullName: "Atlanta Hawks", city: "Atlanta", name: "Hawks", abbreviation: "ATL" },
    { fullName: "Boston Celtics", city: "Boston", name: "Celtics", abbreviation: "BOS" },
    { fullName: "Brooklyn Nets", city: "Brooklyn", name: "Nets", abbreviation: "BKN" },
    { fullName: "Charlotte Hornets", city: "Charlotte", name: "Hornets", abbreviation: "CHA" },
    { fullName: "Chicago Bulls", city: "Chicago", name: "Bulls", abbreviation: "CHI" },
    { fullName: "Cleveland Cavaliers", city: "Cleveland", name: "Cavaliers", abbreviation: "CLE" },
    { fullName: "Dallas Mavericks", city: "Dallas", name: "Mavericks", abbreviation: "DAL" },
    { fullName: "Denver Nuggets", city: "Denver", name: "Nuggets", abbreviation: "DEN" },
    { fullName: "Detroit Pistons", city: "Detroit", name: "Pistons", abbreviation: "DET" },
    { fullName: "Golden State Warriors", city: "Golden State", name: "Warriors", abbreviation: "GSW" },
    { fullName: "Houston Rockets", city: "Houston", name: "Rockets", abbreviation: "HOU" },
    { fullName: "Indiana Pacers", city: "Indiana", name: "Pacers", abbreviation: "IND" },
    { fullName: "Los Angeles Clippers", city: "Los Angeles", name: "Clippers", abbreviation: "LAC" },
    { fullName: "Los Angeles Lakers", city: "Los Angeles", name: "Lakers", abbreviation: "LAL" },
    { fullName: "Memphis Grizzlies", city: "Memphis", name: "Grizzlies", abbreviation: "MEM" },
    { fullName: "Miami Heat", city: "Miami", name: "Heat", abbreviation: "MIA" },
    { fullName: "Milwaukee Bucks", city: "Milwaukee", name: "Bucks", abbreviation: "MIL" },
    { fullName: "Minnesota Timberwolves", city: "Minnesota", name: "Timberwolves", abbreviation: "MIN" },
    { fullName: "New Orleans Pelicans", city: "New Orleans", name: "Pelicans", abbreviation: "NOP" },
    { fullName: "New York Knicks", city: "New York", name: "Knicks", abbreviation: "NYK" },
    { fullName: "Oklahoma City Thunder", city: "Oklahoma City", name: "Thunder", abbreviation: "OKC" },
    { fullName: "Orlando Magic", city: "Orlando", name: "Magic", abbreviation: "ORL" },
    { fullName: "Philadelphia 76ers", city: "Philadelphia", name: "76ers", abbreviation: "PHI" },
    { fullName: "Phoenix Suns", city: "Phoenix", name: "Suns", abbreviation: "PHX" },
    { fullName: "Portland Trail Blazers", city: "Portland", name: "Trail Blazers", abbreviation: "POR" },
    { fullName: "Sacramento Kings", city: "Sacramento", name: "Kings", abbreviation: "SAC" },
    { fullName: "San Antonio Spurs", city: "San Antonio", name: "Spurs", abbreviation: "SAS" },
    { fullName: "Toronto Raptors", city: "Toronto", name: "Raptors", abbreviation: "TOR" },
    { fullName: "Utah Jazz", city: "Utah", name: "Jazz", abbreviation: "UTA" },
    { fullName: "Washington Wizards", city: "Washington", name: "Wizards", abbreviation: "WAS" },
  ],
  MLB: [
    { fullName: "Arizona Diamondbacks", city: "Arizona", name: "Diamondbacks", abbreviation: "ARI" },
    { fullName: "Atlanta Braves", city: "Atlanta", name: "Braves", abbreviation: "ATL" },
    { fullName: "Baltimore Orioles", city: "Baltimore", name: "Orioles", abbreviation: "BAL" },
    { fullName: "Boston Red Sox", city: "Boston", name: "Red Sox", abbreviation: "BOS" },
    { fullName: "Chicago Cubs", city: "Chicago", name: "Cubs", abbreviation: "CHC" },
    { fullName: "Chicago White Sox", city: "Chicago", name: "White Sox", abbreviation: "CWS" },
    { fullName: "Cincinnati Reds", city: "Cincinnati", name: "Reds", abbreviation: "CIN" },
    { fullName: "Cleveland Guardians", city: "Cleveland", name: "Guardians", abbreviation: "CLE" },
    { fullName: "Colorado Rockies", city: "Colorado", name: "Rockies", abbreviation: "COL" },
    { fullName: "Detroit Tigers", city: "Detroit", name: "Tigers", abbreviation: "DET" },
    { fullName: "Houston Astros", city: "Houston", name: "Astros", abbreviation: "HOU" },
    { fullName: "Kansas City Royals", city: "Kansas City", name: "Royals", abbreviation: "KC" },
    { fullName: "Los Angeles Angels", city: "Los Angeles", name: "Angels", abbreviation: "LAA" },
    { fullName: "Los Angeles Dodgers", city: "Los Angeles", name: "Dodgers", abbreviation: "LAD" },
    { fullName: "Miami Marlins", city: "Miami", name: "Marlins", abbreviation: "MIA" },
    { fullName: "Milwaukee Brewers", city: "Milwaukee", name: "Brewers", abbreviation: "MIL" },
    { fullName: "Minnesota Twins", city: "Minnesota", name: "Twins", abbreviation: "MIN" },
    { fullName: "New York Mets", city: "New York", name: "Mets", abbreviation: "NYM" },
    { fullName: "New York Yankees", city: "New York", name: "Yankees", abbreviation: "NYY" },
    { fullName: "Oakland Athletics", city: "Oakland", name: "Athletics", abbreviation: "OAK" },
    { fullName: "Philadelphia Phillies", city: "Philadelphia", name: "Phillies", abbreviation: "PHI" },
    { fullName: "Pittsburgh Pirates", city: "Pittsburgh", name: "Pirates", abbreviation: "PIT" },
    { fullName: "San Diego Padres", city: "San Diego", name: "Padres", abbreviation: "SD" },
    { fullName: "San Francisco Giants", city: "San Francisco", name: "Giants", abbreviation: "SF" },
    { fullName: "Seattle Mariners", city: "Seattle", name: "Mariners", abbreviation: "SEA" },
    { fullName: "St. Louis Cardinals", city: "St. Louis", name: "Cardinals", abbreviation: "STL" },
    { fullName: "Tampa Bay Rays", city: "Tampa Bay", name: "Rays", abbreviation: "TB" },
    { fullName: "Texas Rangers", city: "Texas", name: "Rangers", abbreviation: "TEX" },
    { fullName: "Toronto Blue Jays", city: "Toronto", name: "Blue Jays", abbreviation: "TOR" },
    { fullName: "Washington Nationals", city: "Washington", name: "Nationals", abbreviation: "WAS" },
  ],
  NHL: [
    { fullName: "Anaheim Ducks", city: "Anaheim", name: "Ducks", abbreviation: "ANA" },
    { fullName: "Arizona Coyotes", city: "Arizona", name: "Coyotes", abbreviation: "ARI" },
    { fullName: "Boston Bruins", city: "Boston", name: "Bruins", abbreviation: "BOS" },
    { fullName: "Buffalo Sabres", city: "Buffalo", name: "Sabres", abbreviation: "BUF" },
    { fullName: "Calgary Flames", city: "Calgary", name: "Flames", abbreviation: "CGY" },
    { fullName: "Carolina Hurricanes", city: "Carolina", name: "Hurricanes", abbreviation: "CAR" },
    { fullName: "Chicago Blackhawks", city: "Chicago", name: "Blackhawks", abbreviation: "CHI" },
    { fullName: "Colorado Avalanche", city: "Colorado", name: "Avalanche", abbreviation: "COL" },
    { fullName: "Columbus Blue Jackets", city: "Columbus", name: "Blue Jackets", abbreviation: "CBJ" },
    { fullName: "Dallas Stars", city: "Dallas", name: "Stars", abbreviation: "DAL" },
    { fullName: "Detroit Red Wings", city: "Detroit", name: "Red Wings", abbreviation: "DET" },
    { fullName: "Edmonton Oilers", city: "Edmonton", name: "Oilers", abbreviation: "EDM" },
    { fullName: "Florida Panthers", city: "Florida", name: "Panthers", abbreviation: "FLA" },
    { fullName: "Los Angeles Kings", city: "Los Angeles", name: "Kings", abbreviation: "LAK" },
    { fullName: "Minnesota Wild", city: "Minnesota", name: "Wild", abbreviation: "MIN" },
    { fullName: "Montreal Canadiens", city: "Montreal", name: "Canadiens", abbreviation: "MTL" },
    { fullName: "Nashville Predators", city: "Nashville", name: "Predators", abbreviation: "NSH" },
    { fullName: "New Jersey Devils", city: "New Jersey", name: "Devils", abbreviation: "NJD" },
    { fullName: "New York Islanders", city: "New York", name: "Islanders", abbreviation: "NYI" },
    { fullName: "New York Rangers", city: "New York", name: "Rangers", abbreviation: "NYR" },
    { fullName: "Ottawa Senators", city: "Ottawa", name: "Senators", abbreviation: "OTT" },
    { fullName: "Philadelphia Flyers", city: "Philadelphia", name: "Flyers", abbreviation: "PHI" },
    { fullName: "Pittsburgh Penguins", city: "Pittsburgh", name: "Penguins", abbreviation: "PIT" },
    { fullName: "San Jose Sharks", city: "San Jose", name: "Sharks", abbreviation: "SJS" },
    { fullName: "Seattle Kraken", city: "Seattle", name: "Kraken", abbreviation: "SEA" },
    { fullName: "St. Louis Blues", city: "St. Louis", name: "Blues", abbreviation: "STL" },
    { fullName: "Tampa Bay Lightning", city: "Tampa Bay", name: "Lightning", abbreviation: "TBL" },
    { fullName: "Toronto Maple Leafs", city: "Toronto", name: "Maple Leafs", abbreviation: "TOR" },
    { fullName: "Vancouver Canucks", city: "Vancouver", name: "Canucks", abbreviation: "VAN" },
    { fullName: "Vegas Golden Knights", city: "Vegas", name: "Golden Knights", abbreviation: "VGK" },
    { fullName: "Washington Capitals", city: "Washington", name: "Capitals", abbreviation: "WSH" },
    { fullName: "Winnipeg Jets", city: "Winnipeg", name: "Jets", abbreviation: "WPG" },
  ],
};
