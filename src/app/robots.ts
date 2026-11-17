import type { MetadataRoute } from "next";

/**
 * robots.txt
 *
 * The previous static file shipped `Disallow: /`, which told every search
 * engine to ignore the entire site. This replaces it with a policy that lets
 * crawlers index the public pages and keeps them out of the authenticated app.
 *
 * Public and indexable: /, /about, /contact, /privacy, /terms, /refund-policy,
 * /delete-account
 * Crawlable but noindex: /login, /register, /reset-password (see their layouts)
 * Blocked: the app itself and the API — no search value, and crawling them
 * wastes crawl budget.
 */
export default function robots(): MetadataRoute.Robots {
  const base = "https://dukhata.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/about",
          "/contact",
          "/privacy",
          "/terms",
          "/refund-policy",
          "/delete-account",
        ],
        disallow: [
          "/api/",
          "/admin",
          "/preview",
          "/dashboard",
          "/khata",
          "/sales",
          "/stock",
          "/expenses",
          "/payments",
          "/more",
          "/verify-email",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
