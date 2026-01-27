"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant-prisma";

/**
 * Update candidate status (shortlist/dismiss)
 */
export async function updateCandidateStatus(
  candidateId: string,
  status: "NEW" | "SHORTLISTED" | "DISMISSED" | "EXPORTED"
) {
  const { orgId, userId } = await getTenantContext();

  const candidate = await prisma.candidate.findFirst({
    where: {
      id: candidateId,
      orgId,
      deletedAt: null,
    },
  });

  if (!candidate) {
    throw new Error("Candidate not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.candidate.update({
      where: { id: candidateId },
      data: {
        status,
        updatedByUserId: userId,
      },
    });

    await tx.auditEvent.create({
      data: {
        orgId,
        actorUserId: userId,
        eventType: "CANDIDATE_STATUS_CHANGED",
        entityType: "Candidate",
        entityId: candidateId,
        action: `Changed candidate status to ${status}`,
      },
    });
  });

  revalidatePath("/candidates");
  revalidatePath(`/candidates/${candidateId}`);

  return { success: true };
}

/**
 * Bulk update candidate statuses
 */
export async function bulkUpdateCandidateStatus(
  candidateIds: string[],
  status: "SHORTLISTED" | "DISMISSED" | "EXPORTED"
) {
  const { orgId, userId } = await getTenantContext();

  // Verify all candidates belong to the org
  const candidates = await prisma.candidate.findMany({
    where: {
      id: { in: candidateIds },
      orgId,
      deletedAt: null,
    },
  });

  if (candidates.length !== candidateIds.length) {
    throw new Error("Some candidates not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.candidate.updateMany({
      where: {
        id: { in: candidateIds },
        orgId,
      },
      data: {
        status,
        updatedByUserId: userId,
      },
    });

    // Create audit events for each
    await tx.auditEvent.createMany({
      data: candidateIds.map((id) => ({
        orgId,
        actorUserId: userId,
        eventType: "CANDIDATE_STATUS_CHANGED" as const,
        entityType: "Candidate",
        entityId: id,
        action: `Changed candidate status to ${status}`,
      })),
    });
  });

  revalidatePath("/candidates");

  return { success: true, count: candidateIds.length };
}

/**
 * Delete candidate (soft delete)
 */
export async function deleteCandidate(candidateId: string) {
  const { orgId, userId } = await getTenantContext();

  const candidate = await prisma.candidate.findFirst({
    where: {
      id: candidateId,
      orgId,
      deletedAt: null,
    },
  });

  if (!candidate) {
    throw new Error("Candidate not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.candidate.update({
      where: { id: candidateId },
      data: { deletedAt: new Date() },
    });

    await tx.auditEvent.create({
      data: {
        orgId,
        actorUserId: userId,
        eventType: "CANDIDATE_STATUS_CHANGED",
        entityType: "Candidate",
        entityId: candidateId,
        action: "Deleted candidate",
      },
    });
  });

  revalidatePath("/candidates");

  return { success: true };
}
