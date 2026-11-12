import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: values => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await client.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
// Session refresh is only needed where a user is read. Static files (logo, images, fonts) and the public privacy page
// skip it, so they are not marked private/no-store and browsers and the CDN can cache them.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|demo|privacy|brand/|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2)$).*)",
  ],
};
