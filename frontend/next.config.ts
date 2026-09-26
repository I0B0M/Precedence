import type { NextConfig } from "next";

// The browser only ever talks to this app; /api/* is forwarded to the FastAPI backend.
const API = process.env.STONE_API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  devIndicators: false, // keep the dev bubble out of screenshots and the demo video
  // Old routes from before the landing page; query strings (e.g. /lab?t=BX&s=rate_jump) carry over.
  async redirects() {
    return [
      { source: "/lab", destination: "/signals", permanent: false },
      { source: "/practice", destination: "/paper", permanent: false },
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
};

export default nextConfig;
