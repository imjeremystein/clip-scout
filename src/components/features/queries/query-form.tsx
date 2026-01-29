"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { X, Plus, Calendar, Clock } from "lucide-react";
import { createQueryDefinition, updateQueryDefinition } from "@/server/actions/queries";
import { SPORTS, SCHEDULE_TYPES } from "@/lib/constants";

interface QueryFormProps {
  mode: "create" | "edit";
  initialData?: {
    id: string;
    name: string;
    description?: string | null;
    sport: string;
    keywords: string[];
    recencyDays: number;
    channelIds: string[];
    maxResults: number;
    isScheduled: boolean;
    scheduleType: string;
    scheduleCron?: string | null;
    scheduleTimezone: string;
    nextRunAt?: Date | null;
  };
}

const timezones = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Phoenix", label: "Arizona (MST)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "UTC", label: "UTC" },
];

const daysOfWeek = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

export function QueryForm({ mode, initialData }: QueryFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [keywords, setKeywords] = useState<string[]>(initialData?.keywords || []);
  const [keywordInput, setKeywordInput] = useState("");
  const [recencyDays, setRecencyDays] = useState(initialData?.recencyDays || 7);
  const [isScheduled, setIsScheduled] = useState(initialData?.isScheduled || false);
  const [scheduleType, setScheduleType] = useState(initialData?.scheduleType || "MANUAL");
  const [runImmediately, setRunImmediately] = useState(mode === "create");

  const addKeyword = () => {
    const trimmed = keywordInput.trim();
    if (trimmed && !keywords.includes(trimmed) && keywords.length < 20) {
      setKeywords([...keywords, trimmed]);
      setKeywordInput("");
    }
  };

  const removeKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword));
  };

  const handleKeywordKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addKeyword();
    }
  };

  const handleSubmit = async (formData: FormData) => {
    if (keywords.length === 0) {
      toast.error("Please add at least one keyword");
      return;
    }

    setIsLoading(true);

    // Add keywords to form data
    formData.set("keywords", keywords.join(","));
    formData.set("recencyDays", recencyDays.toString());
    formData.set("isScheduled", isScheduled.toString());
    formData.set("runImmediately", runImmediately.toString());

    try {
      if (mode === "create") {
        await createQueryDefinition(formData);
        toast.success("Query created successfully");
      } else if (initialData) {
        await updateQueryDefinition(initialData.id, formData);
        toast.success("Query updated successfully");
        router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save query");
      setIsLoading(false);
    }
  };

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>Name and describe your search query</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Query Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g., NFL Touchdown Highlights"
              defaultValue={initialData?.name}
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Describe what this query is searching for..."
              defaultValue={initialData?.description || ""}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sport">Sport Category</Label>
            <Select name="sport" defaultValue={initialData?.sport || "NFL"}>
              <SelectTrigger>
                <SelectValue placeholder="Select sport" />
              </SelectTrigger>
              <SelectContent>
                {SPORTS.map((sport) => (
                  <SelectItem key={sport.value} value={sport.value}>
                    {sport.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Search Criteria */}
      <Card>
        <CardHeader>
          <CardTitle>Search Criteria</CardTitle>
          <CardDescription>Define what you&apos;re looking for</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Keywords</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add keyword and press Enter"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={handleKeywordKeyDown}
                disabled={isLoading || keywords.length >= 20}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={addKeyword}
                disabled={isLoading || keywords.length >= 20}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {keywords.map((keyword) => (
                  <Badge key={keyword} variant="secondary" className="gap-1">
                    {keyword}
                    <button
                      type="button"
                      onClick={() => removeKeyword(keyword)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Add keywords that describe the content you&apos;re looking for ({keywords.length}/20)
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Recency: Last {recencyDays} days</Label>
            </div>
            <Slider
              value={[recencyDays]}
              onValueChange={([value]) => setRecencyDays(value)}
              min={1}
              max={30}
              step={1}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Only search for videos published within this time period
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxResults">Maximum Results</Label>
            <Select name="maxResults" defaultValue={(initialData?.maxResults || 100).toString()}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50 videos</SelectItem>
                <SelectItem value="100">100 videos</SelectItem>
                <SelectItem value="200">200 videos</SelectItem>
                <SelectItem value="500">500 videos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="channelIds">Channel IDs (optional)</Label>
            <Input
              id="channelIds"
              name="channelIds"
              placeholder="Comma-separated YouTube channel IDs"
              defaultValue={initialData?.channelIds?.join(", ") || ""}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Limit search to specific channels (leave empty for all channels)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Schedule Settings
          </CardTitle>
          <CardDescription>Configure automatic query runs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="isScheduled"
              checked={isScheduled}
              onCheckedChange={(checked) => {
                setIsScheduled(checked === true);
                if (!checked) setScheduleType("MANUAL");
              }}
            />
            <Label htmlFor="isScheduled" className="cursor-pointer">
              Enable automatic scheduling
            </Label>
          </div>

          {isScheduled && (
            <div className="space-y-4 pl-6 border-l-2 border-muted">
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  name="scheduleType"
                  value={scheduleType}
                  onValueChange={setScheduleType}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_TYPES.filter((t) => t.value !== "MANUAL").map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="scheduleTime" className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Time
                  </Label>
                  <Input
                    id="scheduleTime"
                    name="scheduleTime"
                    type="time"
                    defaultValue="06:00"
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scheduleTimezone">Timezone</Label>
                  <Select
                    name="scheduleTimezone"
                    defaultValue={initialData?.scheduleTimezone || "America/New_York"}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timezones.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {scheduleType === "WEEKLY" && (
                <div className="space-y-2">
                  <Label>Day of Week</Label>
                  <Select name="scheduleDayOfWeek" defaultValue="1">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {daysOfWeek.map((day) => (
                        <SelectItem key={day.value} value={day.value}>
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {scheduleType === "CUSTOM" && (
                <div className="space-y-2">
                  <Label htmlFor="scheduleCron">Cron Expression</Label>
                  <Input
                    id="scheduleCron"
                    name="scheduleCron"
                    placeholder="0 6 * * *"
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Advanced: Enter a cron expression (e.g., &quot;0 6 * * 1-5&quot; for weekdays at 6 AM)
                  </p>
                </div>
              )}
            </div>
          )}

          {mode === "create" && (
            <div className="flex items-center space-x-2 pt-4 border-t">
              <Checkbox
                id="runImmediately"
                checked={runImmediately}
                onCheckedChange={(checked) => setRunImmediately(checked === true)}
              />
              <Label htmlFor="runImmediately" className="cursor-pointer">
                Run this query immediately after saving
              </Label>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading
            ? mode === "create"
              ? "Creating..."
              : "Saving..."
            : mode === "create"
              ? "Create Query"
              : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
