import type { NextConfig } from "next";

// The browser only ever talks to this app; /api/* is forwarded to the FastAPI backend.
const API = process.env.STONE_API_URL ?? "http://localhost:8000";
// The live site (Netlify) has no backend: it reads saved responses from public/saved (see src/lib/api.ts).
const SAVED = process.env.NEXT_PUBLIC_STONE_SAVED === "1";

const nextConfig: NextConfig = {
  devIndicators: false, // keep the dev bubble out of screenshots and the demo video
  async rewrites() {
    return SAVED ? [] : [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
};

export default nextConfig;
