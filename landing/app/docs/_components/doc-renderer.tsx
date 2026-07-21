import { Fragment } from "react";
import type { Block } from "../_content/types";
import { md } from "./inline-md";
import { CodeBlock } from "./code-block";
import { Hash } from "./icons";

/** Deterministic heading id from its text (also used by the "On this page" rail). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Pull the h2 headings out of a block list for the right-rail table of contents. */
export function headingsOf(blocks: Block[]): { id: string; text: string }[] {
  return blocks
    .filter((b): b is Extract<Block, { type: "heading" }> => b.type === "heading" && (b.level ?? 2) === 2)
    .map((b) => ({ id: b.id || slugify(b.text), text: b.text }));
}

const CALLOUT_LABEL: Record<string, string> = {
  info: "NOTE",
  warn: "WARNING",
  danger: "CRITICAL",
  success: "GOOD",
  neutral: "TIP",
};

function paragraphs(text: string, kp: string) {
  return text.split(/\n\n+/).map((p, i) => <p key={`${kp}-${i}`}>{md(p, `${kp}-${i}`)}</p>);
}

export function DocBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        const k = `b-${i}`;
        switch (b.type) {
          case "prose":
            return (
              <p className="doc-p" key={k}>
                {md(b.md, k)}
              </p>
            );

          case "heading": {
            const level = b.level ?? 2;
            const id = b.id || slugify(b.text);
            const Tag = level === 2 ? "h2" : "h3";
            return (
              <Tag className={level === 2 ? "doc-h2" : "doc-h3"} id={id} key={k}>
                <a className="doc-anchor" href={`#${id}`} aria-label="Link to section">
                  <Hash />
                </a>
                {b.text}
              </Tag>
            );
          }

          case "note":
            return (
              <p className="doc-note" key={k}>
                {md(b.md, k)}
              </p>
            );

          case "callout": {
            const tone = b.tone || "info";
            return (
              <aside className={`doc-callout tone-${tone}`} key={k}>
                <span className="doc-callout-label">{b.title || CALLOUT_LABEL[tone]}</span>
                <div className="doc-callout-body">{paragraphs(b.md, k)}</div>
              </aside>
            );
          }

          case "code":
            return <CodeBlock key={k} code={b.code} lang={b.lang} filename={b.filename} />;

          case "list":
            return b.ordered ? (
              <ol className="doc-ol" key={k}>
                {b.items.map((it, j) => (
                  <li key={j}>{md(it, `${k}-${j}`)}</li>
                ))}
              </ol>
            ) : (
              <ul className="doc-ul" key={k}>
                {b.items.map((it, j) => (
                  <li key={j}>{md(it, `${k}-${j}`)}</li>
                ))}
              </ul>
            );

          case "table":
            return (
              <div className="doc-table-wrap" key={k}>
                <table className="doc-table">
                  <thead>
                    <tr>
                      {b.headers.map((h, j) => (
                        <th key={j}>{md(h, `${k}-h-${j}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td key={c}>{md(cell, `${k}-${r}-${c}`)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {b.caption ? <p className="doc-caption">{md(b.caption, `${k}-cap`)}</p> : null}
              </div>
            );

          case "cards":
            return (
              <div className={`doc-cards cols-${b.columns ?? 2}`} key={k}>
                {b.cards.map((c, j) => (
                  <div className="doc-card" key={j}>
                    <div className="doc-card-top">
                      <h4>{c.title}</h4>
                      {c.badge ? <span className="doc-card-badge">{c.badge}</span> : null}
                    </div>
                    <p>{md(c.md, `${k}-${j}`)}</p>
                    {c.foot ? <div className="doc-card-foot">{md(c.foot, `${k}-f-${j}`)}</div> : null}
                  </div>
                ))}
              </div>
            );

          case "steps":
            return (
              <div className="doc-steps" key={k}>
                {b.steps.map((s, j) => (
                  <div className="doc-step" key={j}>
                    <span className="doc-step-num">{s.label || String(j + 1).padStart(2, "0")}</span>
                    <h4>{s.title}</h4>
                    <p>{md(s.md, `${k}-${j}`)}</p>
                  </div>
                ))}
              </div>
            );

          case "deflist":
            return (
              <dl className="doc-dl" key={k}>
                {b.items.map((it, j) => (
                  <Fragment key={j}>
                    <dt>{md(it.term, `${k}-t-${j}`)}</dt>
                    <dd>{md(it.md, `${k}-d-${j}`)}</dd>
                  </Fragment>
                ))}
              </dl>
            );

          case "pills":
            return (
              <div className="doc-pills" key={k}>
                {b.items.map((p, j) => (
                  <span className="doc-pill" key={j}>
                    {p}
                  </span>
                ))}
              </div>
            );

          case "compare":
            return (
              <div className="doc-compare" key={k}>
                {[b.left, b.right].map((col, j) => (
                  <div className={`doc-compare-col ${col.tone || (j === 0 ? "bad" : "good")}`} key={j}>
                    <div className="doc-compare-head">{col.title}</div>
                    {col.rows.map((r, x) => (
                      <div className="doc-compare-row" key={x}>
                        {md(r, `${k}-${j}-${x}`)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );

          case "diagram":
            return (
              <figure className="doc-diagram" key={k}>
                {b.title ? <figcaption>{b.title}</figcaption> : null}
                <pre>{b.ascii}</pre>
              </figure>
            );

          case "divider":
            return <hr className="doc-divider" key={k} />;

          default:
            return null;
        }
      })}
    </>
  );
}
