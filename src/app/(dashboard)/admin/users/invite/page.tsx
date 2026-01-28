import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InviteUserForm } from "@/components/features/admin/invite-user-form";

export default function InviteUserPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/users">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create User</h1>
          <p className="text-muted-foreground">
            Add a new user to the system
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Details</CardTitle>
          <CardDescription>
            Enter the new user&apos;s information and set their initial password.
            They can change their password after signing in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteUserForm />
        </CardContent>
      </Card>
    </div>
  );
}
