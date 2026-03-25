import type { NextConfig } from "next";

const isGhPages = process.env.GITHUB_ACTIONS === "true";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isGhPages ? "/taxidermy" : "",
  assetPrefix: isGhPages ? "/taxidermy/" : "",
  images: { unoptimized: true },
};

export default nextConfig;
