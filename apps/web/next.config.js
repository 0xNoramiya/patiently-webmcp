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
    return [
      { source: '/api/:path*', destination: `${apiTarget}/api/:path*` },
      // Next treats a leading-dot path segment as hidden, so the manifest is
      // implemented at a normal route and surfaced at the well-known location.
      { source: '/.well-known/webmcp', destination: '/webmcp-manifest' },
      { source: '/.well-known/webmcp.json', destination: '/webmcp-manifest' },
    ];
  },
};
module.exports = nextConfig;
