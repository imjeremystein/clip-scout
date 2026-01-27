import type { Organization, User, OrgMembership, OrgRole } from "@prisma/client";

// Extended session user type
export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationRole: OrgRole | null;
}

// Organization with membership info
export interface OrganizationWithMembership extends Organization {
  membership?: OrgMembership;
  memberCount?: number;
}

// User with organization membership
export interface UserWithMembership extends User {
  memberships: (OrgMembership & {
    org: Organization;
  })[];
}

// Dashboard stats
export interface DashboardStats {
  totalQueries: number;
  runsToday: number;
  candidatesFound: number;
  shortlisted: number;
}

// Recent run for dashboard
export interface RecentRun {
  id: string;
  queryName: string;
  status: string;
  candidatesFound: number;
  createdAt: Date;
}

// Top candidate for dashboard
export interface TopCandidate {
  id: string;
  title: string;
  channelName: string;
  score: number;
  sport: string;
  videoId: string;
}

// Scheduled run for dashboard
export interface ScheduledRun {
  id: string;
  queryName: string;
  nextRunAt: Date | null;
  scheduleType: string;
}
