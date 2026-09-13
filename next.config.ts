import type { NextConfig } from "next";

// Sandbox by default. It is a live backend, not a mock: it can still move money.
const SPIDI_API_URL =
  process.env.SPIDI_API_URL ??
  "https://sandbox.api.spidipagos.com/api/spidipagos";

const nextConfig: NextConfig = {
  transpilePackages: ["@tiquemax/spidi-react"],
  async rewrites() {
    // Browser calls to SPIDI go through here so CORS is not an issue.
    return [
      {
        source: "/spidi-api/:path*",
        destination: `${SPIDI_API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
