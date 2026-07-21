"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { DOCS_NAV, docHref } from "../_content/site";
import { cn } from "@/lib/cn";

/** The grouped documentation link list — shared by the desktop rail and mobile drawer. */
export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="docs-nav" aria-label="Documentation">
      {DOCS_NAV.map((group) => (
        <div className="docs-nav-group" key={group.group}>
          <div className="docs-nav-title">{group.group}</div>
          <ul>
            {group.items.map((item) => {
              const href = docHref(item.slug);
              const active = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={cn("docs-nav-link", active && "active")}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function DocsSidebar() {
  return (
    <aside className="docs-sidebar" aria-label="Sidebar">
      <NavList />
    </aside>
  );
}
