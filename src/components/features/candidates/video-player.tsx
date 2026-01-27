"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";

interface Moment {
  id: string;
  label: string;
  startSeconds: number;
  endSeconds: number;
}

interface VideoPlayerProps {
  videoId: string;
  moments?: Moment[];
  startTime?: number;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function VideoPlayer({ videoId, moments = [], startTime = 0 }: VideoPlayerProps) {
  const [currentTime, setCurrentTime] = useState(startTime);

  const jumpToTime = (seconds: number) => {
    setCurrentTime(seconds);
  };

  // YouTube embed URL with autoplay disabled and starting time
  const embedUrl = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(currentTime)}&rel=0&modestbranding=1`;

  return (
    <div className="space-y-4">
      {/* Video Embed */}
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
        <iframe
          key={currentTime} // Force re-render when time changes
          src={embedUrl}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="YouTube video player"
        />
      </div>

      {/* Quick Jump Buttons */}
      {moments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <Play className="h-3 w-3" />
            Jump to:
          </span>
          {moments.map((moment) => (
            <Button
              key={moment.id}
              variant="secondary"
              size="sm"
              onClick={() => jumpToTime(moment.startSeconds)}
              className="text-xs"
            >
              {formatTimestamp(moment.startSeconds)} - {moment.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
