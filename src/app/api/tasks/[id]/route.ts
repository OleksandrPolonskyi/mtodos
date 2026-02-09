import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { hasAppSecret } from "@/lib/auth";
import { badRequest, internalServerError, unauthorized } from "@/lib/http";
import { deleteTask, updateTask } from "@/lib/db/repository";
import { updateTaskSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    if (!hasAppSecret(request)) {
      return unauthorized();
    }

    const { id } = await context.params;

    if (!id) {
      return badRequest("Missing task id");
    }

    const payload = updateTaskSchema.parse(await request.json());
    const task = await updateTask(id, payload);
    return NextResponse.json({ task });
  } catch (error) {
    if (error instanceof ZodError) {
      return badRequest(error.message);
    }

    return internalServerError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    if (!hasAppSecret(request)) {
      return unauthorized();
    }

    const { id } = await context.params;

    if (!id) {
      return badRequest("Missing task id");
    }

    await deleteTask(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return internalServerError(error);
  }
}
