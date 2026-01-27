"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { startQueryRun } from "@/server/actions/queries";

interface RunNowButtonProps {
  queryId: string;
  queryName: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export function RunNowButton({
  queryId,
  queryName,
  variant = "outline",
  size = "sm",
}: RunNowButtonProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);

  const handleRunNow = async () => {
    setIsRunning(true);
    try {
      const result = await startQueryRun(queryId);
      toast.success(`Started run for "${queryName}"`, {
        action: {
          label: "View",
          onClick: () => router.push(`/runs/${result.runId}`),
        },
      });
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start query run"
      );
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleRunNow}
      disabled={isRunning}
    >
      {isRunning ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Starting...
        </>
      ) : (
        <>
          <Play className="mr-2 h-4 w-4" />
          Run Now
        </>
      )}
    </Button>
  );
}
