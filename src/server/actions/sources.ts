"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant-prisma";
import { fetchSourceDirect } from "@/server/services/sources/fetch-source";
import { getAdapterOrThrow } from "@/server/services/sources";
import { addMinutes, addDays, addHours, subMinutes } from "date-fns";
import type { SourceType, SourceStatus, ScheduleType, Sport } from "@prisma/client";

// Validation schemas
const sourceConfigSchema = z.record(z.string(), z.unknown());

const createSourceSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum([
    "TWITTER_SEARCH",
    "TWITTER_LIST",
    "RSS_FEED",
    "WEBSITE_SCRAPE",
    "SPORTSGRID_API",
    "ESPN_API",
  ]),
  sport: z.enum(["NFL", "NBA", "MLB", "NHL", "SOCCER", "BOXING", "SPORTS_BETTING", "CBB", "CFB"]),
  config: sourceConfigSchema,
  isScheduled: z.boolean().default(true),
  scheduleType: z
    .enum(["MANUAL", "HOURLY", "DAILY", "WEEKDAYS", "WEEKLY", "CUSTOM"])
    .default("DAILY"),
  scheduleCron: z.string().optional(),
  scheduleTimezone: z.string().default("America/New_York"),
  refreshInterval: z.number().min(5).max(1440).default(60),
});

const updateSourceSchema = createSourceSchema.partial().extend({
  id: z.string(),
});

const scheduleSchema = z.object({
  isScheduled: z.boolean(),
  scheduleType: z.enum(["MANUAL", "HOURLY", "DAILY", "WEEKDAYS", "WEEKLY", "CUSTOM"]),
  scheduleCron: z.string().optional(),
  scheduleTimezone: z.string(),
  refreshInterval: z.number().min(5).max(1440),
});

/**
 * Create a new source.
 */
export async function createSource(formData: FormData) {
  const { orgId, userId } = await getTenantContext();

  const data = createSourceSchema.parse({
    name: formData.get("name"),
    type: formData.get("type"),
    sport: formData.get("sport"),
    config: JSON.parse(formData.get("config") as string || "{}"),
    isScheduled: formData.get("isScheduled") === "true",
    scheduleType: formData.get("scheduleType") || "DAILY",
    scheduleCron: formData.get("scheduleCron") || undefined,
    scheduleTimezone: formData.get("scheduleTimezone") || "America/New_York",
    refreshInterval: parseInt(formData.get("refreshInterval") as string || "60", 10),
  });

  // Validate config with adapter
  const adapter = await getAdapterOrThrow(data.type as SourceType);
  const validationResult = adapter.validateConfig(data.config);

  if (!validationResult.valid) {
    throw new Error(`Invalid configuration: ${validationResult.errors.join(", ")}`);
  }

  // Calculate next fetch time
  const nextFetchAt = calculateNextFetchTime(
    data.scheduleType as ScheduleType,
    data.refreshInterval,
    data.scheduleCron
  );

  const source = await prisma.source.create({
    data: {
      orgId,
      name: data.name,
      type: data.type as SourceType,
      sport: data.sport as Sport,
      config: data.config as object,
      isScheduled: data.isScheduled,
      scheduleType: data.scheduleType as ScheduleType,
      scheduleCron: data.scheduleCron,
      scheduleTimezone: data.scheduleTimezone,
      refreshInterval: data.refreshInterval,
      nextFetchAt,
    },
  });

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "QUERY_CREATED",
      entityType: "Source",
      entityId: source.id,
      action: `Created source: "${data.name}" (${data.type})`,
    },
  });

  revalidatePath("/admin/sources");

  return { success: true, sourceId: source.id };
}

/**
 * Update a source.
 */
