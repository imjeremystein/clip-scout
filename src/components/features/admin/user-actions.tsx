"use client";

import { useState } from "react";
import { MoreHorizontal, Shield, ShieldOff, Ban, RefreshCw, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  updateUserRole,
  toggleUserStatus,
  deleteUser,
  resendInvite,
} from "@/server/actions/admin/users";

interface UserActionsProps {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    status: string;
  };
}

export function UserActions({ user }: UserActionsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleRoleChange = async (newRole: "ADMIN" | "USER") => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.set("userId", user.id);
      formData.set("role", newRole);
      await updateUserRole(formData);
      toast.success(`Role updated to ${newRole}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update role");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusToggle = async () => {
    setIsLoading(true);
    const newStatus = user.status === "DISABLED" ? "ACTIVE" : "DISABLED";
    try {
      const formData = new FormData();
      formData.set("userId", user.id);
      formData.set("status", newStatus);
      await toggleUserStatus(formData);
      toast.success(`User ${newStatus === "DISABLED" ? "disabled" : "enabled"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendInvite = async () => {
    setIsLoading(true);
    try {
      await resendInvite(user.id);
      toast.success("Invite resent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resend invite");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      await deleteUser(user.id);
      toast.success("User deleted");
      setDeleteDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete user");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Role actions */}
          {user.role === "USER" ? (
            <DropdownMenuItem onClick={() => handleRoleChange("ADMIN")}>
              <Shield className="h-4 w-4 mr-2" />
              Make Admin
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => handleRoleChange("USER")}>
              <ShieldOff className="h-4 w-4 mr-2" />
              Remove Admin
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {/* Status actions */}
          {user.status === "INVITED" && (
            <DropdownMenuItem onClick={handleResendInvite}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Resend Invite
            </DropdownMenuItem>
          )}

          {user.status !== "DISABLED" ? (
            <DropdownMenuItem onClick={handleStatusToggle}>
              <Ban className="h-4 w-4 mr-2" />
              Disable User
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={handleStatusToggle}>
              <Shield className="h-4 w-4 mr-2" />
              Enable User
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {/* Delete action */}
          <DropdownMenuItem
            className="text-red-600"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete User
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {user.name || user.email}? This action cannot be
              undone. The user will lose access to all their data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
