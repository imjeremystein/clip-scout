import { auth } from "./auth";
import { prisma } from "./prisma";

/**
 * Get tenant context from the authenticated session.
 */
export async function getTenantContext() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Not authenticated");
  }

  const userId = session.user.id;

  // Find the user's active org membership
  const membership = await prisma.orgMembership.findFirst({
    where: {
      userId,
      status: "ACTIVE",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!membership) {
    throw new Error("No active organization membership");
  }

  return {
    userId,
    orgId: membership.orgId,
    role: membership.role,
    isManager: membership.role === "MANAGER",
  };
}

/**
 * Get tenant context or null if not authenticated/no org
 */
export async function getTenantContextOrNull() {
  try {
    return await getTenantContext();
  } catch {
    return null;
  }
}

/**
 * Prisma client with tenant isolation helpers
 */
export const tenantPrisma = {
  /**
   * Query definitions scoped to the current organization
   */
  async getQueryDefinitions(orgId: string) {
    return prisma.queryDefinition.findMany({
      where: {
        orgId,
        deletedAt: null,
      },
      include: {
        createdByUser: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { queryRuns: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Query runs scoped to the current organization
   */
  async getQueryRuns(orgId: string, limit = 10) {
    return prisma.queryRun.findMany({
      where: { orgId },
      include: {
        queryDefinition: {
          select: { id: true, name: true, sport: true },
        },
        triggeredByUser: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  /**
   * Candidates scoped to the current organization
   */
  async getCandidates(
    orgId: string,
    options: {
      status?: string;
      queryRunId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const { status, queryRunId, limit = 100, offset = 0 } = options;

    return prisma.candidate.findMany({
      where: {
        orgId,
        deletedAt: null,
        ...(status && { status: status as any }),
        ...(queryRunId && { queryRunId }),
      },
      include: {
        video: true,
        queryDefinition: {
          select: { id: true, name: true, sport: true },
        },
        moments: {
          orderBy: { startSeconds: "asc" },
        },
      },
      orderBy: { relevanceScore: "desc" },
      take: limit,
      skip: offset,
    });
  },

  /**
   * Get organization members
   */
  async getOrgMembers(orgId: string) {
    return prisma.orgMembership.findMany({
      where: {
        orgId,
        status: "ACTIVE",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        manager: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
  },

  /**
   * Get pending invites for an organization
   */
  async getPendingInvites(orgId: string) {
    return prisma.invite.findMany({
      where: {
        orgId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      include: {
        invitedByUser: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },
};
