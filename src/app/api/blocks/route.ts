import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { hasAppSecret } from "@/lib/auth";
import { badRequest, internalServerError, unauthorized } from "@/lib/http";
import { createBlock, listBlocks } from "@/lib/db/repository";
import { createBlockSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (!hasAppSecret(request)) {
      return unauthorized();
    }

    const blocks = await listBlocks();
    return NextResponse.json({ blocks });
  } catch (error) {
    return internalServerError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!hasAppSecret(request)) {
      return unauthorized();
    }

    const payload = createBlockSchema.parse(await request.json());
    const block = await createBlock(payload);
    return NextResponse.json({ block }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return badRequest(error.message);
    }

    return internalServerError(error);
  }
}
