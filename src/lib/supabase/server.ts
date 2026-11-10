import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function isConfigured() { return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY); }
export function demoEnabled() { return process.env.NODE_ENV === "development" || process.env.DEMO_ENABLED === "true"; }
export async function serverClient() {
  if (!isConfigured()) throw new Error("Supabase 연결이 필요합니다.");
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar.getAll(), setAll: values => { try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* Server component: proxy refreshes cookies. */ } } },
  });
}
