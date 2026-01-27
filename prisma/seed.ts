import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting seed...");

  // Create a test user
  const testUser = await prisma.user.upsert({
    where: { email: "test@clipscout.dev" },
    update: {},
    create: {
      email: "test@clipscout.dev",
      name: "Test User",
      emailVerified: new Date(),
    },
  });

  console.log("Created test user:", testUser.email);

  // Create a test organization
  const testOrg = await prisma.organization.upsert({
    where: { slug: "test-org" },
    update: {},
    create: {
      name: "Test Organization",
      slug: "test-org",
      timezone: "America/New_York",
      plan: "free",
    },
  });

  console.log("Created test organization:", testOrg.name);

  // Create membership linking user to org
  await prisma.orgMembership.upsert({
    where: {
      orgId_userId: {
        orgId: testOrg.id,
        userId: testUser.id,
      },
    },
    update: {},
    create: {
      orgId: testOrg.id,
      userId: testUser.id,
      role: "MANAGER",
      status: "ACTIVE",
    },
  });

  console.log("Linked user to organization as MANAGER");

  // Create sample query definitions
  const queries = [
    {
      name: "NFL Touchdown Highlights",
      description: "Find the best touchdown highlights from NFL games",
      sport: "NFL" as const,
      keywords: ["touchdown", "highlights", "game winning"],
      recencyDays: 7,
      isScheduled: true,
      scheduleType: "DAILY" as const,
    },
    {
      name: "NBA Trade Rumors",
      description: "Track the latest NBA trade rumors and discussions",
      sport: "NBA" as const,
      keywords: ["trade", "rumors", "breaking news"],
      recencyDays: 3,
      isScheduled: false,
      scheduleType: "MANUAL" as const,
    },
    {
      name: "MLB Spring Training",
      description: "Coverage of MLB spring training activities",
      sport: "MLB" as const,
      keywords: ["spring training", "prospects", "preparation"],
      recencyDays: 7,
      isScheduled: false,
      scheduleType: "MANUAL" as const,
    },
    {
      name: "Sports Betting Odds Analysis",
      description: "Expert analysis of sports betting odds and predictions",
      sport: "SPORTS_BETTING" as const,
      keywords: ["odds", "predictions", "betting analysis", "spread"],
      recencyDays: 1,
      isScheduled: true,
      scheduleType: "DAILY" as const,
    },
  ];

  const createdQueries = [];
  for (const query of queries) {
    const created = await prisma.queryDefinition.create({
      data: {
        orgId: testOrg.id,
        createdByUserId: testUser.id,
        name: query.name,
        description: query.description,
        sport: query.sport,
        keywords: query.keywords,
        recencyDays: query.recencyDays,
        isScheduled: query.isScheduled,
        scheduleType: query.scheduleType,
        isActive: true,
        isShared: false,
      },
    });
    createdQueries.push(created);
    console.log("Created query:", query.name);
  }

  // Create sample YouTube videos (using real public YouTube video IDs)
  const sampleVideos = [
    {
      youtubeVideoId: "dQw4w9WgXcQ", // Rick Astley - popular test video that's always available
      title: "Sample Sports Highlight - Touchdown Play",
      description: "An incredible game-winning play demonstration.",
      channelTitle: "Sports Highlights",
      channelId: "UCuAXFkgsw1L7xaCfnd5JJOw",
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
      publishedAt: new Date("2024-01-21T20:00:00Z"),
      durationSeconds: 212,
      viewCount: 2500000,
      likeCount: 125000,
      commentCount: 15000,
    },
    {
      youtubeVideoId: "9bZkp7q19f0", // Gangnam Style - another reliable public video
      title: "Sample Basketball Highlights",
      description: "Triple-double performance highlights.",
      channelTitle: "Basketball Channel",
      channelId: "UCwppdrjsBPAZg5_cUwQjfMQ",
      thumbnailUrl: "https://i.ytimg.com/vi/9bZkp7q19f0/maxresdefault.jpg",
      publishedAt: new Date("2024-01-20T03:00:00Z"),
      durationSeconds: 253,
      viewCount: 1800000,
      likeCount: 95000,
      commentCount: 8500,
    },
    {
      youtubeVideoId: "kJQP7kiw5Fk", // Despacito - another reliable public video
      title: "Sample Baseball Home Run",
      description: "Amazing home run from spring training.",
      channelTitle: "Baseball Today",
      channelId: "UCk1SpWNzOs4MYmr0uICEntg",
      thumbnailUrl: "https://i.ytimg.com/vi/kJQP7kiw5Fk/maxresdefault.jpg",
      publishedAt: new Date("2024-02-25T19:30:00Z"),
      durationSeconds: 282,
      viewCount: 3200000,
      likeCount: 210000,
      commentCount: 25000,
    },
    {
      youtubeVideoId: "JGwWNGJdvx8", // Ed Sheeran - another reliable video
      title: "Sample Betting Analysis Show",
      description: "Breaking down the odds and best bets.",
      channelTitle: "Betting Analysis",
      channelId: "UC0C-w0YjGpqDXGB8IHb662A",
      thumbnailUrl: "https://i.ytimg.com/vi/JGwWNGJdvx8/maxresdefault.jpg",
      publishedAt: new Date("2024-02-08T16:00:00Z"),
      durationSeconds: 263,
      viewCount: 450000,
      likeCount: 22000,
      commentCount: 3200,
    },
  ];

  const createdVideos = [];
  for (const video of sampleVideos) {
    const created = await prisma.youTubeVideo.upsert({
      where: {
        orgId_youtubeVideoId: {
          orgId: testOrg.id,
          youtubeVideoId: video.youtubeVideoId,
        },
      },
      update: {},
      create: {
        orgId: testOrg.id,
        ...video,
      },
    });
    createdVideos.push(created);
    console.log("Created video:", video.title);
  }

  // Create a sample query run
  const queryRun = await prisma.queryRun.create({
    data: {
      orgId: testOrg.id,
      queryDefinitionId: createdQueries[0].id,
      triggeredBy: "MANUAL",
      triggeredByUserId: testUser.id,
      status: "SUCCEEDED",
      videosFetched: 4,
      videosProcessed: 4,
      candidatesProduced: 4,
      progress: 100,
      startedAt: new Date(Date.now() - 300000), // 5 min ago
      finishedAt: new Date(),
    },
  });
  console.log("Created query run");

  // Create sample candidates with moments
  const candidateData = [
    {
      video: createdVideos[0],
      relevanceScore: 0.92,
      status: "SHORTLISTED" as const,
      aiSummary: "Patrick Mahomes delivers an iconic overtime touchdown against the Bills. This clip shows exceptional quarterback play under pressure.",
      whyRelevant: "Contains touchdown highlight with high engagement. Perfect for discussion segment on clutch performances.",
      moments: [
        { label: "Snap and Drop Back", startSeconds: 15, endSeconds: 20, confidence: 0.85, supportingQuote: "Mahomes takes the snap..." },
        { label: "Scramble", startSeconds: 20, endSeconds: 28, confidence: 0.92, supportingQuote: "He escapes the pressure..." },
        { label: "Touchdown Throw", startSeconds: 28, endSeconds: 35, confidence: 0.98, supportingQuote: "Touchdown Chiefs!" },
      ],
    },
    {
      video: createdVideos[1],
      relevanceScore: 0.78,
      status: "NEW" as const,
      aiSummary: "LeBron James records another triple-double in a classic matchup against the Celtics. Multiple highlight plays included.",
      whyRelevant: "High-profile player, major market matchup. Good for NBA segment.",
      moments: [
        { label: "Fast Break Dunk", startSeconds: 45, endSeconds: 52, confidence: 0.88, supportingQuote: "LeBron with authority!" },
        { label: "No-Look Pass", startSeconds: 180, endSeconds: 188, confidence: 0.91, supportingQuote: "What a pass by James!" },
      ],
    },
    {
      video: createdVideos[2],
      relevanceScore: 0.85,
      status: "NEW" as const,
      aiSummary: "Shohei Ohtani hits his first spring training home run with his new team. Great visual of the swing.",
      whyRelevant: "Major story with Ohtani's move to the Dodgers. High viewer interest expected.",
      moments: [
        { label: "Home Run", startSeconds: 55, endSeconds: 70, confidence: 0.95, supportingQuote: "That ball is gone!" },
      ],
    },
    {
      video: createdVideos[3],
      relevanceScore: 0.88,
      status: "DISMISSED" as const,
      aiSummary: "Comprehensive betting analysis for the Super Bowl covering spreads, over/unders, and player props.",
      whyRelevant: "Expert analysis relevant to sports betting segment.",
      moments: [
        { label: "Spread Analysis", startSeconds: 120, endSeconds: 300, confidence: 0.82, supportingQuote: "The line has moved..." },
        { label: "Best Bets", startSeconds: 900, endSeconds: 1100, confidence: 0.89, supportingQuote: "My top pick is..." },
      ],
    },
  ];

  for (const data of candidateData) {
    const candidate = await prisma.candidate.create({
      data: {
        orgId: testOrg.id,
        youtubeVideoId: data.video.id,
        queryDefinitionId: createdQueries[0].id,
        queryRunId: queryRun.id,
        relevanceScore: data.relevanceScore,
        status: data.status,
        aiSummary: data.aiSummary,
        whyRelevant: data.whyRelevant,
        entitiesJson: {},
      },
    });

    // Create moments for this candidate
    for (const moment of data.moments) {
      await prisma.candidateMoment.create({
        data: {
          orgId: testOrg.id,
          candidateId: candidate.id,
          label: moment.label,
          startSeconds: moment.startSeconds,
          endSeconds: moment.endSeconds,
          confidence: moment.confidence,
          supportingQuote: moment.supportingQuote,
        },
      });
    }
    console.log("Created candidate:", data.video.title);
  }

  // Create a sample log entry
  await prisma.logEntry.create({
    data: {
      orgId: testOrg.id,
      createdByUserId: testUser.id,
      sport: "NFL",
      title: "Great Mahomes clip",
      note: "This touchdown clip would be perfect for our Monday night segment. Make sure to highlight the scramble.",
      shared: false,
    },
  });
  console.log("Created sample log entry");

  console.log("Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
