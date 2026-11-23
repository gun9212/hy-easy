"use client";

import { Analytics } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics: page views and where visitors came from, counted without cookies. Only the path is sent;
 * the query string (search words, filters) is dropped. Listed in the privacy policy (/privacy).
 */
export function SiteAnalytics() {
  return <Analytics beforeSend={event => ({ ...event, url: event.url.split(/[?#]/)[0] })} />;
}
