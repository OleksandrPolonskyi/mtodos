import { type NextRequest, NextResponse } from "next/server";
import { hasAppSecret } from "@/lib/auth";
import { buildDashboardWeekly } from "@/lib/dashboard";
import { listBlocks, listTasks } from "@/lib/db/repository";
import { internalServerError, unauthorized } from "@/lib/http";
import { serverEnv } from "@/lib/env.server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (!hasAppSecret(request)) {
      return unauthorized();
    }

    const [blocks, tasks] = await Promise.all([listBlocks(), listTasks()]);
    const dashboard = buildDashboardWeekly(blocks, tasks, serverEnv.appTimezone);
    return NextResponse.json(dashboard);
  } catch (error) {
    return internalServerError(error);
  }
}
