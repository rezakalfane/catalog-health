/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@catalog-health/core"],
  // Native module — must be required at runtime, not bundled.
  serverExternalPackages: ["better-sqlite3"],
};
export default nextConfig;
