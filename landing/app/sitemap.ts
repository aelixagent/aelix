import type { MetadataRoute } from "next";
import { DOCS_ORDER, docHref, SITE_URL } from "@/app/docs/_content/site";

/**
 * Served at /sitemap.xml via the App Router metadata convention.
 * Docs URLs derive from DOCS_NAV/DOCS_ORDER, so adding a page to the docs nav
 * automatically adds it here. /experience is a redirect to / and is excluded
 * on purpose — sitemaps must only list canonical, 200-status URLs.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/desk`, lastModified, changeFrequency: "weekly", priority: 0.8 },
  ];

  const docsRoutes: MetadataRoute.Sitemap = DOCS_ORDER.map(({ slug }) => ({
    url: `${SITE_URL}${docHref(slug)}`,
    lastModified,
    changeFrequency: "weekly",
    priority: slug === "" ? 0.9 : 0.7,
  }));

  return [...staticRoutes, ...docsRoutes];
}
