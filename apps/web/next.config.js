import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@cata-centavo/core", "@cata-centavo/pluggy", "@cata-centavo/storage"],
  turbopack: {
    root: fileURLToPath(new URL("../..", import.meta.url)),
  },
  // The e2e suite drives the dev server via 127.0.0.1; Next 16 flags the
  // origin otherwise (and will require it in a future major).
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
