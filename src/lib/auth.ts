import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./prisma";

const isDev = process.env.NODE_ENV === "development";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    // DEV ONLY: Credentials provider for easy testing
    ...(isDev
      ? [
          Credentials({
            name: "Dev Login",
            credentials: {
              email: { label: "Email", type: "email" },
            },
            async authorize(credentials) {
              if (!credentials?.email) return null;

              // Find or create user
              let user = await prisma.user.findUnique({
                where: { email: credentials.email as string },
              });

              if (!user) {
                user = await prisma.user.create({
                  data: {
                    email: credentials.email as string,
                    name: (credentials.email as string).split("@")[0],
                    emailVerified: new Date(),
                  },
                });
              }

              return {
                id: user.id,
                email: user.email,
                name: user.name,
                image: user.image,
              };
            },
          }),
        ]
      : []),
    // Email Magic Link via Resend
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM || "Clip Scout <noreply@clipscout.com>",
    }),
    // Google OAuth (optional)
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/verify-request",
    error: "/login",
    newUser: "/onboarding",
  },
  callbacks: {
    async jwt({ token, user }) {
      // On sign in, add user id to token
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, user, token }) {
      // Get user ID from either database session or JWT token
      const userId = user?.id || (token?.id as string);

      if (!userId) {
        return session;
      }

      // Fetch user's organization membership
      const membership = await prisma.orgMembership.findFirst({
        where: {
          userId: userId,
          status: "ACTIVE",
        },
        include: {
          org: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return {
        ...session,
        user: {
          ...session.user,
          id: userId,
          organizationId: membership?.orgId ?? null,
          organizationName: membership?.org.name ?? null,
          organizationRole: membership?.role ?? null,
        },
      };
    },
    async signIn({ user, account }) {
      // Check if user is accepting an invite
      if (user.email) {
        const pendingInvite = await prisma.invite.findFirst({
          where: {
            email: user.email,
            status: "PENDING",
            expiresAt: { gt: new Date() },
          },
        });

        if (pendingInvite) {
          // Accept the invite
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
      }

      return true;
    },
  },
  session: {
    // Always use database strategy for compatibility with PrismaAdapter
    strategy: "database",
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
      organizationId: string | null;
      organizationName: string | null;
      organizationRole: "MANAGER" | "MEMBER" | null;
    };
  }
}
