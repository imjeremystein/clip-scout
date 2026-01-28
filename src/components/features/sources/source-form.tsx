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
import { toast } from "sonner";
import { Calendar, Clock, Rss, Globe, Trophy, DollarSign } from "lucide-react";
import { createSource, updateSource } from "@/server/actions/sources";
import { SPORTS } from "@/lib/constants";

interface SourceFormProps {
  mode: "create" | "edit";
  initialData?: {
    id: string;
    name: string;
    type: string;
    sport: string;
    config: Record<string, unknown>;
    isScheduled: boolean;
    scheduleType: string;
    scheduleCron?: string | null;
    scheduleTimezone: string;
    refreshInterval: number;
  };
}

const SOURCE_TYPES = [
  { value: "RSS_FEED", label: "RSS Feed", icon: Rss },
  { value: "WEBSITE_SCRAPE", label: "Website Scraper", icon: Globe },
  { value: "ESPN_API", label: "ESPN", icon: Trophy },
  { value: "SPORTSGRID_API", label: "SportsGrid", icon: DollarSign },
];

const SCHEDULE_TYPES = [
  { value: "MANUAL", label: "Manual only" },
  { value: "HOURLY", label: "Every X minutes" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKDAYS", label: "Weekdays" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "CUSTOM", label: "Custom cron" },
];

const REFRESH_INTERVALS = [
  { value: "5", label: "Every 5 minutes" },
  { value: "15", label: "Every 15 minutes" },
  { value: "30", label: "Every 30 minutes" },
  { value: "60", label: "Every hour" },
  { value: "120", label: "Every 2 hours" },
  { value: "360", label: "Every 6 hours" },
  { value: "720", label: "Every 12 hours" },
];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "UTC", label: "UTC" },
];

