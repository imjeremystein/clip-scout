"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant-prisma";

// Lazy import to avoid Redis connection at module load time (for serverless)
async function getQueryRunQueue() {
  const { queryRunQueue } = await import("@/lib/queue");
  return queryRunQueue;
}

interface QueryRunJobData {
  queryRunId: string;
  queryDefinitionId: string;
  orgId: string;
  triggeredBy: "MANUAL" | "SCHEDULED" | "SYSTEM";
  triggeredByUserId?: string;
}

// Schema for creating/updating a query definition
const queryDefinitionSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(1000).optional(),
  sport: z.enum(["NFL", "NBA", "MLB", "NHL", "SOCCER", "BOXING", "SPORTS_BETTING", "CBB", "CFB"]),
  keywords: z.array(z.string()).min(1).max(20),
  recencyDays: z.number().min(1).max(365).default(7),
  channelIds: z.array(z.string()).optional(),
  maxResults: z.number().min(10).max(500).default(100),
  isScheduled: z.boolean().default(false),
  scheduleType: z.enum(["MANUAL", "DAILY", "WEEKDAYS", "WEEKLY", "CUSTOM"]).default("MANUAL"),
  scheduleCron: z.string().optional(),
  scheduleTimezone: z.string().default("America/New_York"),
  scheduleTime: z.string().optional(), // HH:MM format for UI
  scheduleDayOfWeek: z.number().min(0).max(6).optional(), // 0 = Sunday
});

// Calculate next run time based on schedule settings
function calculateNextRunAt(
  scheduleType: string,
  scheduleTime?: string,
  scheduleDayOfWeek?: number,
  timezone = "America/New_York"
): Date | null {
  if (scheduleType === "MANUAL") return null;

  const now = new Date();
  const [hours, minutes] = (scheduleTime || "06:00").split(":").map(Number);

  // Create date in the target timezone (simplified - in production use a proper timezone library)
  const nextRun = new Date(now);
  nextRun.setHours(hours, minutes, 0, 0);

  // If time has passed today, move to next eligible day
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  switch (scheduleType) {
    case "DAILY":
      // Already set to next occurrence
      break;

    case "WEEKDAYS":
      // Move to next weekday
      while (nextRun.getDay() === 0 || nextRun.getDay() === 6) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      break;

    case "WEEKLY":
      // Move to specific day of week
      const targetDay = scheduleDayOfWeek ?? 1; // Default to Monday
      while (nextRun.getDay() !== targetDay) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      break;

    case "CUSTOM":
      // For custom cron, this would need a cron parser
      // For now, default to next day at specified time
      break;
  }

  return nextRun;
}

// Generate cron expression from schedule settings
function generateCronExpression(
  scheduleType: string,
  scheduleTime?: string,
  scheduleDayOfWeek?: number
): string | null {
  if (scheduleType === "MANUAL") return null;

  const [hours, minutes] = (scheduleTime || "06:00").split(":").map(Number);

  switch (scheduleType) {
    case "DAILY":
      return `${minutes} ${hours} * * *`;

    case "WEEKDAYS":
      return `${minutes} ${hours} * * 1-5`;

    case "WEEKLY":
      const day = scheduleDayOfWeek ?? 1;
      return `${minutes} ${hours} * * ${day}`;

    case "CUSTOM":
      return null; // Will be set directly

    default:
      return null;
  }
}

/**
 * Create a new query definition
 */
