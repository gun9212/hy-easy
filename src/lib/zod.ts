import { z } from "zod";

// zod probes whether it may compile parsers with Function("") on first use. Under the enforced Content Security
// Policy (src/lib/csp.ts) that probe is blocked and reported as a violation on every page load; jitless skips it.
// Import z from here, not from "zod", so the setting is in place before any schema parses.
z.config({ jitless: true });

export { z };
