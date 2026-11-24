import { headers } from "next/headers";
import { userAgent } from "next/server";

/**
 * Whether this request comes from a phone, so the server renders the folded phone layout the browser will keep.
 * Tablets and desktops get the wide layout; a narrow desktop window is corrected after hydration.
 */
export async function isPhoneRequest(): Promise<boolean> {
  return userAgent({ headers: await headers() }).device.type === "mobile";
}
