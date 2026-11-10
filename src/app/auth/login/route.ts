import { NextResponse } from "next/server";
import { isConfigured, serverClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  if (!isConfigured()) return NextResponse.redirect(new URL("/login?error=setup", request.url));
  const db = await serverClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const { data, error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback`, queryParams: { hd: "hanyang.ac.kr", prompt: "select_account" } },
  });
  if (error || !data.url) return NextResponse.redirect(new URL("/login?error=oauth", request.url));
  return NextResponse.redirect(data.url);
}
