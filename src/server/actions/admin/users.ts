"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant-prisma";
import type { UserRole, UserStatus } from "@prisma/client";

const SALT_ROUNDS = 12;

// Ensure the current user is an admin
async function requireAdmin() {
  const { userId, orgId } = await getTenantContext();

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || user.role !== "ADMIN") {
    throw new Error("Unauthorized: Admin access required");
  }

  return { userId, orgId, user };
}

/**
 * Get all users (admin only).
 */
export async function getUsers() {
  await requireAdmin();

  return prisma.user.findMany({
    where: {
      deletedAt: null,
    },
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      role: true,
      status: true,
      createdAt: true,
      invitedAt: true,
      invitedBy: true,
      lastLoginAt: true,
    },
  });
}

/**
 * Get a single user by ID (admin only).
 */
export async function getUser(userId: string) {
  await requireAdmin();

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      deletedAt: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      role: true,
      status: true,
      createdAt: true,
      invitedAt: true,
      invitedBy: true,
      lastLoginAt: true,
      memberships: {
        select: {
          org: {
            select: {
              id: true,
              name: true,
            },
          },
          role: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  return user;
}

const inviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ADMIN", "USER"]).default("USER"),
});

/**
 * Create a new user with a password (admin only).
 */
export async function inviteUser(formData: FormData) {
  const { userId: adminId, orgId } = await requireAdmin();

  const data = inviteUserSchema.parse({
    email: formData.get("email"),
    name: formData.get("name") || undefined,
    password: formData.get("password"),
    role: formData.get("role") || "USER",
  });

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    throw new Error("A user with this email already exists");
  }

  // Hash the password
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

  // Create the user as ACTIVE (no invite flow needed)
  const user = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name || data.email.split("@")[0],
      role: data.role as UserRole,
      status: "ACTIVE",
      passwordHash,
      emailVerified: new Date(),
      invitedAt: new Date(),
      invitedBy: adminId,
    },
  });

  // Create organization membership
  await prisma.orgMembership.create({
    data: {
      orgId,
      userId: user.id,
      role: data.role === "ADMIN" ? "MANAGER" : "MEMBER",
    },
  });

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: adminId,
      eventType: "MEMBER_INVITED",
      entityType: "User",
      entityId: user.id,
      action: `Created user: ${data.email} as ${data.role}`,
    },
  });

  revalidatePath("/admin/users");

  return { success: true, userId: user.id };
}

const updateUserRoleSchema = z.object({
  userId: z.string(),
  role: z.enum(["ADMIN", "USER"]),
});

/**
 * Update a user's role (admin only).
 */
export async function updateUserRole(formData: FormData) {
  const { userId: adminId, orgId } = await requireAdmin();

  const data = updateUserRoleSchema.parse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });

  // Prevent admins from demoting themselves
  if (data.userId === adminId) {
    throw new Error("You cannot change your own role");
  }

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
  });

  if (!user) {
    throw new Error("User not found");
  }

  await prisma.user.update({
    where: { id: data.userId },
    data: { role: data.role as UserRole },
  });

  // Update org membership role as well
  await prisma.orgMembership.updateMany({
    where: { userId: data.userId, orgId },
    data: { role: data.role === "ADMIN" ? "MANAGER" : "MEMBER" },
  });

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: adminId,
      eventType: "MEMBER_ROLE_CHANGED",
      entityType: "User",
      entityId: data.userId,
      action: `Changed role for ${user.email} to ${data.role}`,
    },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${data.userId}`);

  return { success: true };
}

const toggleUserStatusSchema = z.object({
  userId: z.string(),
  status: z.enum(["ACTIVE", "DISABLED"]),
});

/**
 * Enable or disable a user account (admin only).
 */
export async function toggleUserStatus(formData: FormData) {
  const { userId: adminId, orgId } = await requireAdmin();

  const data = toggleUserStatusSchema.parse({
    userId: formData.get("userId"),
    status: formData.get("status"),
  });

  // Prevent admins from disabling themselves
  if (data.userId === adminId) {
    throw new Error("You cannot disable your own account");
  }

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
  });

  if (!user) {
    throw new Error("User not found");
  }

  await prisma.user.update({
    where: { id: data.userId },
    data: { status: data.status as UserStatus },
  });

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: adminId,
      eventType: "MEMBER_REMOVED",
      entityType: "User",
      entityId: data.userId,
      action: `${data.status === "DISABLED" ? "Disabled" : "Enabled"} user: ${user.email}`,
    },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${data.userId}`);

  return { success: true };
}

/**
 * Delete a user (soft delete, admin only).
 */
export async function deleteUser(userId: string) {
  const { userId: adminId, orgId } = await requireAdmin();

  // Prevent admins from deleting themselves
  if (userId === adminId) {
    throw new Error("You cannot delete your own account");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Soft delete the user
  await prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt: new Date(),
      status: "DISABLED",
    },
  });

  // Remove org memberships
  await prisma.orgMembership.deleteMany({
    where: { userId },
  });

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: adminId,
      eventType: "MEMBER_REMOVED",
      entityType: "User",
      entityId: userId,
      action: `Deleted user: ${user.email}`,
    },
  });

  revalidatePath("/admin/users");

  return { success: true };
}

const resetPasswordSchema = z.object({
  userId: z.string(),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Reset a user's password (admin only).
 */
export async function resetUserPassword(formData: FormData) {
  const { userId: adminId, orgId } = await requireAdmin();

  const data = resetPasswordSchema.parse({
    userId: formData.get("userId"),
    newPassword: formData.get("newPassword"),
  });

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const passwordHash = await bcrypt.hash(data.newPassword, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: data.userId },
    data: { passwordHash },
  });

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: adminId,
      eventType: "ORG_UPDATED",
      entityType: "User",
      entityId: data.userId,
      action: `Reset password for: ${user.email}`,
    },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${data.userId}`);

  return { success: true };
}

/**
 * Get user statistics for dashboard.
 */
export async function getUserStats() {
  await requireAdmin();

  const [total, active, invited, disabled, admins] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.user.count({ where: { deletedAt: null, status: "INVITED" } }),
    prisma.user.count({ where: { deletedAt: null, status: "DISABLED" } }),
    prisma.user.count({ where: { deletedAt: null, role: "ADMIN" } }),
  ]);

  return {
    total,
    active,
    invited,
    disabled,
    admins,
  };
}
