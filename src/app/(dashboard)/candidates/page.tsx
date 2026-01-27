import Link from "next/link";

import { getTenantContext } from "@/lib/tenant-prisma";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  Filter,
} from "lucide-react";
import { CandidatesList } from "@/components/features/candidates/candidates-list";

async function getCandidates(
  orgId: string,
  status?: string,
  sport?: string,
  limit = 50
) {
  return prisma.candidate.findMany({
    where: {
      orgId,
      deletedAt: null,
      ...(status && status !== "all" && { status: status as any }),
    },
    include: {
      video: {
        select: {
          youtubeVideoId: true,
          title: true,
          channelTitle: true,
          thumbnailUrl: true,
          durationSeconds: true,
          publishedAt: true,
        },
      },
      queryDefinition: {
        select: {
          name: true,
          sport: true,
        },
      },
      moments: {
        orderBy: { startSeconds: "asc" },
        take: 3,
      },
    },
    orderBy: { relevanceScore: "desc" },
    take: limit,
  });
}

async function getCandidateStats(orgId: string) {
  const [total, shortlisted, dismissed] = await Promise.all([
    prisma.candidate.count({
      where: { orgId, deletedAt: null },
    }),
    prisma.candidate.count({
      where: { orgId, status: "SHORTLISTED", deletedAt: null },
    }),
    prisma.candidate.count({
      where: { orgId, status: "DISMISSED", deletedAt: null },
    }),
  ]);

  return { total, shortlisted, dismissed, new: total - shortlisted - dismissed };
}

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sport?: string }>;
}) {
  const { status, sport } = await searchParams;
  const { orgId } = await getTenantContext();

  const [candidates, stats] = await Promise.all([
    getCandidates(orgId, status, sport),
    getCandidateStats(orgId),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Candidates</h1>
          <p className="text-muted-foreground">
            Review and manage discovered video clips
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{stats.total} total</span>
            <span>•</span>
            <span className="text-yellow-600">{stats.shortlisted} shortlisted</span>
            <span>•</span>
            <span className="text-muted-foreground">{stats.dismissed} dismissed</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filter:</span>
            </div>
            <form className="flex items-center gap-4">
              <Select name="status" defaultValue={status || "all"}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="NEW">New</SelectItem>
                  <SelectItem value="SHORTLISTED">Shortlisted</SelectItem>
                  <SelectItem value="DISMISSED">Dismissed</SelectItem>
                  <SelectItem value="EXPORTED">Exported</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" variant="secondary" size="sm">
                Apply
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* Candidates List */}
      {candidates.length > 0 ? (
        <CandidatesList candidates={candidates} />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No candidates found</h3>
            <p className="text-muted-foreground text-center mb-4">
              {status
                ? `No candidates with status "${status}"`
                : "Run a query to discover video clips"}
            </p>
            <Link href="/queries">
              <Button>Go to Queries</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
