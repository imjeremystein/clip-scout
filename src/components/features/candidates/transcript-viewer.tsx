"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Clock } from "lucide-react";

interface Segment {
  id: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

interface Moment {
  id: string;
  label: string;
  startSeconds: number;
  endSeconds: number;
}

interface TranscriptViewerProps {
  segments: Segment[];
  keywords: string[];
  moments?: Moment[];
  onTimeClick?: (seconds: number) => void;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function highlightText(text: string, keywords: string[]): React.ReactNode {
  if (keywords.length === 0) return text;

  // Create a regex pattern for all keywords
  const pattern = new RegExp(
    `(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );

  const parts = text.split(pattern);

  return parts.map((part, i) => {
    const isKeyword = keywords.some(
      (k) => k.toLowerCase() === part.toLowerCase()
    );
    if (isKeyword) {
      return (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-900 px-0.5 rounded">
          {part}
        </mark>
      );
    }
    return part;
  });
}

export function TranscriptViewer({
  segments,
  keywords,
  moments = [],
  onTimeClick,
}: TranscriptViewerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter and highlight segments based on search
  const filteredSegments = useMemo(() => {
    if (!searchQuery.trim()) return segments;

    const query = searchQuery.toLowerCase();
    return segments.filter((segment) =>
      segment.text.toLowerCase().includes(query)
    );
  }, [segments, searchQuery]);

  // Check if a segment is within a moment
  const isInMoment = (segment: Segment): Moment | undefined => {
    return moments.find(
      (m) =>
        segment.startSeconds >= m.startSeconds &&
        segment.startSeconds < m.endSeconds
    );
  };

  // All keywords to highlight (original + search query)
  const highlightKeywords = useMemo(() => {
    const all = [...keywords];
    if (searchQuery.trim()) {
      all.push(searchQuery.trim());
    }
    return all;
  }, [keywords, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search transcript..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Keywords Legend */}
      {keywords.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Highlighting:</span>
          {keywords.map((keyword) => (
            <Badge
              key={keyword}
              variant="secondary"
              className="text-xs bg-yellow-100 dark:bg-yellow-900/50"
            >
              {keyword}
            </Badge>
          ))}
        </div>
      )}

      {/* Transcript */}
      <div className="max-h-[500px] overflow-y-auto space-y-1 border rounded-lg p-4">
        {filteredSegments.length > 0 ? (
          filteredSegments.map((segment) => {
            const moment = isInMoment(segment);
            return (
              <div
                key={segment.id}
                className={`flex gap-3 p-2 rounded transition-colors ${
                  moment
                    ? "bg-primary/5 border-l-2 border-primary"
                    : "hover:bg-muted/50"
                }`}
              >
                <button
                  onClick={() => onTimeClick?.(segment.startSeconds)}
                  className="flex-shrink-0 text-xs font-mono text-muted-foreground hover:text-primary flex items-center gap-1"
                >
                  <Clock className="h-3 w-3" />
                  {formatTimestamp(segment.startSeconds)}
                </button>
                <p className="text-sm flex-1">
                  {highlightText(segment.text, highlightKeywords)}
                </p>
                {moment && (
                  <Badge variant="outline" className="flex-shrink-0 text-xs">
                    {moment.label}
                  </Badge>
                )}
              </div>
            );
          })
        ) : (
          <p className="text-center text-muted-foreground py-8">
            {searchQuery
              ? "No matching segments found"
              : "No transcript available"}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {filteredSegments.length} of {segments.length} segments
        </span>
        {moments.length > 0 && (
          <span>{moments.length} key moments identified</span>
        )}
      </div>
    </div>
  );
}
