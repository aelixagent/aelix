"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AelixLogo } from "@/components/ui/aelix-logo";
import { GITHUB_URL } from "../_content/site";
import { GitHubMark } from "./icons";
import { NavList } from "./docs-sidebar";
import { cn } from "@/lib/cn";

/** Sticky docs top bar: brand, back-to-site, GitHub, and the mobile nav drawer. */
export function DocsTopbar() {
  const [open, setOpen] = useState(false);
  const progRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Reading-progress bar under the topbar.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const h = document.documentElement;
        const max = h.scrollHeight - h.clientHeight;
        const p = max > 0 ? (h.scrollTop / max) * 100 : 0;
        if (progRef.current) progRef.current.style.width = p + "%";
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div className="docs-scroll-prog" ref={progRef} />
      <header className="docs-topbar">
        <div className="docs-topbar-inner">
          <Link href="/docs" className="docs-brand">
            <AelixLogo size={30} />
            <span>
              AELIX<span className="docs-brand-sub">/ DOCS</span>
            </span>
          </Link>

          <div className="docs-topbar-actions">
            <Link href="/" className="docs-top-link">
              ← Site
            </Link>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="docs-top-link gh">
              <GitHubMark />
              GitHub
            </a>
            <button
              type="button"
              className="docs-burger"
              aria-label="Open navigation"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <div className={cn("docs-drawer", open && "open")} role="dialog" aria-modal={open} aria-label="Navigation">
        <div className="docs-drawer-head">
          <span className="docs-drawer-title">DOCUMENTATION</span>
          <button type="button" className="docs-drawer-close" aria-label="Close navigation" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="docs-drawer-gh">
          <GitHubMark /> github.com/aelixagent/aelix
        </a>
        <NavList onNavigate={() => setOpen(false)} />
      </div>
    </>
  );
}
