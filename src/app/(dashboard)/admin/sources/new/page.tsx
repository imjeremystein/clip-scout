import { SourceForm } from "@/components/features/sources/source-form";

export default function NewSourcePage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Add New Source</h1>
        <p className="text-muted-foreground">
          Configure a new news or odds data source
        </p>
      </div>

      <SourceForm mode="create" />
    </div>
  );
}
