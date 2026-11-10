import { NextResponse } from "next/server";
import { serverClient, isConfigured } from "@/lib/supabase/server";
import { isSchoolUser } from "@/lib/auth-policy";
export async function GET(request: Request) {
  const url = new URL(request.url), code = url.searchParams.get("code");
  if (!code || !isConfigured()) return NextResponse.redirect(new URL("/login?error=oauth",request.url));
  const db = await serverClient();
  const { error } = await db.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=oauth",request.url));
  const { data: { user } } = await db.auth.getUser();
  if (!isSchoolUser(user)) { await db.auth.signOut(); return NextResponse.redirect(new URL("/login?error=school",request.url)); }
  return NextResponse.redirect(new URL("/postings",request.url));
}
