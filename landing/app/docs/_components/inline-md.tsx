import { Fragment, type ReactNode } from "react";

/**
 * Tiny inline-markdown renderer → React nodes (no dangerouslySetInnerHTML).
 * Supports exactly: **bold**, `code`, and [label](href). Everything else is
 * emitted as plain text. Links starting with http/https open in a new tab.
 *
 * Kept deliberately small — docs body copy only needs emphasis, inline code,
 * and links. Block-level structure comes from the Block union, not from md.
 */

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

export function md(input: string, keyPrefix = "m"): ReactNode[] {
  if (!input) return [];
  const out: ReactNode[] = [];
  const parts = input.split(TOKEN);
  parts.forEach((part, i) => {
    if (!part) return;
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      out.push(<strong key={key}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith("`") && part.endsWith("`")) {
      out.push(
        <code className="doc-ic" key={key}>
          {part.slice(1, -1)}
        </code>,
      );
    } else if (part.startsWith("[")) {
      const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (m) {
        const [, label, href] = m;
        const ext = /^https?:\/\//.test(href);
        out.push(
          <a
            className="doc-link"
            key={key}
            href={href}
            {...(ext ? { target: "_blank", rel: "noreferrer" } : {})}
          >
            {label}
          </a>,
        );
      } else {
        out.push(<Fragment key={key}>{part}</Fragment>);
      }
    } else {
      out.push(<Fragment key={key}>{part}</Fragment>);
    }
  });
  return out;
}
