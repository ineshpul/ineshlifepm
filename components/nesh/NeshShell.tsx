"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, useTransition } from "react";
import type { Area } from "@/lib/types";
import { areaHex } from "@/lib/area-styles";
import { AREA_HINTS } from "@/lib/constants";
import { VIEW_HEADINGS, viewForPath } from "@/lib/nesh-pages";
import { upsertArea } from "@/app/settings/actions";
import { AreaFocusProvider, useAreaFocus } from "./AreaFocusProvider";
import { CommandPalette } from "./CommandPalette";
import { QuickAddDialog } from "./QuickAddDialog";
import { btnPrimary, btnSecondary, fieldInput } from "./nesh-ui";

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
  const router = useRouter();
  const { focusAreaId, setFocusAreaId, isAllAreas } = useAreaFocus();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [isPending, startTransition] = useTransition();
  const sorted = [...areas].sort((a, b) => a.sortOrder - b.sortOrder);

  const chip = (active: boolean) =>
    [
      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
      active
        ? "border-[#17181f] bg-[#17181f] text-white"
        : "border-[#e6e6ee] bg-white text-[#6b6f7d] hover:border-[#cdbce6]",
    ].join(" ");

  const saveArea = () => {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      await upsertArea({
        name,
        colorToken: "violet",
        sortOrder: areas.length,
        isCadenceOnly: false,
      });
      setNewName("");
      setAdding(false);
      router.refresh();
    });
  };

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
            title={AREA_HINTS[a.id]}
          >
            <span className="h-2 w-2 rounded-[3px]" style={{ background: hex }} />
            {a.name}
          </button>
        );
      })}
      {adding ? (
        <span className="inline-flex items-center gap-2">
          <input
            className={`${fieldInput} !w-36 !py-1.5 text-[12.5px]`}
            placeholder="Area name"
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveArea();
              if (e.key === "Escape") setAdding(false);
            }}
          />
          <button type="button" className={btnPrimary + " !px-3 !py-1.5 text-xs"} disabled={isPending} onClick={saveArea}>
            Save
          </button>
          <button type="button" className={btnSecondary + " !px-3 !py-1.5 text-xs"} onClick={() => setAdding(false)}>
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#d6d6e0] px-3 py-1.5 text-[12.5px] font-semibold text-[#9a9aa8] hover:border-[#6d4aff] hover:text-[#6d4aff]"
          onClick={() => setAdding(true)}
        >
          ＋ Add area
        </button>
      )}
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="sticky top-0 z-20 border-b border-[#ececf1] bg-[rgba(244,244,248,0.86)] backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-4 px-8 py-3.5">
          <h1 className="font-display text-[19px] font-bold tracking-tight text-[#17181f]">{title}</h1>
          <p className="text-[13px] font-medium text-[#9a9aa8]">{subheading}</p>
          <div className="ml-auto flex items-center gap-2.5">
            <button
              type="button"
              className="hidden items-center gap-2 rounded-[10px] border border-[#ececf1] bg-white px-3 py-2 text-left text-[13px] text-[#a7a7b3] transition-colors hover:border-[#cdbce6] sm:flex sm:w-[210px]"
              onClick={() => setSearchOpen(true)}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#c9c9d4]" />
              Search anything…
              <span className="ml-auto text-[11px] font-semibold text-[#c9c9d4]">⌘K</span>
            </button>
            <button type="button" className={btnPrimary} onClick={() => setQuickOpen(true)}>
              <span className="mr-1 text-[15px] leading-none">＋</span>
              Quick add
            </button>
          </div>
        </div>
        <SectorStrip areas={areas} />
      </div>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <QuickAddDialog
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        areas={areas}
        defaultAreaId={isAllAreas ? undefined : focusAreaId}
      />
    </>
  );
}

function ShellInner({
  areas,
  triageCount,
  children,
}: {
  areas: Area[];
  triageCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const inboxBadge = triageCount > 0 ? String(triageCount) : undefined;

  const daily: NavItem[] = [
    { href: "/today", label: "Today", dot: "#6d4aff", badge: inboxBadge },
    { href: "/weekly", label: "Weekly", dot: "#12a594" },
    { href: "/reviews/weekly", label: "Weekly review", dot: "#94a3b8" },
    { href: "/reviews/monthly", label: "Monthly review", dot: "#94a3b8" },
  ];
  const workspace: NavItem[] = [
    { href: "/goals", label: "Goals", dot: "#2f6bff" },
    { href: "/triage", label: "Tasks", dot: "#e8952b", badge: inboxBadge },
    { href: "/knowledge", label: "Documents", dot: "#4f57e8" },
    { href: "/initiatives", label: "Sectors", dot: "#8b5cf6" },
    { href: "/metrics", label: "Metrics", dot: "#14b8a6" },
    { href: "/learning", label: "Learning", dot: "#22c55e" },
  ];
  const vision: NavItem[] = [{ href: "/vision", label: "Vision board", dot: "linear-gradient(135deg,#e5449b,#f2683c)" }];
  const team: NavItem[] = [{ href: "/delegated", label: "Delegated", dot: "linear-gradient(135deg,#2f6bff,#12a594)" }];
  const more: NavItem[] = [{ href: "/settings", label: "Settings", dot: "#94a3b8" }];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f4f4f8]">
      <aside className="flex w-[252px] shrink-0 flex-col border-r border-[#ececf1] bg-white px-3.5 py-5">
        <Link href="/today" className="mb-5 flex items-center gap-2.5 px-2 transition-opacity hover:opacity-90">
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
        </Link>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavSection title="DAILY" items={daily} pathname={pathname} />
          <NavSection title="WORKSPACE" items={workspace} pathname={pathname} />
          <NavSection title="YOUR VISION" items={vision} pathname={pathname} />
          <NavSection title="TEAM" items={team} pathname={pathname} />
          <NavSection title="MORE" items={more} pathname={pathname} />
        </div>

        <Link
          href="/settings"
          className="mt-auto flex items-center gap-2.5 border-t border-[#f0f0f4] px-2.5 pt-3.5 transition-colors hover:bg-[#f8f8fb] rounded-lg"
        >
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
        </Link>
      </aside>

      <main className="relative min-w-0 flex-1 overflow-y-auto">
        <ShellHeader areas={areas} />
        {children}
      </main>
    </div>
  );
}

export function NeshShell({
  areas,
  triageCount,
  children,
}: {
  areas: Area[];
  triageCount: number;
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f4f8]" />}>
      <AreaFocusProvider>
        <ShellInner areas={areas} triageCount={triageCount}>
          {children}
        </ShellInner>
      </AreaFocusProvider>
    </Suspense>
  );
}
