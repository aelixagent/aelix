import type { MetadataRoute } from "next";
import { SITE_URL } from "@/app/docs/_content/site";

/** Served at /robots.txt via the App Router metadata convention. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
