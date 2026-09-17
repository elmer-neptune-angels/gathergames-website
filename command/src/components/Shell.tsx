"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const NAV: { href: string; label: string; icon: string }[] = [
  { href: "/", label: "Overview", icon: "◎" },
  { href: "/play", label: "Play", icon: "▶" },
  { href: "/players", label: "Players", icon: "◉" },
  { href: "/leaderboards", label: "Leaderboards", icon: "▤" },
  { href: "/revenue", label: "Revenue", icon: "$" },
  { href: "/marketing", label: "Marketing", icon: "◭" },
  { href: "/system", label: "System", icon: "♥" },
  { href: "/controls", label: "Controls", icon: "⚙" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (pathname === "/login") return <main className="login-main">{children}</main>;
  return (
    <div className="shell">
      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">G</span>
          <span>
            Gather <b>Command</b>
          </span>
          <button className="menu" aria-label="Toggle navigation" onClick={() => setOpen((value) => !value)}>
            ☰
          </button>
        </div>
        <nav>
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""} onClick={() => setOpen(false)}>
                <i aria-hidden="true">{item.icon}</i> {item.label}
              </Link>
            );
          })}
        </nav>
        <form action="/api/logout" method="post" className="signout">
          <button type="submit">Sign out</button>
        </form>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

/** Re-renders the server page on an interval so a live view stays live
 * without a websocket. Pauses while the tab is hidden. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
        setTick((value) => value + 1);
      }
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return (
    <span className="muted refresh" title={`refreshed ${tick} times this visit`}>
      live · every {seconds}s
    </span>
  );
}
