import { DashboardView } from "@/components/dashboard/dashboard-view";
import { assertWorkspaceAccess } from "@/lib/workspace";

interface DashboardPageProps {
  params: Promise<{ workspace: string }>;
}

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params
}: DashboardPageProps): Promise<React.ReactElement> {
  const { workspace } = await params;
  assertWorkspaceAccess(workspace);

  return <DashboardView workspace={workspace} />;
}
