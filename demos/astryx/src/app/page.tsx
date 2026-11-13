import { headers } from "next/headers";
import { loadPostingsSource } from "@demo/lib/postings-source";
import { PostingsApp } from "@demo/components/postings-app";

// Reads the visitor's session cookie, so it renders per request.
export const dynamic = "force-dynamic";
const MAIN_APP_PORT = 3000;

/** The main app's login page on the host this demo was opened with; the session cookie is shared per host. */
async function mainAppLogin(): Promise<string> {
  const host = (await headers()).get("host") ?? "127.0.0.1";
  const hostname = host.replace(/:\d+$/, "");
  return `http://${hostname}:${MAIN_APP_PORT}/login`;
}

/** A guess for the first render only (Client Hints, then the user agent); the client corrects it on hydration. */
async function looksLikePhone(): Promise<boolean> {
  const h = await headers();
  const hint = h.get("sec-ch-ua-mobile");
  if (hint) return hint === "?1";
  return /Mobi|Android|iPhone/i.test(h.get("user-agent") ?? "");
}

export default async function Page(): Promise<React.ReactElement> {
  const [source, login, phone] = await Promise.all([loadPostingsSource(), mainAppLogin(), looksLikePhone()]);
  return (
    <PostingsApp
      postings={source.postings}
      now={source.now}
      reason={source.reason}
      mainAppLogin={login}
      initialNarrow={phone}
    />
  );
}
