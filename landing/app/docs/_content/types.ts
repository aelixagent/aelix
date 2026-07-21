/**
 * Aelix docs — content model.
 *
 * Every documentation page is a plain-data `DocContent` object: a title, a lede,
 * and an ordered array of typed `Block`s. A single server renderer
 * (`_components/doc-renderer.tsx`) turns these blocks into the pixel-styled UI,
 * so every page looks like one system no matter who authored the data.
 *
 * Inline text fields ending in `md` accept a tiny inline-markdown subset:
 *   **bold**, `code`, [label](href)   — nothing else is parsed.
 * Use `\n\n` inside a `callout`/`note` `md` field to separate paragraphs.
 */

export type Tone = "info" | "warn" | "danger" | "success" | "neutral";

export type Block =
  // A single paragraph of body copy (inline-md).
  | { type: "prose"; md: string }
  // Section / sub-section heading. h2 feeds the "On this page" rail.
  | { type: "heading"; level?: 2 | 3; text: string; id?: string }
  // Boxed aside. tone drives the accent colour + default label.
  | { type: "callout"; tone?: Tone; title?: string; md: string }
  // Fenced code / config / terminal block with an optional filename tab.
  | { type: "code"; lang?: string; filename?: string; code: string }
  // Bulleted or numbered list; each item is inline-md.
  | { type: "list"; ordered?: boolean; items: string[] }
  // Data table; header cells + body cells are inline-md.
  | { type: "table"; headers: string[]; rows: string[][]; caption?: string }
  // Grid of bordered cards (the landing "team"/"card" look).
  | { type: "cards"; columns?: 2 | 3; cards: Card[] }
  // Numbered step blocks (the landing "flow" look).
  | { type: "steps"; steps: Step[] }
  // Definition list — term + explanation.
  | { type: "deflist"; items: { term: string; md: string }[] }
  // Row of pixel pills / tags.
  | { type: "pills"; items: string[] }
  // Two-column good/bad comparison (the landing "compare" look).
  | { type: "compare"; left: CompareCol; right: CompareCol }
  // Pre-formatted monospace diagram (ASCII flow charts).
  | { type: "diagram"; title?: string; ascii: string }
  // A small muted footnote-style line.
  | { type: "note"; md: string }
  // Horizontal pixel divider.
  | { type: "divider" };

export interface Card {
  title: string;
  badge?: string;
  md: string;
  foot?: string;
}

export interface Step {
  label?: string;
  title: string;
  md: string;
}

export interface CompareCol {
  title: string;
  tone?: "good" | "bad";
  rows: string[];
}

export interface DocContent {
  /** Page H1 + <title>. */
  title: string;
  /** One-line lede under the H1, also used as <meta description>. */
  description: string;
  /** Pixel eyebrow above the H1, e.g. "01 — GETTING STARTED". */
  eyebrow?: string;
  blocks: Block[];
}
