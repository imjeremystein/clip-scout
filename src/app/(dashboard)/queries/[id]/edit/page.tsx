import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/tenant-prisma";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { QueryForm } from "@/components/features/queries/query-form";

async function getQuery(orgId: string, queryId: string) {
  return prisma.queryDefinition.findFirst({
    where: {
      id: queryId,
      orgId,
      deletedAt: null,
    },
  });
}

export default async function EditQueryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await getTenantContext();


  const query = await getQuery(orgId, id);

  if (!query) {
    notFound();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/queries/${query.id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Edit Query</h1>
          <p className="text-muted-foreground">
            Update your search query settings
          </p>
        </div>
      </div>

      <QueryForm
        mode="edit"
        initialData={{
          id: query.id,
          name: query.name,
          description: query.description,
          sport: query.sport,
          keywords: query.keywords as string[],
          recencyDays: query.recencyDays,
          channelIds: query.channelIds as string[],
          maxResults: query.maxResults,
          isScheduled: query.isScheduled,
          scheduleType: query.scheduleType,
          scheduleCron: query.scheduleCron,
          scheduleTimezone: query.scheduleTimezone,
          nextRunAt: query.nextRunAt,
        }}
      />
    </div>
  );
}
