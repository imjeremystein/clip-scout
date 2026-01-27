"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Star, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateCandidateStatus } from "@/server/actions/candidates";

interface CandidateStatusButtonProps {
  candidateId: string;
  currentStatus: string;
  targetStatus: "SHORTLISTED" | "DISMISSED";
}

export function CandidateStatusButton({
  candidateId,
  currentStatus,
  targetStatus,
}: CandidateStatusButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const isActive = currentStatus === targetStatus;

  const handleClick = async () => {
    setIsLoading(true);
    try {
      // Toggle: if already in target status, go back to NEW
      const newStatus = isActive ? "NEW" : targetStatus;
      await updateCandidateStatus(candidateId, newStatus);
      toast.success(
        newStatus === "NEW"
          ? "Status reset"
          : `Candidate ${newStatus.toLowerCase()}`
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update status"
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (targetStatus === "SHORTLISTED") {
    return (
      <Button
        variant={isActive ? "default" : "outline"}
        size="icon"
        onClick={handleClick}
        disabled={isLoading}
        title={isActive ? "Remove from shortlist" : "Add to shortlist"}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Star className={`h-4 w-4 ${isActive ? "fill-current" : ""}`} />
        )}
      </Button>
    );
  }

  return (
    <Button
      variant={isActive ? "secondary" : "outline"}
      size="icon"
      onClick={handleClick}
      disabled={isLoading}
      title={isActive ? "Restore candidate" : "Dismiss candidate"}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <XCircle className="h-4 w-4" />
      )}
    </Button>
  );
}
