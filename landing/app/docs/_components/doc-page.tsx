import Link from "next/link";
import type { DocContent } from "../_content/types";
import { DocBlocks, headingsOf } from "./doc-renderer";
import { OnThisPage } from "./on-this-page";
import { GITHUB_URL, docHref, prevNext } from "../_content/site";
import { Chevron } from "./icons";
import { JsonLd, docJsonLd } from "./structured-data";

/**
 * Renders one documentation page: header, body blocks, an "On this page" rail
 * built from the h2 headings, and prev/next pagination.
 */
export function DocPage({ slug, content }: { slug: string; content: DocContent }) {
  const toc = headingsOf(content.blocks);
  const { prev, next } = prevNext(slug);
  const editHref = `${GITHUB_URL}/edit/main/landing/app/docs/_content/${slug || "overview"}.ts`;

  return (
    <div className="docs-layout">
      <JsonLd data={docJsonLd(slug, content)} />
      <article className="doc-main">
        <header className="doc-header">
          {content.eyebrow ? <span className="doc-eyebrow">{content.eyebrow}</span> : null}
          <h1 className="doc-title">{content.title}</h1>
          <p className="doc-lede">{content.description}</p>
        </header>

        <div className="doc-body">
          <DocBlocks blocks={content.blocks} />
        </div>

        <div className="doc-pager">
          {prev ? (
            <Link className="doc-pager-link prev" href={docHref(prev.slug)}>
              <Chevron dir="left" />
              <span>
                <em>Previous</em>
                {prev.label}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link className="doc-pager-link next" href={docHref(next.slug)}>
              <span>
                <em>Next</em>
                {next.label}
              </span>
              <Chevron dir="right" />
            </Link>
          ) : (
            <span />
          )}
        </div>

        <div className="doc-foot">
          <a href={editHref} target="_blank" rel="noreferrer" className="doc-edit">
            Edit this page on GitHub ↗
          </a>
        </div>
      </article>

      <OnThisPage items={toc} />
    </div>
  );
}
