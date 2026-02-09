import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { hasAppSecret } from "@/lib/auth";
import { badRequest, internalServerError, unauthorized } from "@/lib/http";
import { createTask, listTasks } from "@/lib/db/repository";
import { createTaskSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (!hasAppSecret(request)) {
      return unauthorized();
    }

    const blockId = request.nextUrl.searchParams.get("blockId") ?? undefined;
    const tasks = await listTasks(blockId);
    return NextResponse.json({ tasks });
  } catch (error) {
    return internalServerError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!hasAppSecret(request)) {
      return unauthorized();
    }

    const payload = createTaskSchema.parse(await request.json());
    const task = await createTask(payload);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return badRequest(error.message);
    }

    return internalServerError(error);
  }
}
