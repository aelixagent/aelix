import type { MetadataRoute } from "next";
import { SITE_URL } from "@/app/docs/_content/site";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
