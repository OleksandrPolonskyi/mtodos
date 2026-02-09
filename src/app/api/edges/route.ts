import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { hasAppSecret } from "@/lib/auth";
import { badRequest, internalServerError, unauthorized } from "@/lib/http";
import { createEdge, listEdges } from "@/lib/db/repository";
import { createEdgeSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (!hasAppSecret(request)) {
      return unauthorized();
    }

    const edges = await listEdges();
    return NextResponse.json({ edges });
  } catch (error) {
    return internalServerError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!hasAppSecret(request)) {
      return unauthorized();
    }

    const payload = createEdgeSchema.parse(await request.json());

    if (payload.sourceBlockId === payload.targetBlockId) {
      return badRequest("sourceBlockId and targetBlockId cannot be the same");
    }

    const edge = await createEdge(payload);
    return NextResponse.json({ edge }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return badRequest(error.message);
    }

    return internalServerError(error);
  }
}
