"use client";

import { useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { confirmClipMatch, unpairClip } from "@/server/actions/news";

interface ClipMatchActionsProps {
  clipMatchId: string;
  status: string;
}

export function ClipMatchActions({ clipMatchId, status }: ClipMatchActionsProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await confirmClipMatch(clipMatchId);
      toast.success("Clip match confirmed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to confirm");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = async () => {
    setIsLoading(true);
    try {
      await unpairClip(clipMatchId);
      toast.success("Clip match dismissed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to dismiss");
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "MATCHED") {
    return (
      <Button variant="ghost" size="sm" onClick={handleDismiss} disabled={isLoading}>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <X className="h-4 w-4" />
        )}
      </Button>
    );
  }

  if (status === "PENDING") {
    return (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={handleConfirm} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4 text-green-600" />
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleDismiss} disabled={isLoading}>
          <X className="h-4 w-4 text-red-600" />
        </Button>
      </div>
    );
  }

  return null;
}
