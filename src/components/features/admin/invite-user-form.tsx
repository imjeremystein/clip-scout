"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { inviteUser } from "@/server/actions/admin/users";

export function InviteUserForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast.error("Please enter an email address");
      return;
    }

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.set("email", email);
      formData.set("role", role);

      await inviteUser(formData);
      toast.success("Invitation sent successfully");
      router.push("/admin/users");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send invitation");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="email">Email Address</Label>
        <Input
          id="email"
          type="email"
          placeholder="user@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          required
        />
        <p className="text-sm text-muted-foreground">
          The user will receive an email with instructions to complete their registration.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Select value={role} onValueChange={(v) => setRole(v as "USER" | "ADMIN")} disabled={isLoading}>
          <SelectTrigger id="role">
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="USER">
              <div className="flex flex-col">
                <span>User</span>
                <span className="text-xs text-muted-foreground">
                  Can view news/clips, create queries, shortlist candidates
                </span>
              </div>
            </SelectItem>
            <SelectItem value="ADMIN">
              <div className="flex flex-col">
                <span>Admin</span>
                <span className="text-xs text-muted-foreground">
                  Full access: manage users, configure sources, system settings
                </span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

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
          {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Send Invitation
        </Button>
      </div>
    </form>
  );
}
