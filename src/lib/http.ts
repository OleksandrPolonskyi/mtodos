import { NextResponse } from "next/server";

export const badRequest = (message: string): NextResponse => {
  return NextResponse.json({ error: message }, { status: 400 });
};

export const unauthorized = (): NextResponse => {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
};

export const internalServerError = (error: unknown): NextResponse => {
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
};
