import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/webmcp/catalog';

/**
 * Agent crawlers are allowed deliberately.
 *
 * A site whose entire premise is that agents can use it should not then tell
 * their crawlers to go away. The one place they are kept out is `/p/` — those
 * are individual patients' waiting-room pages, and they should not be indexed
 * or trained on by anyone, regardless of how synthetic this demo's data is.
 */
export default function robots(): MetadataRoute.Robots {
  const agents = [
    'GPTBot',
    'ChatGPT-User',
    'OAI-SearchBot',
    'ClaudeBot',
    'Claude-User',
    'anthropic-ai',
    'PerplexityBot',
    'Google-Extended',
    'Applebot-Extended',
    'CCBot',
    'Bytespider',
    'meta-externalagent',
  ];

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/p/', '/receptionist'] },
      ...agents.map((userAgent) => ({
        userAgent,
        allow: ['/', '/llms.txt', '/.well-known/webmcp'],
        disallow: ['/p/', '/receptionist'],
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
