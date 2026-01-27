"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const SPORTS = [
  { value: "all", label: "All Sports" },
  { value: "NFL", label: "NFL" },
  { value: "NBA", label: "NBA" },
  { value: "MLB", label: "MLB" },
  { value: "NHL", label: "NHL" },
  { value: "SOCCER", label: "Soccer" },
  { value: "BOXING", label: "Boxing" },
];

const NEWS_TYPES = [
  { value: "all", label: "All Types" },
  { value: "BREAKING", label: "Breaking" },
  { value: "TRADE", label: "Trade" },
  { value: "INJURY", label: "Injury" },
  { value: "GAME_RESULT", label: "Game Result" },
  { value: "BETTING_LINE", label: "Betting Line" },
  { value: "RUMOR", label: "Rumor" },
  { value: "ANALYSIS", label: "Analysis" },
  { value: "SCHEDULE", label: "Schedule" },
];

const MIN_SCORES = [
  { value: "0", label: "All Scores" },
  { value: "30", label: "30+" },
  { value: "50", label: "50+" },
  { value: "70", label: "70+" },
];

export function NewsFeedFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sport = searchParams.get("sport") || "all";
  const type = searchParams.get("type") || "all";
  const minScore = searchParams.get("minScore") || "0";

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "all" || value === "0") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/news?${params.toString()}`);
  };

  const clearFilters = () => {
    router.push("/news");
  };

  const hasFilters = sport !== "all" || type !== "all" || minScore !== "0";

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <Select value={sport} onValueChange={(v) => updateFilter("sport", v)}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Sport" />
        </SelectTrigger>
        <SelectContent>
          {SPORTS.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={type} onValueChange={(v) => updateFilter("type", v)}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          {NEWS_TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={minScore} onValueChange={(v) => updateFilter("minScore", v)}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Min Score" />
        </SelectTrigger>
        <SelectContent>
          {MIN_SCORES.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
