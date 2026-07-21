/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 so eh usado no fallback de dev local; nunca no bundle da Vercel.
  serverExternalPackages: ["better-sqlite3", "pg"],
};

export default nextConfig;
