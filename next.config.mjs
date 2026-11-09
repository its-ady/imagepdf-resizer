// A new id for every build/deploy. The service worker uses it to version its cache,
// so users always receive the new version (and old caches are cleaned up automatically).
const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.NEXT_PUBLIC_BUILD_ID ||
  `local-${Date.now()}`

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  generateBuildId: async () => buildId,
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
}

export default nextConfig
