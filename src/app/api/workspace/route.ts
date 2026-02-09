import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { hasAppSecret } from "@/lib/auth";
import { getMetaValue, setMetaValue } from "@/lib/db/repository";
import { badRequest, internalServerError, unauthorized } from "@/lib/http";
import { updateWorkspaceSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const CANVAS_TITLE_META_KEY = "canvas_title";
const DEFAULT_CANVAS_TITLE = "Moddyland Operations Canvas";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (!hasAppSecret(request)) {
      return unauthorized();
    }

    const storedTitle = await getMetaValue(CANVAS_TITLE_META_KEY);
    const title = storedTitle?.trim() || DEFAULT_CANVAS_TITLE;

    return NextResponse.json({ title });
  } catch (error) {
    return internalServerError(error);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    if (!hasAppSecret(request)) {
      return unauthorized();
    }

    const payload = updateWorkspaceSchema.parse(await request.json());
    const title = payload.title.trim();

    if (!title) {
      return badRequest("Title is required");
    }

    await setMetaValue(CANVAS_TITLE_META_KEY, title);

    return NextResponse.json({ title });
  } catch (error) {
    if (error instanceof ZodError) {
      return badRequest(error.message);
    }

    return internalServerError(error);
  }
}
