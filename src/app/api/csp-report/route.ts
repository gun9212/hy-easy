// Receives CSP violation reports (report-uri) and logs a trimmed line per report for Vercel logs.
const MAX_BODY_BYTES = 8_192;

type Report = Record<string, unknown>;

function pick(report: Report): Record<string, string> {
  const fields = [
    "document-uri",
    "violated-directive",
    "effective-directive",
    "blocked-uri",
    "source-file",
    "line-number",
  ];
  return Object.fromEntries(fields.filter(f => report[f] !== undefined).map(f => [f, String(report[f]).slice(0, 200)]));
}

export async function POST(request: Request) {
  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BODY_BYTES) return new Response(null, { status: 204 });
  try {
    const body = JSON.parse(text) as { "csp-report"?: Report } | Report[];
    const reports = Array.isArray(body) ? body.map(r => (r.body ?? r) as Report) : [body["csp-report"] ?? {}];
    for (const r of reports.slice(0, 10)) console.warn(JSON.stringify({ event: "csp_violation", ...pick(r) }));
  } catch {
    // Malformed report: ignore.
  }
  return new Response(null, { status: 204 });
}
