"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Search,
  Play,
  Bookmark,
  FileText,
  Settings,
  Plus,
  Newspaper,
  DollarSign,
  Trophy,
  Rss,
  Users,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Queries", href: "/queries", icon: Search },
  { name: "Runs", href: "/runs", icon: Play },
  { name: "Candidates", href: "/candidates", icon: Bookmark },
  { name: "Logs", href: "/logs", icon: FileText },
];

const newsNavigation = [
  { name: "News Feed", href: "/news", icon: Newspaper },
  { name: "Odds", href: "/odds", icon: DollarSign },
  { name: "Results", href: "/results", icon: Trophy },
];

const adminNavigation = [
  { name: "Sources", href: "/admin/sources", icon: Rss },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Settings", href: "/admin/settings", icon: Shield },
];

const bottomNavigation = [
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col border-r bg-background">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b">
        <Link href="/dashboard" className="flex items-center space-x-2">
          <span className="text-xl font-bold">Clip Scout</span>
        </Link>
      </div>

      {/* Quick Action */}
      <div className="p-4">
        <Link href="/queries/new">
          <Button className="w-full justify-start" size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Query
          </Button>
        </Link>
      </div>

      <Separator />

      {/* Main Navigation */}
      <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}

        {/* News & Betting Section */}
        <div className="pt-4">
          <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            News & Betting
          </p>
          <div className="mt-2 space-y-1">
            {newsNavigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Admin Section */}
        <div className="pt-4">
          <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Admin
          </p>
          <div className="mt-2 space-y-1">
            {adminNavigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Bottom Navigation */}
      <div className="border-t p-4">
        {bottomNavigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
