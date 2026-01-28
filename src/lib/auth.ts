import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: "Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      const userId = token?.id as string;

      if (!userId) {
        return session;
      }

      // Single query: fetch user with their active org membership
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          role: true,
          memberships: {
            where: { status: "ACTIVE" },
            include: { org: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      const membership = dbUser?.memberships[0] ?? null;

      return {
        ...session,
        user: {
          ...session.user,
          id: userId,
          role: dbUser?.role ?? "USER",
          organizationId: membership?.orgId ?? null,
          organizationName: membership?.org.name ?? null,
          organizationRole: membership?.role ?? null,
        },
      };
    },
    async signIn({ user }) {
      if (!user.email) return false;

      // Block disabled users
      const dbUser = await prisma.user.findUnique({
        where: { email: user.email },
        select: { status: true },
      });

      if (dbUser?.status === "DISABLED") {
        return false;
      }

      // Update last login time
      await prisma.user.update({
        where: { email: user.email },
        data: { lastLoginAt: new Date() },
      });

      // Check if user is accepting an invite
      const pendingInvite = await prisma.invite.findFirst({
        where: {
          email: user.email,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
      });

      if (pendingInvite) {
        await prisma.$transaction([
          prisma.invite.update({
            where: { id: pendingInvite.id },
            data: { status: "ACCEPTED" },
          }),
          prisma.orgMembership.create({
            data: {
              orgId: pendingInvite.orgId,
              userId: user.id!,
              role: pendingInvite.role,
              status: "ACTIVE",
            },
          }),
        ]);
      }

      return true;
    },
  },
  session: {
    // Credentials provider requires JWT strategy (database sessions
    // are not created by the Credentials authorize flow)
    strategy: "jwt",
  },
});

// Extend the session type
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: "ADMIN" | "USER";
      organizationId: string | null;
      organizationName: string | null;
      organizationRole: "MANAGER" | "MEMBER" | null;
    };
  }
}
