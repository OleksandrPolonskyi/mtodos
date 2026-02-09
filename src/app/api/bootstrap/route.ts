import { type NextRequest, NextResponse } from "next/server";
import { hasAppSecret } from "@/lib/auth";
import { initialBlockPreset } from "@/lib/initial-blocks";
import {
  createBlock,
  getMetaValue,
  listBlocks,
  setMetaValue
} from "@/lib/db/repository";
import { internalServerError, unauthorized } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!hasAppSecret(request)) {
      return unauthorized();
    }

    const bootstrapDone = await getMetaValue("bootstrap_done");

    if (bootstrapDone === "true") {
      const blocks = await listBlocks();
      return NextResponse.json({ bootstrapped: false, created: 0, blocks });
    }

    const existing = await listBlocks();

    if (existing.length > 0) {
      await setMetaValue("bootstrap_done", "true");
      return NextResponse.json({ bootstrapped: false, created: 0, blocks: existing });
    }

    const created = [];

    for (const seed of initialBlockPreset) {
      const block = await createBlock(seed);
      created.push(block);
    }

    await setMetaValue("bootstrap_done", "true");

    return NextResponse.json({
      bootstrapped: true,
      created: created.length,
      blocks: created
    });
  } catch (error) {
    return internalServerError(error);
  }
}
