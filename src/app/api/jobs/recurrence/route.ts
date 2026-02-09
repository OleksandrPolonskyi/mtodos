import { type NextRequest, NextResponse } from "next/server";
import { hasAppSecret, hasJobsSecret } from "@/lib/auth";
import { listTasks, createTasksBatch } from "@/lib/db/repository";
import { internalServerError, unauthorized } from "@/lib/http";
import { planRecurringTasks } from "@/lib/recurrence";
import { serverEnv } from "@/lib/env.server";

export const dynamic = "force-dynamic";

async function runRecurrence(request: NextRequest): Promise<NextResponse> {
  try {
    if (!hasJobsSecret(request) && !hasAppSecret(request)) {
      return unauthorized();
    }

    const tasks = await listTasks();
    const planned = planRecurringTasks(tasks, serverEnv.appTimezone);

    if (planned.length === 0) {
      return NextResponse.json({ scanned: tasks.length, created: 0 });
    }

    const created = await createTasksBatch(planned);

    return NextResponse.json({
      scanned: tasks.length,
      created: created.length
    });
  } catch (error) {
    return internalServerError(error);
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return runRecurrence(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return runRecurrence(request);
}
