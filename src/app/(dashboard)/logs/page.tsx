import { getTenantContext } from "@/lib/tenant-prisma";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileText,
  User,
  Search,
  Play,
  UserPlus,
  Settings,
  Download,
  Bell,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { AuditEventType } from "@prisma/client";

async function getAuditLogs(orgId: string, limit = 100) {
  return prisma.auditEvent.findMany({
    where: { orgId },
    include: {
      actorUser: {
        select: { name: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

function getEventIcon(eventType: AuditEventType) {
  switch (eventType) {
    case "ORG_CREATED":
    case "ORG_UPDATED":
      return <Settings className="h-4 w-4" />;
    case "MEMBER_INVITED":
    case "MEMBER_JOINED":
    case "MEMBER_REMOVED":
    case "MEMBER_ROLE_CHANGED":
      return <UserPlus className="h-4 w-4" />;
    case "QUERY_CREATED":
    case "QUERY_UPDATED":
    case "QUERY_DELETED":
      return <Search className="h-4 w-4" />;
    case "QUERY_RUN_STARTED":
    case "QUERY_RUN_COMPLETED":
      return <Play className="h-4 w-4" />;
    case "CANDIDATE_STATUS_CHANGED":
      return <Bell className="h-4 w-4" />;
    case "EXPORT_STARTED":
    case "EXPORT_COMPLETED":
      return <Download className="h-4 w-4" />;
    case "LOG_ENTRY_CREATED":
    case "LOG_ENTRY_DELETED":
      return <FileText className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
}

function getEventBadgeVariant(
  eventType: AuditEventType
): "default" | "secondary" | "destructive" | "outline" {
  if (eventType.includes("DELETED") || eventType.includes("REMOVED")) {
    return "destructive";
  }
  if (eventType.includes("CREATED") || eventType.includes("STARTED")) {
    return "default";
  }
  if (eventType.includes("COMPLETED")) {
    return "secondary";
  }
  return "outline";
}

function formatEventType(eventType: AuditEventType): string {
  return eventType
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

export default async function LogsPage() {
  const { orgId } = await getTenantContext();
  const logs = await getAuditLogs(orgId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Activity Logs</h1>
        <p className="text-muted-foreground">
          Audit trail of actions performed in your organization
        </p>
      </div>

      {/* Logs Table */}
      {logs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Showing the last {logs.length} events
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Type</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getEventIcon(log.eventType)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge
                          variant={getEventBadgeVariant(log.eventType)}
                          className="w-fit"
                        >
                          {formatEventType(log.eventType)}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {log.action}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {log.actorUser?.name || log.actorUser?.email || "System"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {log.entityType}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(log.createdAt, { addSuffix: true })}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No activity yet</h3>
            <p className="text-muted-foreground text-center">
              Activity logs will appear here as you use the application.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
