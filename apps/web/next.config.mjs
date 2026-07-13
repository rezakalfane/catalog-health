/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@catalog-health/core"],
  // Runtime packages with native code or package-relative assets must not be bundled.
  serverExternalPackages: ["better-sqlite3", "pdfkit"],
};
export default nextConfig;
