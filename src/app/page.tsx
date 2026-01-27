import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const sports = [
  { name: "NFL", color: "bg-red-500" },
  { name: "NBA", color: "bg-orange-500" },
  { name: "MLB", color: "bg-blue-500" },
  { name: "NHL", color: "bg-cyan-500" },
  { name: "Soccer", color: "bg-green-500" },
  { name: "Boxing", color: "bg-purple-500" },
  { name: "Sports Betting", color: "bg-yellow-500" },
];

const features = [
  {
    title: "AI-Powered Discovery",
    description:
      "Automatically find the most relevant clips from thousands of YouTube videos using advanced AI analysis.",
  },
  {
    title: "Key Moment Detection",
    description:
      "Jump directly to the best moments with AI-extracted timestamps and context summaries.",
  },
  {
    title: "Team Collaboration",
    description:
      "Share queries and candidates with your team. Managers can oversee activity across the organization.",
  },
  {
    title: "Scheduled Runs",
    description:
      "Set up daily or custom schedules to automatically refresh your searches and stay current.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <span className="text-2xl font-bold">Clip Scout</span>
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/login">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <Badge variant="secondary" className="mb-4">
            AI-Powered Video Discovery
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Find the Perfect YouTube Clips for Broadcast Discussion
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Clip Scout uses AI to analyze YouTube videos, extract transcripts,
            and identify the most relevant moments for your sports broadcast
            needs.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login">
              <Button size="lg" className="w-full sm:w-auto">
                Start Free Trial
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Sports Categories */}
      <section className="py-12 px-4 bg-muted/50">
        <div className="container mx-auto text-center">
          <h2 className="text-sm font-semibold text-muted-foreground mb-4">
            SUPPORTED SPORTS CATEGORIES
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            {sports.map((sport) => (
              <Badge
                key={sport.name}
                variant="secondary"
                className="text-sm px-4 py-2"
              >
                <span
                  className={`w-2 h-2 rounded-full ${sport.color} mr-2`}
                ></span>
                {sport.name}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">
              Everything You Need to Find the Best Clips
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From automated YouTube searches to AI-powered moment extraction,
              Clip Scout streamlines your video research workflow.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {features.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{feature.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 bg-muted/50">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                1
              </div>
              <h3 className="font-semibold mb-2">Create a Query</h3>
              <p className="text-sm text-muted-foreground">
                Select a sport, add keywords, and set your search parameters.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                2
              </div>
              <h3 className="font-semibold mb-2">AI Analysis</h3>
              <p className="text-sm text-muted-foreground">
                Our AI searches YouTube, fetches transcripts, and ranks
                relevance.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                3
              </div>
              <h3 className="font-semibold mb-2">Review & Export</h3>
              <p className="text-sm text-muted-foreground">
                Browse top 100 candidates, jump to key moments, and export your
                picks.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-2xl">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Find Your Next Great Clip?
          </h2>
          <p className="text-muted-foreground mb-8">
            Join teams already using Clip Scout to discover relevant YouTube
            content for broadcast discussion.
          </p>
          <Link href="/login">
            <Button size="lg">Get Started Free</Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4">
        <div className="container mx-auto text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Clip Scout. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
