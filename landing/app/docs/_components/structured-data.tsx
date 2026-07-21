import type { DocContent } from "../_content/types";
import { SITE_URL, docHref } from "../_content/site";

/** Renders a JSON-LD block. `<` is escaped so content can never close the tag. */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

/** Flatten the inline-md subset (**bold**, `code`, [label](href)) to plain text. */
function stripInlineMd(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

/** Home → Docs → page trail + article metadata for one docs page. */
export function docJsonLd(slug: string, content: DocContent): object {
  const url = `${SITE_URL}${docHref(slug)}`;
  const trail = [
    { name: "Home", item: `${SITE_URL}/` },
    { name: "Docs", item: `${SITE_URL}/docs` },
    ...(slug ? [{ name: content.title, item: url }] : []),
  ];
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: trail.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.item })),
    },
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: content.title,
      description: content.description,
      url,
      isPartOf: { "@type": "WebSite", name: "AELIX", url: SITE_URL },
    },
  ];
}

/**
 * FAQPage schema extracted from the content blocks: each h2 heading is a
 * question, the prose blocks until the next heading are its answer.
 */
export function faqJsonLd(content: DocContent): object {
  const qa: { q: string; a: string[] }[] = [];
  for (const block of content.blocks) {
    if (block.type === "heading" && (block.level ?? 2) === 2) {
      qa.push({ q: block.text, a: [] });
    } else if (block.type === "prose" && qa.length > 0) {
      qa[qa.length - 1].a.push(stripInlineMd(block.md));
    }
  }
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa
      .filter((p) => p.a.length > 0)
      .map((p) => ({
        "@type": "Question",
        name: p.q,
        acceptedAnswer: { "@type": "Answer", text: p.a.join(" ") },
      })),
  };
}