export async function updateSource(formData: FormData) {
  const { orgId, userId } = await getTenantContext();

  const data = updateSourceSchema.parse({
    id: formData.get("id"),
    name: formData.get("name") || undefined,
    type: formData.get("type") || undefined,
    sport: formData.get("sport") || undefined,
    config: formData.get("config") ? JSON.parse(formData.get("config") as string) : undefined,
    isScheduled: formData.has("isScheduled") ? formData.get("isScheduled") === "true" : undefined,
    scheduleType: formData.get("scheduleType") || undefined,
    scheduleCron: formData.get("scheduleCron") || undefined,
    scheduleTimezone: formData.get("scheduleTimezone") || undefined,
    refreshInterval: formData.get("refreshInterval")
      ? parseInt(formData.get("refreshInterval") as string, 10)
      : undefined,
  });

  const { id, ...updateData } = data;

  // Verify source belongs to org
  const existing = await prisma.source.findFirst({
    where: { id, orgId },
  });

  if (!existing) {
    throw new Error("Source not found");
  }

  // Validate config if provided
  if (updateData.config && updateData.type) {
    const adapter = await getAdapterOrThrow(updateData.type as SourceType);
    const validationResult = adapter.validateConfig(updateData.config);

    if (!validationResult.valid) {
      throw new Error(`Invalid configuration: ${validationResult.errors.join(", ")}`);
    }
  }

  // Calculate next fetch time if schedule changed
  let nextFetchAt: Date | null | undefined;
  if (
    updateData.scheduleType !== undefined ||
    updateData.refreshInterval !== undefined ||
    updateData.isScheduled !== undefined
  ) {
    const scheduleType = (updateData.scheduleType || existing.scheduleType) as ScheduleType;
    const refreshInterval = updateData.refreshInterval ?? existing.refreshInterval;
    const scheduleCron = updateData.scheduleCron ?? existing.scheduleCron;
    const isScheduled = updateData.isScheduled ?? existing.isScheduled;

    nextFetchAt = isScheduled
      ? calculateNextFetchTime(scheduleType, refreshInterval, scheduleCron)
      : null;
  }

  const source = await prisma.source.update({
    where: { id },
    data: {
      ...updateData,
      ...(updateData.config ? { config: updateData.config as object } : {}),
      ...(nextFetchAt !== undefined ? { nextFetchAt } : {}),
    },
  });

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "QUERY_UPDATED",
      entityType: "Source",
      entityId: id,
      action: `Updated source: "${source.name}"`,
    },
  });

  revalidatePath("/admin/sources");
  revalidatePath(`/admin/sources/${id}`);

  return { success: true };
}

/**
 * Delete a source.
 */
export async function deleteSource(sourceId: string) {
  const { orgId, userId } = await getTenantContext();

  const source = await prisma.source.findFirst({
    where: { id: sourceId, orgId },
  });

  if (!source) {
    throw new Error("Source not found");
  }

  // Delete source (cascade deletes related records)
  await prisma.source.delete({
    where: { id: sourceId },
  });

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "QUERY_DELETED",
      entityType: "Source",
      entityId: sourceId,
      action: `Deleted source: "${source.name}"`,
    },
  });

  revalidatePath("/admin/sources");

  return { success: true };
}

/**
 * Toggle source status (active/paused).
 */
export async function toggleSourceStatus(sourceId: string, status: SourceStatus) {
  const { orgId, userId } = await getTenantContext();

  const source = await prisma.source.findFirst({
    where: { id: sourceId, orgId },
  });

  if (!source) {
    throw new Error("Source not found");
  }

  await prisma.source.update({
    where: { id: sourceId },
    data: { status },
  });

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "QUERY_UPDATED",
      entityType: "Source",
      entityId: sourceId,
      action: `Changed source status to ${status}: "${source.name}"`,
    },
  });

  revalidatePath("/admin/sources");
  revalidatePath(`/admin/sources/${sourceId}`);

  return { success: true };
}

/**
 * Run a source now (manual trigger).
 */
export async function runSourceNow(sourceId: string) {
  const { orgId, userId } = await getTenantContext();

  const source = await prisma.source.findFirst({
    where: { id: sourceId, orgId },
  });

  if (!source) {
    throw new Error("Source not found");
  }

  // Check cooldown (1 minute minimum between manual runs)
  const recentRun = await prisma.sourceFetchRun.findFirst({
    where: {
      sourceId,
      createdAt: { gte: subMinutes(new Date(), 1) },
    },
  });

  if (recentRun) {
    throw new Error("Please wait at least 1 minute between manual runs");
  }

  // Create fetch run record
  const fetchRun = await prisma.sourceFetchRun.create({
    data: {
      sourceId,
      status: "QUEUED",
      triggeredBy: "MANUAL",
      startedAt: new Date(),
    },
  });

  // Run fetch directly (serverless-compatible)
  // Don't await - let it run in the background
  fetchSourceDirect(sourceId).catch((error) => {
    console.error(`Manual fetch failed for source ${sourceId}:`, error);
  });

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "QUERY_RUN_STARTED",
      entityType: "SourceFetchRun",
      entityId: fetchRun.id,
      action: `Manually triggered fetch for "${source.name}"`,
    },
  });

  revalidatePath("/admin/sources");
  revalidatePath(`/admin/sources/${sourceId}`);

  return { success: true, fetchRunId: fetchRun.id };
}

