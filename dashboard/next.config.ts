import { resolve } from "path";
import { existsSync } from "fs";
import { config } from "dotenv";
import type { NextConfig } from "next";

const root = resolve(import.meta.dirname, "..");
const envFile = existsSync(resolve(root, ".env.local"))
  ? ".env.local"
  : ".env.template";
config({ path: resolve(root, envFile) });

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  serverExternalPackages: ["@surrealdb/node"],
};

export default nextConfig;
