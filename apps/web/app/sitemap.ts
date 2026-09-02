import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/webmcp/catalog';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/dashboard`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/receptionist`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
  ];
}