/**
 * Update source schedule settings.
 */
export async function updateSourceSchedule(sourceId: string, schedule: FormData) {
  const { orgId, userId } = await getTenantContext();

  const data = scheduleSchema.parse({
    isScheduled: schedule.get("isScheduled") === "true",
    scheduleType: schedule.get("scheduleType"),
    scheduleCron: schedule.get("scheduleCron") || undefined,
    scheduleTimezone: schedule.get("scheduleTimezone"),
    refreshInterval: parseInt(schedule.get("refreshInterval") as string, 10),
  });

  const source = await prisma.source.findFirst({
    where: { id: sourceId, orgId },
  });

  if (!source) {
    throw new Error("Source not found");
  }

  // Calculate next fetch time
  const nextFetchAt = data.isScheduled
    ? calculateNextFetchTime(
        data.scheduleType as ScheduleType,
        data.refreshInterval,
        data.scheduleCron
      )
    : null;

  await prisma.source.update({
    where: { id: sourceId },
    data: {
      ...data,
      nextFetchAt,
    },
  });

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "QUERY_UPDATED",
      entityType: "Source",
      entityId: sourceId,
      action: `Updated schedule for "${source.name}"`,
    },
  });

  revalidatePath("/admin/sources");
  revalidatePath(`/admin/sources/${sourceId}`);

  return { success: true };
}

/**
 * Get all sources for the organization.
 */
export async function getSources() {
  const { orgId } = await getTenantContext();

  return prisma.source.findMany({
    where: { orgId },
    include: {
      _count: {
        select: {
          newsItems: true,
          fetchRuns: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get a single source with fetch history.
 */
export async function getSource(sourceId: string) {
  const { orgId } = await getTenantContext();

  const source = await prisma.source.findFirst({
    where: { id: sourceId, orgId },
    include: {
      fetchRuns: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      _count: {
        select: {
          newsItems: true,
        },
      },
    },
  });

  if (!source) {
    throw new Error("Source not found");
  }

  return source;
}

/**
 * Get source health stats.
 */
export async function getSourceHealthStats() {
  const { orgId } = await getTenantContext();

  const [total, active, paused, error, rateLimited, recentSuccess, recentFailure] =
    await Promise.all([
      prisma.source.count({ where: { orgId } }),
      prisma.source.count({ where: { orgId, status: "ACTIVE" } }),
      prisma.source.count({ where: { orgId, status: "PAUSED" } }),
      prisma.source.count({ where: { orgId, status: "ERROR" } }),
      prisma.source.count({ where: { orgId, status: "RATE_LIMITED" } }),
      prisma.sourceFetchRun.count({
        where: {
          source: { orgId },
          status: "SUCCEEDED",
          createdAt: { gte: subMinutes(new Date(), 60 * 24) }, // Last 24 hours
        },
      }),
      prisma.sourceFetchRun.count({
        where: {
          source: { orgId },
          status: "FAILED",
          createdAt: { gte: subMinutes(new Date(), 60 * 24) },
        },
      }),
    ]);

  const successRate =
    recentSuccess + recentFailure > 0
      ? (recentSuccess / (recentSuccess + recentFailure)) * 100
      : 100;

  return {
    total,
    active,
    paused,
    error,
    rateLimited,
    recentSuccess,
    recentFailure,
    successRate: Math.round(successRate),
  };
}

/**
 * Get next scheduled fetches for dashboard.
 */
export async function getNextScheduledFetches(limit: number = 5) {
  const { orgId } = await getTenantContext();

  return prisma.source.findMany({
    where: {
      orgId,
      isScheduled: true,
      status: "ACTIVE",
      nextFetchAt: { not: null },
    },
    select: {
      id: true,
      name: true,
      type: true,
      sport: true,
      nextFetchAt: true,
    },
    orderBy: { nextFetchAt: "asc" },
    take: limit,
  });
}

/**
 * Calculate next fetch time based on schedule settings.
 */
function calculateNextFetchTime(
  scheduleType: ScheduleType,
  refreshInterval: number,
  scheduleCron: string | null | undefined
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
