"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant-prisma";
import { ExportFormat } from "@prisma/client";

/**
 * Request an export of shortlisted candidates
 */
export async function requestExport(data: {
  candidateIds: string[];
  format: ExportFormat;
}) {
  const { orgId, userId } = await getTenantContext();

  if (data.candidateIds.length === 0) {
    throw new Error("No candidates selected for export");
  }

  // Verify all candidates belong to org
  const candidates = await prisma.candidate.findMany({
    where: {
      id: { in: data.candidateIds },
      orgId,
      deletedAt: null,
    },
  });

  if (candidates.length !== data.candidateIds.length) {
    throw new Error("Some candidates not found");
  }

  // Create export job
  const exportJob = await prisma.exportJob.create({
    data: {
      orgId,
      requestedByUserId: userId,
      format: data.format,
      exportType: "CANDIDATES",
      candidateIds: data.candidateIds,
      status: "PENDING",
    },
  });

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "EXPORT_STARTED",
      entityType: "ExportJob",
      entityId: exportJob.id,
      action: "Started export for " + data.candidateIds.length + " candidates",
    },
  });

  // Process export immediately (synchronous for MVP)
  await processExport(exportJob.id);

  revalidatePath("/exports");

  return { success: true, exportId: exportJob.id };
}

/**
 * Process an export job - generates the file
 */
async function processExport(exportJobId: string) {
  const exportJob = await prisma.exportJob.findUnique({
    where: { id: exportJobId },
    include: {
      org: { select: { name: true } },
    },
  });

  if (!exportJob) {
    throw new Error("Export job not found");
  }

  try {
    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: { status: "PROCESSING" },
    });

    // Fetch full candidate data
    const candidates = await prisma.candidate.findMany({
      where: {
        id: { in: exportJob.candidateIds as string[] },
        orgId: exportJob.orgId,
        deletedAt: null,
      },
      include: {
        video: true,
        queryDefinition: {
          select: { name: true, sport: true },
        },
        moments: {
          orderBy: { startSeconds: "asc" },
        },
      },
    });

    let fileContent: string;
    let fileName: string;

    if (exportJob.format === "JSON") {
      fileContent = generateJsonExport(candidates, exportJob.org.name);
      fileName = "clip-scout-export-" + Date.now() + ".json";
    } else {
      fileContent = generateCsvExport(candidates);
      fileName = "clip-scout-export-" + Date.now() + ".csv";
    }

    // Store in database as base64
    const fileData = Buffer.from(fileContent).toString("base64");

    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        fileName,
        fileData,
        recordCount: candidates.length,
      },
    });

    // Audit
    await prisma.auditEvent.create({
      data: {
        orgId: exportJob.orgId,
        actorUserId: exportJob.requestedByUserId,
        eventType: "EXPORT_COMPLETED",
        entityType: "ExportJob",
        entityId: exportJobId,
        action: "Export completed: " + candidates.length + " candidates",
      },
    });
  } catch (error) {
    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });
    throw error;
  }
}

interface ExportCandidate {
  id: string;
  status: string;
  relevanceScore: number;
  aiSummary: string | null;
  whyRelevant: string | null;
  video: {
    title: string;
    youtubeVideoId: string;
    channelTitle: string;
    publishedAt: Date;
    durationSeconds: number | null;
    viewCount: number | null;
    likeCount: number | null;
  };
  queryDefinition: {
    name: string;
    sport: string;
  };
  moments: {
    label: string;
    startSeconds: number;
    endSeconds: number;
    confidence: number;
    supportingQuote: string | null;
  }[];
}

function generateJsonExport(candidates: ExportCandidate[], orgName: string): string {
  const exportData = {
    exportedAt: new Date().toISOString(),
    organization: orgName,
    candidateCount: candidates.length,
    candidates: candidates.map((c) => ({
      id: c.id,
      status: c.status,
      relevanceScore: Math.round(c.relevanceScore * 100) + "%",
      video: {
        title: c.video.title,
        youtubeUrl: "https://www.youtube.com/watch?v=" + c.video.youtubeVideoId,
        channel: c.video.channelTitle,
        publishedAt: c.video.publishedAt.toISOString(),
        duration: formatDuration(c.video.durationSeconds),
        views: c.video.viewCount,
        likes: c.video.likeCount,
      },
      query: {
        name: c.queryDefinition.name,
        sport: c.queryDefinition.sport,
      },
      aiInsights: {
        summary: c.aiSummary,
        whyRelevant: c.whyRelevant,
      },
      keyMoments: c.moments.map((m) => ({
        label: m.label,
        timestamp: formatDuration(m.startSeconds) + " - " + formatDuration(m.endSeconds),
        startSeconds: m.startSeconds,
        endSeconds: m.endSeconds,
        confidence: Math.round(m.confidence * 100) + "%",
        quote: m.supportingQuote,
      })),
    })),
  };

  return JSON.stringify(exportData, null, 2);
}

function generateCsvExport(candidates: ExportCandidate[]): string {
  const headers = [
    "ID",
    "Status",
    "Relevance Score",
    "Video Title",
    "YouTube URL",
    "Channel",
    "Published At",
    "Duration",
    "Views",
    "Likes",
    "Query Name",
    "Sport",
    "AI Summary",
    "Why Relevant",
    "Key Moments",
  ];

  const rows = candidates.map((c) => {
    const momentsStr = c.moments
      .map((m) => m.label + " (" + formatDuration(m.startSeconds) + ")")
      .join("; ");

    return [
      c.id,
      c.status,
      Math.round(c.relevanceScore * 100) + "%",
      escapeCsvValue(c.video.title),
      "https://www.youtube.com/watch?v=" + c.video.youtubeVideoId,
      escapeCsvValue(c.video.channelTitle),
      c.video.publishedAt.toISOString(),
      formatDuration(c.video.durationSeconds),
      c.video.viewCount?.toString() || "",
      c.video.likeCount?.toString() || "",
      escapeCsvValue(c.queryDefinition.name),
      c.queryDefinition.sport,
      escapeCsvValue(c.aiSummary || ""),
      escapeCsvValue(c.whyRelevant || ""),
      escapeCsvValue(momentsStr),
    ];
  });

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  return csvContent;
}

function escapeCsvValue(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins + ":" + secs.toString().padStart(2, "0");
}

/**
 * Get export job status
 */
export async function getExportJob(exportJobId: string) {
  const { orgId } = await getTenantContext();

  const job = await prisma.exportJob.findFirst({
    where: {
      id: exportJobId,
      orgId,
    },
  });

  if (!job) {
    throw new Error("Export job not found");
  }

  return {
    id: job.id,
    status: job.status,
    format: job.format,
    fileName: job.fileName,
    recordCount: job.recordCount,
    errorMessage: job.errorMessage,
    completedAt: job.completedAt,
  };
}

/**
 * Get list of exports
 */
export async function getExports(limit = 20) {
  const { orgId } = await getTenantContext();

  const exports = await prisma.exportJob.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      requestedByUser: {
        select: { name: true, email: true },
      },
    },
  });

  return exports;
}
