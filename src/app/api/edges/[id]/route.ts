import { type NextRequest, NextResponse } from "next/server";
import { hasAppSecret } from "@/lib/auth";
import { badRequest, internalServerError, unauthorized } from "@/lib/http";
import { deleteEdge } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
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
      return badRequest("Missing edge id");
    }

    await deleteEdge(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return internalServerError(error);
  }
}
