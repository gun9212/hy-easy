import { NextResponse } from "next/server";
import { sameOrigin, errorResponse } from "@/lib/auth";
import { isConfigured, serverClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (isConfigured()) {
      const db = await serverClient();
      const { error } = await db.auth.signOut().catch(() => ({ error: new Error("signOut failed") }));
      if (error) await db.auth.signOut({ scope: "local" }).catch(() => null);
    }
    return NextResponse.redirect(new URL("/login", request.url), 303);
  } catch (e) {
    return errorResponse(e);
  }
}
