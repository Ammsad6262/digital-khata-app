import type { MetadataRoute } from "next";

/**
 * sitemap.xml
 *
 * Only pages that should appear in search results. The authenticated app is
 * deliberately absent: it has no public content and robots.txt blocks it.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://dukhata.com";
  const lastModified = new Date();

  return [
    {
      url: `${base}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/refund-policy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/delete-account`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];
}
