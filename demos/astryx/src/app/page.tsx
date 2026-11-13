import { headers } from "next/headers";
import { loadPostingsSource } from "@demo/lib/postings-source";
import { PostingsApp } from "@demo/components/postings-app";
import { mainAppUrl } from "@demo/lib/main-app";

// Reads the visitor's session cookie, so it renders per request.
export const dynamic = "force-dynamic";

/** A guess for the first render only (Client Hints, then the user agent); the client corrects it on hydration. */
function looksLikePhone(h: Headers): boolean {
  const hint = h.get("sec-ch-ua-mobile");
  if (hint) return hint === "?1";
  return /Mobi|Android|iPhone/i.test(h.get("user-agent") ?? "");
}

export default async function Page(): Promise<React.ReactElement> {
  const [source, h] = await Promise.all([loadPostingsSource(), headers()]);
  return (
    <PostingsApp
      postings={source.postings}
      now={source.now}
      reason={source.reason}
      mainAppBase={mainAppUrl(h.get("host"), "/")}
      initialNarrow={looksLikePhone(h)}
    />
  );
}
