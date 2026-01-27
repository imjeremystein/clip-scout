import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

// Default user for internal tool - no auth required
const defaultUser = {
  id: "internal-user",
  name: "Clip Scout User",
  email: "user@clipscout.local",
  image: null,
  organizationId: null,
  organizationName: "Clip Scout",
  organizationRole: "MANAGER" as const,
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header user={defaultUser} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
