import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sourceFetchQueue } from "@/lib/queue";
import { addMinutes, addDays, addHours } from "date-fns";
import type { ScheduleType } from "@prisma/client";

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // In development, allow without secret
  if (process.env.NODE_ENV === "development" && !cronSecret) {
    return true;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let processedSources = 0;

  try {
    // Find all sources due to fetch
    const dueSources = await prisma.source.findMany({
      where: {
        isScheduled: true,
        status: "ACTIVE",
        nextFetchAt: { lte: now },
      },
    });

    for (const source of dueSources) {
      // Check for existing running fetch
      const existingRun = await prisma.sourceFetchRun.findFirst({
        where: {
          sourceId: source.id,
          status: { in: ["QUEUED", "RUNNING"] },
        },
      });

      if (existingRun) {
        continue;
      }

      // Create fetch run record
      const fetchRun = await prisma.sourceFetchRun.create({
        data: {
          sourceId: source.id,
          status: "QUEUED",
          triggeredBy: "SCHEDULED",
          startedAt: now,
        },
      });

      // Queue the fetch job
      await sourceFetchQueue.add("scheduled-fetch", {
        sourceId: source.id,
        fetchRunId: fetchRun.id,
        orgId: source.orgId,
        triggeredBy: "SCHEDULED",
      });

      // Calculate next fetch time
      const nextFetchAt = calculateNextFetchTime(
        source.scheduleType,
        source.refreshInterval,
        source.scheduleCron
      );

      await prisma.source.update({
        where: { id: source.id },
        data: {
          nextFetchAt,
          lastScheduledAt: now,
        },
      });

      processedSources++;
    }

    return NextResponse.json({
      success: true,
      processedSources,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Source fetch cron error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

function calculateNextFetchTime(
  scheduleType: ScheduleType,
  refreshInterval: number,
  scheduleCron: string | null
): Date | null {
  const now = new Date();

  switch (scheduleType) {
    case "MANUAL":
      return null;

    case "HOURLY":
      return addMinutes(now, refreshInterval);

    case "DAILY":
      return addDays(now, 1);

    case "WEEKDAYS": {
      let next = addDays(now, 1);
      while (next.getDay() === 0 || next.getDay() === 6) {
        next = addDays(next, 1);
      }
      return next;
    }

    case "WEEKLY":
      return addDays(now, 7);

    case "CUSTOM":
      // Would use a cron parser here in production
      return addHours(now, 1);

    default:
      return addHours(now, 1);
  }
}
