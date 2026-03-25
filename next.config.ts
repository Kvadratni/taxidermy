import type { NextConfig } from "next";

const isGhPages = process.env.GITHUB_ACTIONS === "true";
const basePath = isGhPages ? "/taxidermy" : "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: isGhPages ? "/taxidermy/" : "",
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
