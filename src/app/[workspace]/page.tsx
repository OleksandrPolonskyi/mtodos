import { WorkspaceCanvas } from "@/components/canvas/workspace-canvas";
import { assertWorkspaceAccess } from "@/lib/workspace";

interface WorkspacePageProps {
  params: Promise<{ workspace: string }>;
}

export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  params
}: WorkspacePageProps): Promise<React.ReactElement> {
  const { workspace } = await params;
  assertWorkspaceAccess(workspace);

  return <WorkspaceCanvas workspace={workspace} />;
}
