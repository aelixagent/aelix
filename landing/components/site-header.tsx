"use client";

import { useEffect, useRef, useState } from "react";
import { AelixLogo } from "@/components/ui/aelix-logo";
import { ScrambleHover } from "@/components/ui/scramble-hover";
import { NAV } from "@/lib/data";
import { GITHUB_URL, VAULT_URL } from "@/lib/links";
import { cn } from "@/lib/cn";

function GitHubGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="currentColor" style={{ display: "inline-block", verticalAlign: "-2px" }}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function SiteHeader() {
  const [active, setActive] = useState<string>(NAV[0].href.slice(1));
  const [drawer, setDrawer] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const progRef = useRef<HTMLDivElement>(null);

  // scroll progress bar + back-to-top visibility
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
        setShowTop(h.scrollTop > 600);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // scrollspy — highlight the nav item for the section in the viewport band
  useEffect(() => {
    const secs = NAV.map((n) => document.getElementById(n.href.slice(1))).filter(
      (el): el is HTMLElement => !!el,
    );
    if (!secs.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
    );
    secs.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  // lock body scroll while the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);

  return (
    <>
      <div className="scroll-prog" ref={progRef} />
      <header className="hdr">
        <div className="nav">
          <a href="#top" className="brand">
            <AelixLogo />
            AELIX
          </a>
          <nav className="nav-links">
            {NAV.map((item, i) => (
              <a
                key={item.href}
                href={item.href}
                className={cn(item.href.slice(1) === active && "active", i === NAV.length - 1 && "cta")}
              >
                <span className="n">{item.n}</span> <ScrambleHover text={item.label} />
              </a>
            ))}
            <a href="/docs">
              <span className="n">05</span> <ScrambleHover text="Docs" />
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="Aelix on GitHub">
              <GitHubGlyph /> <ScrambleHover text="GitHub" />
            </a>
            <a href={VAULT_URL} className="active" aria-label="Launch the app">
              <span className="n">↗</span> <ScrambleHover text="Launch App" />
            </a>
          </nav>
          <button className="burger" aria-label="Open menu" aria-expanded={drawer} onClick={() => setDrawer(true)}>
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <div className={cn("drawer", drawer && "open")} role="dialog" aria-modal={drawer} aria-label="Menu">
        <button className="drawer-close" aria-label="Close menu" onClick={() => setDrawer(false)}>
          ✕
        </button>
        {NAV.map((item) => (
          <a key={item.href} href={item.href} onClick={() => setDrawer(false)}>
            <span className="n">{item.n}</span> <ScrambleHover text={item.label} />
          </a>
        ))}
        <a href="/docs" onClick={() => setDrawer(false)}>
          <span className="n">05</span> <ScrambleHover text="Docs" />
        </a>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" onClick={() => setDrawer(false)}>
          <span className="n">
            <GitHubGlyph />
          </span>{" "}
          <ScrambleHover text="GitHub" />
        </a>
        <a href={VAULT_URL} onClick={() => setDrawer(false)}>
          <span className="n">↗</span> <ScrambleHover text="Launch App" />
        </a>
      </div>

      <button
        className={cn("totop", showTop && "show")}
        aria-label="Back to top"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        ▲
      </button>
    </>
  );
}
