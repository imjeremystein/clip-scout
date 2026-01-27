import { Shield, Key, Bell, Database, Server } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// In a real app, these would come from environment variables or a settings store
const systemSettings = {
  apiKeys: {
    youtube: !!process.env.YOUTUBE_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    google: !!process.env.GOOGLE_AI_API_KEY,
    twitter: !!process.env.TWITTER_BEARER_TOKEN,
  },
  database: {
    connected: true,
    provider: "PostgreSQL",
  },
  queue: {
    connected: true,
    provider: "Redis (BullMQ)",
  },
};

function ApiKeyStatus({ configured }: { configured: boolean }) {
  return configured ? (
    <Badge variant="secondary" className="bg-green-100 text-green-800">
      Configured
    </Badge>
  ) : (
    <Badge variant="secondary" className="bg-red-100 text-red-800">
      Not Set
    </Badge>
  );
}

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-muted-foreground">
          View system configuration and service status
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* API Keys */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              <CardTitle>API Keys</CardTitle>
            </div>
            <CardDescription>
              External service API keys configured via environment variables
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">YouTube Data API</p>
                <p className="text-sm text-muted-foreground">
                  For video search and metadata
                </p>
              </div>
              <ApiKeyStatus configured={systemSettings.apiKeys.youtube} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Anthropic API</p>
                <p className="text-sm text-muted-foreground">
                  For AI news analysis
                </p>
              </div>
              <ApiKeyStatus configured={systemSettings.apiKeys.anthropic} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Google AI API</p>
                <p className="text-sm text-muted-foreground">
                  For content analysis
                </p>
              </div>
              <ApiKeyStatus configured={systemSettings.apiKeys.google} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Twitter API</p>
                <p className="text-sm text-muted-foreground">
                  For Twitter/X news sources
                </p>
              </div>
              <ApiKeyStatus configured={systemSettings.apiKeys.twitter} />
            </div>
          </CardContent>
        </Card>

        {/* Infrastructure Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              <CardTitle>Infrastructure</CardTitle>
            </div>
            <CardDescription>
              Core services and infrastructure status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Database</p>
                  <p className="text-sm text-muted-foreground">
                    {systemSettings.database.provider}
                  </p>
                </div>
              </div>
              <Badge
                variant="secondary"
                className={
                  systemSettings.database.connected
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }
              >
                {systemSettings.database.connected ? "Connected" : "Disconnected"}
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Job Queue</p>
                  <p className="text-sm text-muted-foreground">
                    {systemSettings.queue.provider}
                  </p>
                </div>
              </div>
              <Badge
                variant="secondary"
                className={
                  systemSettings.queue.connected
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }
              >
                {systemSettings.queue.connected ? "Connected" : "Disconnected"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Environment Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <CardTitle>Environment</CardTitle>
            </div>
            <CardDescription>
              Current deployment environment information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">Environment</p>
              <Badge variant="outline">
                {process.env.NODE_ENV || "development"}
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">Vercel</p>
              <Badge variant="outline">
                {process.env.VERCEL ? "Yes" : "No"}
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">Region</p>
              <Badge variant="outline">
                {process.env.VERCEL_REGION || "local"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Application Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <CardTitle>Application</CardTitle>
            </div>
            <CardDescription>
              Application configuration and defaults
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">App Name</p>
              <span className="font-medium">Clip Scout</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">Default Timezone</p>
              <span className="font-medium">America/New_York</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">Source Refresh Default</p>
              <span className="font-medium">60 minutes</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">Min Importance Score</p>
              <span className="font-medium">40 (for clip pairing)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Note about settings management */}
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground text-center">
            System settings are managed through environment variables. Contact your system
            administrator to update API keys or infrastructure configuration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
