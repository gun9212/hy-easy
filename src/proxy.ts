import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, CSP_HEADER, newNonce } from "@/lib/csp";

/** Pages that never read a user: no session refresh, and not marked private. */
const PUBLIC_PAGES = ["/privacy", "/demo"];

/**
 * Every page: a per-request CSP nonce, passed to Next.js in the request headers (it nonces its own scripts) and
 * sent to the browser in the response. Signed-in pages also refresh the Supabase session cookie.
 */
export async function proxy(request: NextRequest) {
  const nonce = newNonce();
  const csp = buildCsp(nonce);
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set(CSP_HEADER, csp);
    return NextResponse.next({ request: { headers } });
  };
  let response = forward();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const isPublic = PUBLIC_PAGES.some(p => request.nextUrl.pathname.startsWith(p));
  if (url && key && !isPublic) {
    const client = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: values => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = forward();
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    await client.auth.getClaims();
    response.headers.set("Cache-Control", "private, no-store");
  }
  response.headers.set(CSP_HEADER, csp);
  return response;
}

// Static files (scripts, logo, images, fonts) skip the proxy, so browsers and the CDN can cache them.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|brand/|fonts/|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2)$).*)",
  ],
};