export async function createQueryDefinition(formData: FormData) {
  const { orgId, userId } = await getTenantContext();

  // Parse form data
  const keywordsRaw = formData.get("keywords") as string;
  const keywords = keywordsRaw
    ? keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean)
    : [];

  const channelIdsRaw = formData.get("channelIds") as string;
  const channelIds = channelIdsRaw
    ? channelIdsRaw.split(",").map((c) => c.trim()).filter(Boolean)
    : [];

  const scheduleTime = formData.get("scheduleTime") as string | null;
  const scheduleDayOfWeek = formData.get("scheduleDayOfWeek")
    ? parseInt(formData.get("scheduleDayOfWeek") as string, 10)
    : undefined;

  const data = queryDefinitionSchema.parse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    sport: formData.get("sport"),
    keywords,
    recencyDays: parseInt(formData.get("recencyDays") as string, 10) || 7,
    channelIds: channelIds.length > 0 ? channelIds : undefined,
    maxResults: parseInt(formData.get("maxResults") as string, 10) || 100,
    isScheduled: formData.get("isScheduled") === "true",
    scheduleType: formData.get("scheduleType") || "MANUAL",
    scheduleCron: formData.get("scheduleCron") || undefined,
    scheduleTimezone: formData.get("scheduleTimezone") || "America/New_York",
    scheduleTime: scheduleTime || undefined,
    scheduleDayOfWeek,
  });

  // Calculate schedule values
  const scheduleCron =
    data.scheduleCron ||
    generateCronExpression(data.scheduleType, scheduleTime, scheduleDayOfWeek);
  const nextRunAt = data.isScheduled
    ? calculateNextRunAt(data.scheduleType, scheduleTime, scheduleDayOfWeek, data.scheduleTimezone)
    : null;

  const queryDef = await prisma.$transaction(async (tx) => {
    const newQuery = await tx.queryDefinition.create({
      data: {
        orgId,
        name: data.name,
        description: data.description,
        sport: data.sport,
        keywords: data.keywords,
        recencyDays: data.recencyDays,
        channelIds: data.channelIds || [],
        maxResults: data.maxResults,
        isScheduled: data.isScheduled,
        scheduleType: data.scheduleType,
        scheduleCron,
        scheduleTimezone: data.scheduleTimezone,
        nextRunAt,
        isActive: true,
        createdByUserId: userId,
      },
    });

    await tx.auditEvent.create({
      data: {
        orgId,
        actorUserId: userId,
        eventType: "QUERY_CREATED",
        entityType: "QueryDefinition",
        entityId: newQuery.id,
        action: `Created query "${data.name}"`,
        meta: { sport: data.sport, keywords: data.keywords },
      },
    });

    return newQuery;
  });

  // Optionally run immediately (non-blocking - don't fail query creation if queue fails)
  if (formData.get("runImmediately") === "true") {
    try {
      await startQueryRun(queryDef.id);
    } catch (error) {
      console.error("Failed to start immediate query run:", error);
      // Continue anyway - the query was created successfully
    }
  }

  revalidatePath("/queries");
  revalidatePath("/dashboard");
  redirect(`/queries/${queryDef.id}`);
}

/**
 * Update an existing query definition
 */
export async function updateQueryDefinition(queryId: string, formData: FormData) {
  const { orgId, userId } = await getTenantContext();

  // Verify ownership
  const existing = await prisma.queryDefinition.findFirst({
    where: { id: queryId, orgId, deletedAt: null },
  });

  if (!existing) {
    throw new Error("Query not found");
  }

  // Parse form data
  const keywordsRaw = formData.get("keywords") as string;
  const keywords = keywordsRaw
    ? keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean)
    : [];

  const channelIdsRaw = formData.get("channelIds") as string;
  const channelIds = channelIdsRaw
    ? channelIdsRaw.split(",").map((c) => c.trim()).filter(Boolean)
    : [];

  const scheduleTime = formData.get("scheduleTime") as string | null;
  const scheduleDayOfWeek = formData.get("scheduleDayOfWeek")
    ? parseInt(formData.get("scheduleDayOfWeek") as string, 10)
    : undefined;

  const data = queryDefinitionSchema.parse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    sport: formData.get("sport"),
    keywords,
    recencyDays: parseInt(formData.get("recencyDays") as string, 10) || 7,
    channelIds: channelIds.length > 0 ? channelIds : undefined,
    maxResults: parseInt(formData.get("maxResults") as string, 10) || 100,
    isScheduled: formData.get("isScheduled") === "true",
    scheduleType: formData.get("scheduleType") || "MANUAL",
    scheduleCron: formData.get("scheduleCron") || undefined,
    scheduleTimezone: formData.get("scheduleTimezone") || "America/New_York",
    scheduleTime: scheduleTime || undefined,
    scheduleDayOfWeek,
  });

  // Calculate schedule values
  const scheduleCron =
    data.scheduleCron ||
    generateCronExpression(data.scheduleType, scheduleTime, scheduleDayOfWeek);
  const nextRunAt = data.isScheduled
    ? calculateNextRunAt(data.scheduleType, scheduleTime, scheduleDayOfWeek, data.scheduleTimezone)
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.queryDefinition.update({
      where: { id: queryId },
      data: {
        name: data.name,
        description: data.description,
        sport: data.sport,
        keywords: data.keywords,
        recencyDays: data.recencyDays,
        channelIds: data.channelIds || [],
        maxResults: data.maxResults,
        isScheduled: data.isScheduled,
        scheduleType: data.scheduleType,
        scheduleCron,
        scheduleTimezone: data.scheduleTimezone,
        nextRunAt,
      },
    });

    await tx.auditEvent.create({
      data: {
        orgId,
        actorUserId: userId,
        eventType: "QUERY_UPDATED",
        entityType: "QueryDefinition",
        entityId: queryId,
        action: `Updated query "${data.name}"`,
      },
    });
  });

  revalidatePath("/queries");
  revalidatePath(`/queries/${queryId}`);
  revalidatePath("/dashboard");

  return { success: true };
}

