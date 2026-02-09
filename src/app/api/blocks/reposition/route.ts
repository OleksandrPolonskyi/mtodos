import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { hasAppSecret } from "@/lib/auth";
import { badRequest, internalServerError, unauthorized } from "@/lib/http";
import { repositionBlocks } from "@/lib/db/repository";
import { repositionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!hasAppSecret(request)) {
      return unauthorized();
    }

    const payload = repositionSchema.parse(await request.json());
    await repositionBlocks(payload.positions);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return badRequest(error.message);
    }

    return internalServerError(error);
  }
}
