"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PenSquare } from "lucide-react";
import { LoggerModal } from "./logger-modal";
import { Sport } from "@prisma/client";

interface LoggerButtonProps {
  candidateId?: string;
  candidateTitle?: string;
  defaultSport?: Sport;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function LoggerButton({
  candidateId,
  candidateTitle,
  defaultSport,
  variant = "default",
  size = "default",
  className,
}: LoggerButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        className={className}
      >
        <PenSquare className="h-4 w-4 mr-2" />
        Log
      </Button>
      <LoggerModal
        open={open}
        onOpenChange={setOpen}
        candidateId={candidateId}
        candidateTitle={candidateTitle}
        defaultSport={defaultSport}
      />
    </>
  );
}
