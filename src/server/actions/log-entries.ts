"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant-prisma";
import { Sport } from "@prisma/client";

/**
 * Create a new log entry
 */
export async function createLogEntry(data: {
  title: string;
  note: string;
  sport?: Sport;
  candidateId?: string;
  youtubeUrl?: string;
  shared?: boolean;
}) {
  const { orgId, userId } = await getTenantContext();

  // If candidateId provided, verify it belongs to org
  if (data.candidateId) {
    const candidate = await prisma.candidate.findFirst({
      where: {
        id: data.candidateId,
        orgId,
        deletedAt: null,
      },
    });
    if (!candidate) {
      throw new Error("Candidate not found");
    }
  }

  const entry = await prisma.logEntry.create({
    data: {
      orgId,
      createdByUserId: userId,
      title: data.title,
      note: data.note,
      sport: data.sport,
      candidateId: data.candidateId,
      youtubeUrl: data.youtubeUrl,
      shared: data.shared ?? false,
    },
  });

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "LOG_ENTRY_CREATED",
      entityType: "LogEntry",
      entityId: entry.id,
      action: `Created log entry: ${data.title}`,
    },
  });

  if (data.candidateId) {
    revalidatePath(`/candidates/${data.candidateId}`);
  }
  revalidatePath("/logs");

  return { success: true, entry };
}

/**
 * Update a log entry
 */
export async function updateLogEntry(
  logEntryId: string,
  data: {
    title?: string;
    note?: string;
    sport?: Sport;
    youtubeUrl?: string;
    shared?: boolean;
  }
) {
  const { orgId, userId } = await getTenantContext();

  const entry = await prisma.logEntry.findFirst({
    where: {
      id: logEntryId,
      orgId,
      deletedAt: null,
    },
  });

  if (!entry) {
    throw new Error("Log entry not found");
  }

  const updated = await prisma.logEntry.update({
    where: { id: logEntryId },
    data: {
      title: data.title,
      note: data.note,
      sport: data.sport,
      youtubeUrl: data.youtubeUrl,
      shared: data.shared,
    },
  });

  if (entry.candidateId) {
    revalidatePath(`/candidates/${entry.candidateId}`);
  }
  revalidatePath("/logs");

  return { success: true, entry: updated };
}

/**
 * Delete a log entry (soft delete)
 */
export async function deleteLogEntry(logEntryId: string) {
  const { orgId, userId } = await getTenantContext();

  const entry = await prisma.logEntry.findFirst({
    where: {
      id: logEntryId,
      orgId,
      deletedAt: null,
    },
  });

  if (!entry) {
    throw new Error("Log entry not found");
  }

  await prisma.logEntry.update({
    where: { id: logEntryId },
    data: { deletedAt: new Date() },
  });

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "LOG_ENTRY_DELETED",
      entityType: "LogEntry",
      entityId: logEntryId,
      action: "Deleted log entry",
    },
  });

  if (entry.candidateId) {
    revalidatePath(`/candidates/${entry.candidateId}`);
  }
  revalidatePath("/logs");

  return { success: true };
}

/**
 * Get log entries for the organization
 */
export async function getLogEntries(options?: {
  sport?: Sport;
  candidateId?: string;
  limit?: number;
  offset?: number;
}) {
  const { orgId } = await getTenantContext();

  const entries = await prisma.logEntry.findMany({
    where: {
      orgId,
      deletedAt: null,
      ...(options?.sport && { sport: options.sport }),
      ...(options?.candidateId && { candidateId: options.candidateId }),
    },
    include: {
      createdByUser: {
        select: { name: true, email: true },
      },
      candidate: {
        select: {
          id: true,
          video: {
            select: { title: true, youtubeVideoId: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
  });

  return entries;
}
