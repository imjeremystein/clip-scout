"use client";

import { useState } from "react";
import { Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { runSourceNow } from "@/server/actions/sources";

interface RunSourceButtonProps {
  sourceId: string;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
}

export function RunSourceButton({
  sourceId,
  variant = "ghost",
  size = "sm",
}: RunSourceButtonProps) {
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = async () => {
    setIsRunning(true);
    try {
      await runSourceNow(sourceId);
      toast.success("Source fetch started");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start fetch");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleRun}
      disabled={isRunning}
    >
      {isRunning ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Play className="h-4 w-4" />
      )}
      {size !== "icon" && <span className="ml-1">Run</span>}
    </Button>
  );
}