export function SourceForm({ mode, initialData }: SourceFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [sourceType, setSourceType] = useState(initialData?.type || "RSS_FEED");
  const [isScheduled, setIsScheduled] = useState(initialData?.isScheduled ?? true);
  const [scheduleType, setScheduleType] = useState(initialData?.scheduleType || "HOURLY");

  // Config state for different source types
  const [config, setConfig] = useState<Record<string, unknown>>(
    initialData?.config || {}
  );

  const handleConfigChange = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true);

    // Add config as JSON
    formData.set("config", JSON.stringify(config));
    formData.set("isScheduled", isScheduled.toString());

    if (mode === "edit" && initialData) {
      formData.set("id", initialData.id);
    }

    try {
      if (mode === "create") {
        await createSource(formData);
        toast.success("Source created successfully");
        router.push("/admin/sources");
      } else {
        await updateSource(formData);
        toast.success("Source updated successfully");
        router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save source");
      setIsLoading(false);
    }
  };

  const renderConfigFields = () => {
    switch (sourceType) {
      case "RSS_FEED":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="feedUrl">Feed URL</Label>
              <Input
                id="feedUrl"
                placeholder="https://example.com/feed.xml"
                value={(config.feedUrl as string) || ""}
                onChange={(e) => handleConfigChange("feedUrl", e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                The URL of the RSS or Atom feed
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxItems">Max Items per Fetch</Label>
              <Input
                id="maxItems"
                type="number"
                placeholder="50"
                value={(config.maxItems as string) || "50"}
                onChange={(e) => handleConfigChange("maxItems", e.target.value)}
              />
            </div>
          </div>
        );

      case "WEBSITE_SCRAPE":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">Page URL</Label>
              <Input
                id="url"
                placeholder="https://example.com/news"
                value={(config.url as string) || ""}
                onChange={(e) => handleConfigChange("url", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="headline">Headline Selector (CSS)</Label>
              <Input
                id="headline"
                placeholder="h2.title, .headline"
                value={((config.selectors as Record<string, string>)?.headline as string) || ""}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    selectors: { ...(prev.selectors as Record<string, string> || {}), headline: e.target.value },
                  }))
                }
                required
              />
              <p className="text-xs text-muted-foreground">
                CSS selector for finding headlines
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Content Selector (optional)</Label>
              <Input
                id="content"
                placeholder=".summary, .excerpt"
                value={((config.selectors as Record<string, string>)?.content as string) || ""}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    selectors: { ...(prev.selectors as Record<string, string> || {}), content: e.target.value },
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date Selector (optional)</Label>
              <Input
                id="date"
                placeholder=".date, time"
                value={((config.selectors as Record<string, string>)?.date as string) || ""}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    selectors: { ...(prev.selectors as Record<string, string> || {}), date: e.target.value },
                  }))
                }
              />
            </div>
          </div>
        );

      case "ESPN_API":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="section">Section</Label>
              <Select
                value={(config.section as string) || "news"}
                onValueChange={(value) => handleConfigChange("section", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="news">News Articles</SelectItem>
                  <SelectItem value="scores">Game Scores</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="espnLeague">League (optional)</Label>
              <Input
                id="espnLeague"
                placeholder="nfl, nba, mlb..."
                value={(config.league as string) || ""}
                onChange={(e) => handleConfigChange("league", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use default for the sport
              </p>
            </div>
          </div>
        );

      case "SPORTSGRID_API":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sgApiToken">API Token</Label>
              <Input
                id="sgApiToken"
                type="password"
                placeholder="Bearer token (or use SPORTSGRID_API_TOKEN env var)"
                value={(config.apiToken as string) || ""}
                onChange={(e) => handleConfigChange("apiToken", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use SPORTSGRID_API_TOKEN environment variable
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sgSport">Sport Override (optional)</Label>
              <Select
                value={(config.sport as string) || ""}
                onValueChange={(value) => handleConfigChange("sport", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Use source sport" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NFL">NFL Football</SelectItem>
                  <SelectItem value="NBA">NBA Basketball</SelectItem>
                  <SelectItem value="MLB">MLB Baseball</SelectItem>
                  <SelectItem value="NHL">NHL Hockey</SelectItem>
                  <SelectItem value="CBB">College Basketball</SelectItem>
                  <SelectItem value="CFB">College Football</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Leave empty to use the source sport setting
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Note: Recommended refresh interval: 10+ minutes.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Source Information</CardTitle>
          <CardDescription>Configure your news source</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Source Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g., ESPN NFL News"
              defaultValue={initialData?.name}
              required
              disabled={isLoading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Source Type</Label>
              <Select
                name="type"
                value={sourceType}
                onValueChange={(value) => {
                  setSourceType(value);
                  setConfig({});
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <type.icon className="h-4 w-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sport">Sport</Label>
              <Select name="sport" defaultValue={initialData?.sport || "NFL"}>
                <SelectTrigger>
                  <SelectValue />
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
          </div>
        </CardContent>
      </Card>

      {/* Source Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Source Configuration</CardTitle>
          <CardDescription>
            Configure how to fetch data from this source
          </CardDescription>
        </CardHeader>
        <CardContent>{renderConfigFields()}</CardContent>
      </Card>

      {/* Schedule Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Schedule Settings
          </CardTitle>
          <CardDescription>Configure automatic fetching</CardDescription>
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
              Enable automatic fetching
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

              {scheduleType === "HOURLY" && (
                <div className="space-y-2">
                  <Label>Refresh Interval</Label>
                  <Select
                    name="refreshInterval"
                    defaultValue={(initialData?.refreshInterval || 60).toString()}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFRESH_INTERVALS.map((interval) => (
                        <SelectItem key={interval.value} value={interval.value}>
                          {interval.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

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
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {scheduleType === "CUSTOM" && (
                <div className="space-y-2">
                  <Label htmlFor="scheduleCron">Cron Expression</Label>
                  <Input
                    id="scheduleCron"
                    name="scheduleCron"
                    placeholder="*/30 * * * *"
                    defaultValue={initialData?.scheduleCron || ""}
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    e.g., &quot;*/30 * * * *&quot; for every 30 minutes
                  </p>
                </div>
              )}
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
              ? "Create Source"
              : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
