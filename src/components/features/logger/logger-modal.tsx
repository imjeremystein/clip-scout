"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createLogEntry } from "@/server/actions/log-entries";
import { Sport } from "@prisma/client";

const SPORTS: { value: Sport; label: string }[] = [
  { value: "NFL", label: "NFL" },
  { value: "MLB", label: "MLB" },
  { value: "NBA", label: "NBA" },
  { value: "NHL", label: "NHL" },
  { value: "CBB", label: "College Basketball" },
  { value: "CFB", label: "College Football" },
  { value: "SOCCER", label: "Soccer" },
  { value: "BOXING", label: "Boxing" },
  { value: "SPORTS_BETTING", label: "Sports Betting" },
];

interface LoggerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId?: string;
  candidateTitle?: string;
  defaultSport?: Sport;
}

export function LoggerModal({
  open,
  onOpenChange,
  candidateId,
  candidateTitle,
  defaultSport,
}: LoggerModalProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [sport, setSport] = useState<Sport | "">(defaultSport || "");
  const [youtubeUrl, setYoutubeUrl] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !note.trim()) {
      toast.error("Title and note are required");
      return;
    }

    setIsLoading(true);
    try {
      await createLogEntry({
        title: title.trim(),
        note: note.trim(),
        sport: sport || undefined,
        candidateId,
        youtubeUrl: youtubeUrl.trim() || undefined,
      });

      toast.success("Log entry created");
      onOpenChange(false);
      resetForm();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create log entry"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setNote("");
    setSport(defaultSport || "");
    setYoutubeUrl("");
  };

  const description = candidateId
    ? "Add a note for: " + (candidateTitle || "this candidate")
    : "Create a quick note or observation";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Log Entry</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="Brief title for your note"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="note">Note *</Label>
              <Textarea
                id="note"
                placeholder="Your observation, insight, or note..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={isLoading}
                rows={4}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sport">Sport</Label>
              <Select
                value={sport}
                onValueChange={(v) => setSport(v as Sport)}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a sport (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {SPORTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!candidateId && (
              <div className="grid gap-2">
                <Label htmlFor="youtubeUrl">YouTube URL (optional)</Label>
                <Input
                  id="youtubeUrl"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Note
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
