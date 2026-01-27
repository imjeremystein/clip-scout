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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Download, FileJson, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { requestExport } from "@/server/actions/exports";
import { ExportFormat } from "@prisma/client";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateIds: string[];
}

export function ExportDialog({
  open,
  onOpenChange,
  candidateIds,
}: ExportDialogProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("CSV");

  const handleExport = async () => {
    if (candidateIds.length === 0) {
      toast.error("No candidates selected");
      return;
    }

    setIsLoading(true);
    try {
      const result = await requestExport({
        candidateIds,
        format,
      });

      toast.success("Export ready!");
      onOpenChange(false);
      
      // Trigger download
      window.location.href = `/api/export/${result.exportId}/download`;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to export"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Export Candidates</DialogTitle>
          <DialogDescription>
            Export {candidateIds.length} selected candidate{candidateIds.length !== 1 ? "s" : ""} to a file.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="format">Export Format</Label>
            <Select
              value={format}
              onValueChange={(v) => setFormat(v as ExportFormat)}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CSV">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    CSV (Spreadsheet)
                  </div>
                </SelectItem>
                <SelectItem value="JSON">
                  <div className="flex items-center gap-2">
                    <FileJson className="h-4 w-4" />
                    JSON (Structured)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm text-muted-foreground">
            <p>The export will include:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Video details and YouTube URLs</li>
              <li>Relevance scores and AI insights</li>
              <li>Key moments with timestamps</li>
              <li>Query and sport information</li>
            </ul>
          </div>
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
          <Button onClick={handleExport} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
