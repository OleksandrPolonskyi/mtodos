import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { hasAppSecret } from "@/lib/auth";
import { badRequest, internalServerError, unauthorized } from "@/lib/http";
import { reorderTasks } from "@/lib/db/repository";
import { reorderTasksSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!hasAppSecret(request)) {
      return unauthorized();
    }

    const payload = reorderTasksSchema.parse(await request.json());
    await reorderTasks(payload.ordering);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return badRequest(error.message);
    }

    return internalServerError(error);
  }
}
