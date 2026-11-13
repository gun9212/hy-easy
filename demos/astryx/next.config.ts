import type { NextConfig } from "next";

// The demo reads the main app's sample postings from ../../src/lib. Turbopack refuses files outside its root,
// and widening the root makes Next pick up the main app's src/proxy.ts, so the demo runs on webpack.
const config: NextConfig = {
  poweredByHeader: false,
  experimental: { externalDir: true },
};
export default config;
