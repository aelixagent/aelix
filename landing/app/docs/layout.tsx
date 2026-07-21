import type { Metadata } from "next";
import Link from "next/link";
import { DocsTopbar } from "./_components/docs-topbar";
import { DocsSidebar } from "./_components/docs-sidebar";
import { GITHUB_URL } from "./_content/site";
import "./docs.css";

export const metadata: Metadata = {
  title: { default: "Docs", template: "%s // AELIX Docs" },
  description:
    "Documentation for Aelix — an agentic AI equity research desk that runs inside Claude Code, connects to a Robinhood Agentic account over MCP, and never places an order without your approval.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-root">
      <DocsTopbar />
      <div className="docs-shell wrap-docs">
        <DocsSidebar />
        {children}
      </div>
      <footer className="docs-footer">
        <div className="wrap-docs docs-footer-inner">
          <span>© 2026 AELIX // REFERENCE ARCHITECTURE · NOT INVESTMENT ADVICE</span>
          <span className="docs-footer-links">
            <Link href="/">Home</Link>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link href="/docs/disclaimer">Disclaimer</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
