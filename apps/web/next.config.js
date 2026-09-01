/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: false },

  // The browser always talks to its own origin: `lib/api.ts` uses relative
  // paths and both EventSource streams are relative. This rewrite is what
  // actually reaches the API, so its target is a server-only variable.
  //
  // Keeping NEXT_PUBLIC_API_URL unset in production is deliberate — it makes
  // the whole app same-origin, which means no CORS surface and no preflight on
  // any of the WebMCP tool calls.
  async rewrites() {
    const apiTarget = (
      process.env.API_PROXY_TARGET ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:8000'
    ).replace(/\/$/, '');
    return [{ source: '/api/:path*', destination: `${apiTarget}/api/:path*` }];
  },
};
module.exports = nextConfig;
