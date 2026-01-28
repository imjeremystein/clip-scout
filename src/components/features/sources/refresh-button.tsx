"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { refreshResultsByType } from "@/server/actions/news";
import { formatDistanceToNow } from "date-fns";

interface RefreshButtonProps {
  type: "all" | "news" | "odds" | "results";
  lastFetchAt?: Date | string | null;
  nextFetchAt?: Date | string | null;
  sourceCount?: number;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export function RefreshButton({
  type,
  lastFetchAt,
  nextFetchAt,
  sourceCount,
  variant = "outline",
  size = "sm",
}: RefreshButtonProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const result = await refreshResultsByType(type);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to refresh"
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const label = type === "all" ? "Refresh All" : "Refresh";
  const parsedLastFetch = lastFetchAt ? new Date(lastFetchAt) : null;
  const parsedNextFetch = nextFetchAt ? new Date(nextFetchAt) : null;
  const noSources = sourceCount === 0;

  return (
    <div className="flex items-center gap-3">
      {parsedLastFetch && (
        <span className="text-xs text-muted-foreground">
          Last updated {formatDistanceToNow(parsedLastFetch, { addSuffix: true })}
        </span>
      )}
      {parsedNextFetch && parsedNextFetch > new Date() && (
        <span className="text-xs text-muted-foreground">
          Next: {formatDistanceToNow(parsedNextFetch, { addSuffix: true })}
        </span>
      )}
      {noSources && (
        <span className="text-xs text-muted-foreground">
          No sources configured
        </span>
      )}
      <Button
        variant={variant}
        size={size}
        onClick={handleRefresh}
        disabled={isRefreshing || noSources}
        title={noSources ? "Configure sources in Admin > Sources" : undefined}
      >
        <RefreshCw
          className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
        />
        {isRefreshing ? "Refreshing..." : label}
        {sourceCount !== undefined && sourceCount > 0 && (
          <span className="ml-1 text-muted-foreground">
            ({sourceCount})
          </span>
        )}
      </Button>
    </div>
  );
}
