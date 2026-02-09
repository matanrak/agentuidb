import { resolve } from "path";
import { config } from "dotenv";
import type { NextConfig } from "next";

config({ path: resolve(import.meta.dirname, "../.env.local") });

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
};

export default nextConfig;
