"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import type { Area } from "@/lib/types";
import { areaHex } from "@/lib/area-styles";
import { VIEW_HEADINGS, viewForPath } from "@/lib/nesh-pages";
import { AreaFocusProvider, useAreaFocus } from "./AreaFocusProvider";

type NavItem = {
  href: string;
  label: string;
  dot: string;
  badge?: string;
};

function navBtn(active: boolean) {
  return [
    "flex w-full items-center gap-2.5 rounded-[10px] border-0 px-2.5 py-2 text-left text-sm font-medium transition-colors",
    active
      ? "bg-[#f4f4f8] font-semibold text-[#17181f]"
      : "text-[#6b6f7d] hover:bg-[#f8f8fb]",
  ].join(" ");
}

function NavSection({ title, items, pathname }: { title: string; items: NavItem[]; pathname: string }) {
  return (
    <div className="mb-1">
      <div className="px-2.5 pb-2 pt-4 text-[10px] font-bold tracking-[0.09em] text-[#b3b3c0]">{title}</div>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link key={item.href} href={item.href} className={navBtn(active)}>
            <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: item.dot }} />
            <span className="flex-1">{item.label}</span>
            {item.badge ? (
              <span className="rounded-md bg-[#eceaf5] px-1.5 py-0.5 text-[11px] font-bold text-[#6d4aff]">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

function SectorStrip({ areas }: { areas: Area[] }) {
  const { focusAreaId, setFocusAreaId, isAllAreas } = useAreaFocus();
  const sorted = [...areas].sort((a, b) => a.sortOrder - b.sortOrder);

  const chip = (active: boolean) =>
    [
      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
      active
        ? "border-[#17181f] bg-[#17181f] text-white"
        : "border-[#e6e6ee] bg-white text-[#6b6f7d] hover:border-[#cdbce6]",
    ].join(" ");

  return (
    <div className="flex flex-wrap items-center gap-2 px-8 pb-3">
      <span className="mr-0.5 text-[11px] font-bold tracking-[0.06em] text-[#b3b3c0]">FOCUS ON</span>
      <button type="button" className={chip(isAllAreas)} onClick={() => setFocusAreaId("all")}>
        <span
          className="h-2 w-2 rounded-[3px]"
          style={{ background: "linear-gradient(135deg,#6d4aff,#f2683c)" }}
        />
        All areas
      </button>
      {sorted.map((a) => {
        const active = focusAreaId === a.id;
        const hex = areaHex(a.colorToken);
        return (
          <button
            key={a.id}
            type="button"
            className={chip(active)}
            style={
              active
                ? {
                    background: `${hex}16`,
                    borderColor: hex,
                    color: hex,
                  }
                : undefined
            }
            onClick={() => setFocusAreaId(a.id)}
          >
            <span className="h-2 w-2 rounded-[3px]" style={{ background: hex }} />
            {a.name}
          </button>
        );
      })}
    </div>
  );
}

function ShellHeader({ areas }: { areas: Area[] }) {
  const pathname = usePathname();
  const view = viewForPath(pathname);
  const [title, defaultSub] = VIEW_HEADINGS[view];
  const { focusAreaId, isAllAreas } = useAreaFocus();
  const area = areas.find((a) => a.id === focusAreaId);
  const subheading = isAllAreas ? defaultSub : `Focused on ${area?.name ?? "area"}`;

  return (
    <div className="sticky top-0 z-20 border-b border-[#ececf1] bg-[rgba(244,244,248,0.86)] backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-4 px-8 py-3.5">
        <h1 className="font-display text-[19px] font-bold tracking-tight text-[#17181f]">{title}</h1>
        <p className="text-[13px] font-medium text-[#9a9aa8]">{subheading}</p>
        <div className="ml-auto flex items-center gap-2.5">
          <div className="hidden items-center gap-2 rounded-[10px] border border-[#ececf1] bg-white px-3 py-2 text-[13px] text-[#a7a7b3] sm:flex sm:w-[210px]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c9c9d4]" />
            Search anything…
            <span className="ml-auto text-[11px] font-semibold text-[#c9c9d4]">⌘K</span>
          </div>
          <Link
            href="/triage"
            className="flex items-center gap-1.5 rounded-[10px] bg-[#17181f] px-4 py-2 text-[13px] font-semibold text-white"
          >
            <span className="text-[15px] leading-none">＋</span>
            Quick add
          </Link>
        </div>
      </div>
      <SectorStrip areas={areas} />
    </div>
  );
}

function ShellInner({ areas, children }: { areas: Area[]; children: React.ReactNode }) {
  const pathname = usePathname();

  const daily: NavItem[] = [{ href: "/today", label: "Today", dot: "#6d4aff" }];
  const workspace: NavItem[] = [
    { href: "/goals", label: "Goals", dot: "#2f6bff" },
    { href: "/triage", label: "Tasks", dot: "#e8952b" },
    { href: "/calendar", label: "Calendar", dot: "#12a594" },
    { href: "/knowledge", label: "Documents", dot: "#4f57e8" },
    { href: "/initiatives", label: "Initiatives", dot: "#8b5cf6" },
    { href: "/metrics", label: "Metrics", dot: "#14b8a6" },
    { href: "/learning", label: "Learning", dot: "#22c55e" },
  ];
  const vision: NavItem[] = [{ href: "/vision", label: "Vision board", dot: "linear-gradient(135deg,#e5449b,#f2683c)" }];
  const team: NavItem[] = [{ href: "/delegated", label: "Delegated", dot: "linear-gradient(135deg,#2f6bff,#12a594)" }];
  const more: NavItem[] = [
    { href: "/reviews/weekly", label: "Weekly review", dot: "#94a3b8" },
    { href: "/reviews/monthly", label: "Monthly review", dot: "#94a3b8" },
    { href: "/settings", label: "Settings", dot: "#94a3b8" },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f4f4f8]">
      <aside className="flex w-[252px] shrink-0 flex-col border-r border-[#ececf1] bg-white px-3.5 py-5">
        <div className="mb-5 flex items-center gap-2.5 px-2">
          <div
            className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px] shadow-[0_6px_16px_-6px_rgba(109,74,255,0.7)]"
            style={{ background: "linear-gradient(135deg,#6d4aff,#e5449b 90%)" }}
          >
            <div className="h-3 w-3 rounded bg-white" />
          </div>
          <div className="leading-none">
            <div className="font-display text-[21px] font-extrabold tracking-tight">nesh</div>
            <div className="mt-0.5 text-[10.5px] font-medium text-[#9a9aa8]">your life, shipped</div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavSection title="DAILY" items={daily} pathname={pathname} />
          <NavSection title="WORKSPACE" items={workspace} pathname={pathname} />
          <NavSection title="YOUR VISION" items={vision} pathname={pathname} />
          <NavSection title="TEAM" items={team} pathname={pathname} />
          <NavSection title="MORE" items={more} pathname={pathname} />
        </div>

        <div className="mt-auto flex items-center gap-2.5 border-t border-[#f0f0f4] px-2.5 pt-3.5">
          <div
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg,#2f6bff,#12a594)" }}
          >
            IN
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold">Inesh</div>
            <div className="text-[11px] text-[#9a9aa8]">founder · student · athlete</div>
          </div>
        </div>
      </aside>

      <main className="relative min-w-0 flex-1 overflow-y-auto">
        <ShellHeader areas={areas} />
        {children}
      </main>
    </div>
  );
}

export function NeshShell({ areas, children }: { areas: Area[]; children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f4f8]" />}>
      <AreaFocusProvider>
        <ShellInner areas={areas}>{children}</ShellInner>
      </AreaFocusProvider>
    </Suspense>
  );
}
