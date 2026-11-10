import { NextResponse } from "next/server";
import { requireUser, sameOrigin, errorResponse } from "@/lib/auth";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db } = await requireUser();
    await db.auth.signOut();
    return NextResponse.redirect(new URL("/login", request.url), 303);
  } catch (e) {
    return errorResponse(e);
  }
}
