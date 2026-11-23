// Content Security Policy. Pages get a fresh nonce per request (set in src/proxy.ts); Next.js puts it on its own
// scripts, and 'strict-dynamic' lets those scripts load what they need (the Google sign-in client).

/** Enforced since 2026-11-23 (a week of report-only logs held one violation: zod's eval probe, now off in src/lib/zod.ts). */
export const CSP_ENFORCED = true;
export const CSP_HEADER = CSP_ENFORCED ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
export const CSP_REPORT_PATH = "/api/csp-report";

const GOOGLE_SIGN_IN = "https://accounts.google.com/gsi/";

export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp(nonce: string, dev = process.env.NODE_ENV === "development", enforced = CSP_ENFORCED): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-eval' only for the dev server (React debugging); production never evaluates strings.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // React style attributes and the Google button's injected styles are inline.
    "style-src": ["'self'", "'unsafe-inline'", `${GOOGLE_SIGN_IN}style`],
    "img-src": ["'self'", "data:", "blob:", "https://*.googleusercontent.com"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", GOOGLE_SIGN_IN],
    "frame-src": [GOOGLE_SIGN_IN],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "report-uri": [CSP_REPORT_PATH],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  // Browsers ignore upgrade-insecure-requests in a report-only policy (and log an error), so add it when enforcing.
  return [...policy, ...(enforced && !dev ? ["upgrade-insecure-requests"] : [])].join("; ");
}