/**
 * Delete a query definition (soft delete)
 */
export async function deleteQueryDefinition(queryId: string) {
  const { orgId, userId } = await getTenantContext();

  const existing = await prisma.queryDefinition.findFirst({
    where: { id: queryId, orgId, deletedAt: null },
  });

  if (!existing) {
    throw new Error("Query not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.queryDefinition.update({
      where: { id: queryId },
      data: {
        deletedAt: new Date(),
        isActive: false,
        isScheduled: false,
      },
    });

    await tx.auditEvent.create({
      data: {
        orgId,
        actorUserId: userId,
        eventType: "QUERY_DELETED",
        entityType: "QueryDefinition",
        entityId: queryId,
        action: `Deleted query "${existing.name}"`,
      },
    });
  });

  revalidatePath("/queries");
  revalidatePath("/dashboard");
  redirect("/queries");
}

/**
 * Start a query run (manual trigger)
 */
export async function startQueryRun(queryDefId: string) {
  const { orgId, userId } = await getTenantContext();

  const queryDef = await prisma.queryDefinition.findFirst({
    where: { id: queryDefId, orgId, deletedAt: null },
  });

  if (!queryDef) {
    throw new Error("Query not found");
  }

  // Check for cooldown (prevent spam)
  const recentRun = await prisma.queryRun.findFirst({
    where: {
      queryDefinitionId: queryDefId,
      createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) }, // 15 minutes
      status: { in: ["QUEUED", "RUNNING"] },
    },
  });

  if (recentRun) {
    throw new Error("A run is already in progress or was started recently. Please wait.");
  }

  // Create the run record
  const queryRun = await prisma.queryRun.create({
    data: {
      orgId,
      queryDefinitionId: queryDefId,
      status: "QUEUED",
      triggeredBy: "MANUAL",
      triggeredByUserId: userId,
    },
  });

  // Queue the job
  const jobData: QueryRunJobData = {
    queryRunId: queryRun.id,
    queryDefinitionId: queryDefId,
    orgId,
    triggeredBy: "MANUAL",
    triggeredByUserId: userId,
  };

  // Queue the job (will fail silently if Redis not available in serverless)
  try {
    const queue = await getQueryRunQueue();
    await queue.add("run-query", jobData, {
      jobId: queryRun.id,
    });
  } catch (error) {
    console.warn("Could not queue job (Redis may not be available):", error);
    // Mark run as failed if we can't queue it
    await prisma.queryRun.update({
      where: { id: queryRun.id },
      data: {
        status: "FAILED",
        errorMessage: "Queue unavailable - Redis not configured for serverless environment"
      },
    });
  }

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "QUERY_RUN_STARTED",
      entityType: "QueryRun",
      entityId: queryRun.id,
      action: `Started run for "${queryDef.name}"`,
    },
  });

  revalidatePath("/runs");
  revalidatePath(`/queries/${queryDefId}`);
  revalidatePath("/dashboard");

  return { runId: queryRun.id };
}

/**
 * Toggle query active status
 */
export async function toggleQueryActive(queryId: string, isActive: boolean) {
  const { orgId, userId } = await getTenantContext();

  const existing = await prisma.queryDefinition.findFirst({
    where: { id: queryId, orgId, deletedAt: null },
  });

  if (!existing) {
    throw new Error("Query not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.queryDefinition.update({
      where: { id: queryId },
      data: { isActive },
    });

    await tx.auditEvent.create({
      data: {
        orgId,
        actorUserId: userId,
        eventType: "QUERY_UPDATED",
        entityType: "QueryDefinition",
        entityId: queryId,
        action: `${isActive ? "Activated" : "Deactivated"} query "${existing.name}"`,
      },
    });
  });

  revalidatePath("/queries");
  revalidatePath(`/queries/${queryId}`);

  return { success: true };
}

/**
 * Get query run status
 */
export async function getQueryRunStatus(runId: string) {
  const { orgId } = await getTenantContext();

  const run = await prisma.queryRun.findFirst({
    where: { id: runId, orgId },
    include: {
      queryDefinition: {
        select: { name: true, sport: true },
      },
    },
  });

  if (!run) {
    throw new Error("Run not found");
  }

  return run;
}
