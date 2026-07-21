"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** Right-rail table of contents with scroll-spy over the page's h2 ids. */
export function OnThisPage({ items }: { items: { id: string; text: string }[] }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    if (!items.length) return;
    const els = items.map((it) => document.getElementById(it.id)).filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-88px 0px -66% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  if (items.length < 2) return <aside className="docs-toc" aria-hidden="true" />;

  return (
    <aside className="docs-toc" aria-label="On this page">
      <div className="docs-toc-title">On this page</div>
      <ul>
        {items.map((it) => (
          <li key={it.id}>
            <a href={`#${it.id}`} className={cn("docs-toc-link", active === it.id && "active")}>
              {it.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
