"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant-prisma";

// Schema for creating an organization
const createOrgSchema = z.object({
  name: z.string().min(2).max(255),
  timezone: z.string().default("America/New_York"),
});

// Schema for inviting a member
const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["MANAGER", "MEMBER"]).default("MEMBER"),
  message: z.string().max(500).optional(),
});

/**
 * Create a new organization and make the current user a manager
 */
export async function createOrganization(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const data = createOrgSchema.parse({
    name: formData.get("name"),
    timezone: formData.get("timezone") || "America/New_York",
  });

  // Generate a slug from the name
  const baseSlug = data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Ensure slug is unique
  let slug = baseSlug;
  let counter = 1;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  // Create organization and membership in a transaction
  const org = await prisma.$transaction(async (tx) => {
    const newOrg = await tx.organization.create({
      data: {
        name: data.name,
        slug,
        timezone: data.timezone,
        plan: "free",
      },
    });

    await tx.orgMembership.create({
      data: {
        orgId: newOrg.id,
        userId: session.user.id,
        role: "MANAGER",
        status: "ACTIVE",
      },
    });

    // Create audit event
    await tx.auditEvent.create({
      data: {
        orgId: newOrg.id,
        actorUserId: session.user.id,
        eventType: "ORG_CREATED",
        entityType: "Organization",
        entityId: newOrg.id,
        action: `Created organization "${data.name}"`,
      },
    });

    return newOrg;
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

/**
 * Update organization settings
 */
export async function updateOrganization(formData: FormData) {
  const { orgId, userId, isManager } = await getTenantContext();

  if (!isManager) {
    throw new Error("Only managers can update organization settings");
  }

  const name = formData.get("name") as string;
  const timezone = formData.get("timezone") as string;

  await prisma.$transaction(async (tx) => {
    const oldOrg = await tx.organization.findUnique({
      where: { id: orgId },
    });

    await tx.organization.update({
      where: { id: orgId },
      data: {
        ...(name && { name }),
        ...(timezone && { timezone }),
      },
    });

    await tx.auditEvent.create({
      data: {
        orgId,
        actorUserId: userId,
        eventType: "ORG_UPDATED",
        entityType: "Organization",
        entityId: orgId,
        action: "Updated organization settings",
        meta: {
          changes: {
            name: name !== oldOrg?.name ? { from: oldOrg?.name, to: name } : undefined,
            timezone: timezone !== oldOrg?.timezone ? { from: oldOrg?.timezone, to: timezone } : undefined,
          },
        },
      },
    });
  });

  revalidatePath("/settings");
  return { success: true };
}

/**
 * Set YouTube API key for the organization
 */
export async function setYouTubeApiKey(formData: FormData) {
  const { orgId, userId, isManager } = await getTenantContext();

  if (!isManager) {
    throw new Error("Only managers can set the YouTube API key");
  }

  const apiKey = formData.get("apiKey") as string;

  if (!apiKey || apiKey.length < 20) {
    throw new Error("Invalid API key");
  }

  // In production, you would encrypt this key before storing
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      youtubeApiKeyEncrypted: apiKey, // TODO: Encrypt in production
    },
  });

  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "ORG_UPDATED",
      entityType: "Organization",
      entityId: orgId,
      action: "Updated YouTube API key",
    },
  });

  revalidatePath("/settings");
  return { success: true };
}

/**
 * Invite a user to the organization
 */
export async function inviteMember(formData: FormData) {
  const { orgId, userId, isManager } = await getTenantContext();

  if (!isManager) {
    throw new Error("Only managers can invite members");
  }

  const data = inviteMemberSchema.parse({
    email: formData.get("email"),
    role: formData.get("role") || "MEMBER",
    message: formData.get("message"),
  });

  // Check if user is already a member
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
    include: {
      memberships: {
        where: { orgId },
      },
    },
  });

  if (existingUser?.memberships.length) {
    throw new Error("User is already a member of this organization");
  }

  // Check for existing pending invite
  const existingInvite = await prisma.invite.findFirst({
    where: {
      orgId,
      email: data.email,
      status: "PENDING",
    },
  });

  if (existingInvite) {
    throw new Error("An invite has already been sent to this email");
  }

  // Create invite (expires in 7 days)
  const invite = await prisma.invite.create({
    data: {
      orgId,
      email: data.email,
      role: data.role,
      message: data.message,
      invitedByUserId: userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "MEMBER_INVITED",
      entityType: "Invite",
      entityId: invite.id,
      action: `Invited ${data.email} as ${data.role}`,
    },
  });

  // TODO: Send email with invite link
  // await sendInviteEmail(data.email, invite.token, data.message);

  revalidatePath("/settings");
  return { success: true, inviteId: invite.id };
}

/**
 * Revoke a pending invite
 */
export async function revokeInvite(inviteId: string) {
  const { orgId, userId, isManager } = await getTenantContext();

  if (!isManager) {
    throw new Error("Only managers can revoke invites");
  }

  const invite = await prisma.invite.findFirst({
    where: {
      id: inviteId,
      orgId,
      status: "PENDING",
    },
  });

  if (!invite) {
    throw new Error("Invite not found");
  }

  await prisma.invite.update({
    where: { id: inviteId },
    data: { status: "REVOKED" },
  });

  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "MEMBER_INVITED",
      entityType: "Invite",
      entityId: inviteId,
      action: `Revoked invite for ${invite.email}`,
    },
  });

  revalidatePath("/settings");
  return { success: true };
}

/**
 * Remove a member from the organization
 */
export async function removeMember(membershipId: string) {
  const { orgId, userId, isManager } = await getTenantContext();

  if (!isManager) {
    throw new Error("Only managers can remove members");
  }

  const membership = await prisma.orgMembership.findFirst({
    where: {
      id: membershipId,
      orgId,
    },
    include: {
      user: true,
    },
  });

  if (!membership) {
    throw new Error("Membership not found");
  }

  if (membership.userId === userId) {
    throw new Error("You cannot remove yourself from the organization");
  }

  await prisma.orgMembership.update({
    where: { id: membershipId },
    data: { status: "DISABLED" },
  });

  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "MEMBER_REMOVED",
      entityType: "OrgMembership",
      entityId: membershipId,
      action: `Removed ${membership.user.email} from organization`,
    },
  });

  revalidatePath("/settings");
  return { success: true };
}

/**
 * Update a member's role
 */
export async function updateMemberRole(membershipId: string, newRole: "MANAGER" | "MEMBER") {
  const { orgId, userId, isManager } = await getTenantContext();

  if (!isManager) {
    throw new Error("Only managers can update member roles");
  }

  const membership = await prisma.orgMembership.findFirst({
    where: {
      id: membershipId,
      orgId,
    },
    include: {
      user: true,
    },
  });

  if (!membership) {
    throw new Error("Membership not found");
  }

  await prisma.orgMembership.update({
    where: { id: membershipId },
    data: { role: newRole },
  });

  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "MEMBER_ROLE_CHANGED",
      entityType: "OrgMembership",
      entityId: membershipId,
      action: `Changed ${membership.user.email} role to ${newRole}`,
    },
  });

  revalidatePath("/settings");
  return { success: true };
}
