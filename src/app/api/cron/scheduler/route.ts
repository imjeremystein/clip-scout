import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { queryRunQueue } from "@/lib/queue";
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
  let processedQueries = 0;

  try {
    // Find all queries due to run
    const dueQueries = await prisma.queryDefinition.findMany({
      where: {
        isScheduled: true,
        deletedAt: null,
        nextRunAt: { lte: now },
      },
      include: {
        org: { select: { id: true } },
      },
    });

    for (const query of dueQueries) {
      // Check for existing running query
      const existingRun = await prisma.queryRun.findFirst({
        where: {
          queryDefinitionId: query.id,
          status: { in: ["QUEUED", "RUNNING"] },
        },
      });

      if (existingRun) {
        continue;
      }

      // Create a new query run
      const run = await prisma.queryRun.create({
        data: {
          queryDefinitionId: query.id,
          orgId: query.orgId,
          triggeredByUserId: query.createdByUserId,
          status: "QUEUED",
          triggeredBy: "SCHEDULED",
        },
      });

      // Queue the job
      await queryRunQueue.add("scheduled-query", {
        runId: run.id,
        queryId: query.id,
        orgId: query.orgId,
      });

      // Calculate next run time
      const nextRunAt = calculateNextRunTime(query.scheduleType, query.scheduleCron);

      await prisma.queryDefinition.update({
        where: { id: query.id },
        data: {
          nextRunAt,
          lastRunAt: now,
        },
      });

      processedQueries++;
    }

    return NextResponse.json({
      success: true,
      processedQueries,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Scheduler cron error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

function calculateNextRunTime(
  scheduleType: ScheduleType,
  scheduleCron: string | null
): Date | null {
  const now = new Date();

  switch (scheduleType) {
    case "MANUAL":
      return null;

    case "HOURLY":
      return addHours(now, 1);

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
