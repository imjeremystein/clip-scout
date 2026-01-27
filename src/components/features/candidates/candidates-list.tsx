"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TrendingUp,
  Star,
  XCircle,
  FileDown,
  Download,
} from "lucide-react";
import { CandidateStatusButton } from "@/components/features/candidates/candidate-status-button";
import { ExportDialog } from "@/components/features/exports/export-dialog";

interface Candidate {
  id: string;
  status: string;
  relevanceScore: number;
  aiSummary: string | null;
  video: {
    youtubeVideoId: string;
    title: string;
    channelTitle: string;
    thumbnailUrl: string | null;
    durationSeconds: number | null;
    publishedAt: Date;
  };
  queryDefinition: {
    name: string;
    sport: string;
  };
  moments: {
    id: string;
    label: string;
    startSeconds: number;
  }[];
}

interface CandidatesListProps {
  candidates: Candidate[];
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "N/A";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins + ":" + secs.toString().padStart(2, "0");
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins + ":" + secs.toString().padStart(2, "0");
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "outline"; icon: typeof Star }> = {
    NEW: { variant: "outline", icon: TrendingUp },
    SHORTLISTED: { variant: "default", icon: Star },
    DISMISSED: { variant: "secondary", icon: XCircle },
    EXPORTED: { variant: "default", icon: FileDown },
  };

  const { variant, icon: Icon } = config[status] || config.NEW;

  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {status}
    </Badge>
  );
}

export function CandidatesList({ candidates }: CandidatesListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const toggleAll = () => {
    if (selectedIds.size === candidates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(candidates.map((c) => c.id)));
    }
  };

  const shortlistedCount = candidates.filter((c) => c.status === "SHORTLISTED").length;

  return (
    <>
      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">
            {selectedIds.size} candidate{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear Selection
            </Button>
            <Button
              size="sm"
              onClick={() => setExportDialogOpen(true)}
            >
              <Download className="h-4 w-4 mr-2" />
              Export Selected
            </Button>
          </div>
        </div>
      )}

      {/* Quick Export Button */}
      {shortlistedCount > 0 && selectedIds.size === 0 && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const shortlistedIds = candidates
                .filter((c) => c.status === "SHORTLISTED")
                .map((c) => c.id);
              setSelectedIds(new Set(shortlistedIds));
              setExportDialogOpen(true);
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            Export All Shortlisted ({shortlistedCount})
          </Button>
        </div>
      )}

      {/* Select All */}
      <div className="flex items-center gap-2 mb-2">
        <Checkbox
          id="select-all"
          checked={selectedIds.size === candidates.length && candidates.length > 0}
          onCheckedChange={toggleAll}
        />
        <label htmlFor="select-all" className="text-sm text-muted-foreground cursor-pointer">
          Select all
        </label>
      </div>

      {/* Candidates List */}
      <div className="space-y-4">
        {candidates.map((candidate) => (
          <Card key={candidate.id} className="overflow-hidden">
            <div className="flex">
              {/* Checkbox */}
              <div className="flex items-center px-4 border-r">
                <Checkbox
                  checked={selectedIds.has(candidate.id)}
                  onCheckedChange={() => toggleSelection(candidate.id)}
                />
              </div>

              {/* Thumbnail */}
              <div className="relative w-48 flex-shrink-0">
                {candidate.video.thumbnailUrl ? (
                  <img
                    src={candidate.video.thumbnailUrl}
                    alt={candidate.video.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <TrendingUp className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                {candidate.video.durationSeconds && (
                  <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1 rounded">
                    {formatDuration(candidate.video.durationSeconds)}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={"/candidates/" + candidate.id}
                        className="font-medium hover:underline line-clamp-1"
                      >
                        {candidate.video.title}
                      </Link>
                      <StatusBadge status={candidate.status} />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{candidate.video.channelTitle}</span>
                      <span>-</span>
                      <Badge variant="outline" className="text-xs">
                        {candidate.queryDefinition.sport}
                      </Badge>
                      <span>-</span>
                      <span>from {candidate.queryDefinition.name}</span>
                    </div>
                    {candidate.aiSummary && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                        {candidate.aiSummary}
                      </p>
                    )}
                    {candidate.moments.length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {candidate.moments.map((moment) => (
                          <Badge
                            key={moment.id}
                            variant="secondary"
                            className="text-xs"
                          >
                            {formatTimestamp(moment.startSeconds)} -{" "}
                            {moment.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Score and Actions */}
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-right">
                      <p className="text-2xl font-bold">
                        {Math.round(candidate.relevanceScore * 100)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        relevance
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <CandidateStatusButton
                        candidateId={candidate.id}
                        currentStatus={candidate.status}
                        targetStatus="SHORTLISTED"
                      />
                      <CandidateStatusButton
                        candidateId={candidate.id}
                        currentStatus={candidate.status}
                        targetStatus="DISMISSED"
                      />
                      <Link href={"/candidates/" + candidate.id}>
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Export Dialog */}
      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        candidateIds={Array.from(selectedIds)}
      />
    </>
  );
}
