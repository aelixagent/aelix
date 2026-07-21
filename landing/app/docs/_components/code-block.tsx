"use client";

import { useState } from "react";
import { CopyGlyph } from "./icons";

/** Terminal-style code block with a filename tab + copy-to-clipboard button. */
export function CodeBlock({
  code,
  lang,
  filename,
}: {
  code: string;
  lang?: string;
  filename?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <div className="doc-code">
      <div className="doc-code-bar">
        <span className="doc-code-dot" />
        <span className="doc-code-name">{filename || lang || "shell"}</span>
        <button type="button" className="doc-code-copy" onClick={copy} aria-label="Copy code">
          <CopyGlyph />
          {copied ? "COPIED" : "COPY"}
        </button>
      </div>
      <pre className="doc-code-body">
        <code>{code}</code>
      </pre>
    </div>
  );
}
