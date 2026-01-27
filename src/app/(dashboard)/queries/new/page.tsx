
import { getTenantContext } from "@/lib/tenant-prisma";
import { QueryForm } from "@/components/features/queries/query-form";

export default async function NewQueryPage() {
  const { orgId } = await getTenantContext();


  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Create New Query</h1>
        <p className="text-muted-foreground">
          Define a search query to discover relevant YouTube clips
        </p>
      </div>

      <QueryForm mode="create" />
    </div>
  );
}
