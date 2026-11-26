import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/auth";
import { serverClient, isConfigured } from "@/lib/supabase/server";
import { isSchoolUser } from "@/lib/auth-policy";
export async function GET(request: Request) {
  const url = new URL(request.url),
    baseOrigin = requestOrigin(request),
    code = url.searchParams.get("code");
  if (!code || !isConfigured()) return NextResponse.redirect(new URL("/login?error=oauth", baseOrigin));
  const db = await serverClient();
  const { error } = await db.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=oauth", baseOrigin));
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!isSchoolUser(user)) {
    await db.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=school", baseOrigin));
  }
  return NextResponse.redirect(new URL("/postings", baseOrigin));
}
