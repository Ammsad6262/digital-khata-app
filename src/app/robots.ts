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

  const publicPages = [
    "/",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    "/refund-policy",
    "/delete-account",
    "/llms.txt",
  ];
  const privatePaths = [
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
  ];

  /**
   * Answer engines need explicit permission, not just a wildcard. Several of
   * them treat the absence of their own group as "not invited", and some site
   * owners add blanket blocks later that would silently drop us from AI search.
   * Listing them here makes the intent unmistakable and survives copy-pasted
   * rules. Google-Extended and Applebot-Extended control AI grounding/training,
   * not classic indexing, so allowing them is what "visible in AI search" means.
   */
  const aiCrawlers = [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "Claude-SearchBot",
    "Claude-User",
    "PerplexityBot",
    "Perplexity-User",
    "Google-Extended",
    "GoogleOther",
    "Applebot-Extended",
    "Amazonbot",
    "Bingbot",
    "CCBot",
    "meta-externalagent",
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: publicPages,
        disallow: privatePaths,
      },
      ...aiCrawlers.map((userAgent) => ({
        userAgent,
        allow: publicPages,
        disallow: privatePaths,
      })),
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
