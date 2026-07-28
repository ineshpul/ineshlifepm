"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { fieldInput } from "./nesh-ui";

const NAV = [
  { href: "/today", label: "Today", hint: "Daily plan" },
  { href: "/weekly", label: "Weekly", hint: "Week grid and school schedule" },
  { href: "/triage", label: "Tasks", hint: "Inbox and lists" },
  { href: "/goals", label: "Goals", hint: "Quarterly goals" },
  { href: "/calendar", label: "Weekly (calendar)", hint: "Same as Weekly tab" },
  { href: "/vision", label: "Vision board", hint: "Long-term dreams" },
  { href: "/knowledge", label: "Documents", hint: "Notes and links" },
  { href: "/initiatives", label: "Initiatives", hint: "Strategies" },
  { href: "/metrics", label: "Metrics", hint: "Numbers and north stars" },
  { href: "/learning", label: "Learning", hint: "Study backlog" },
  { href: "/delegated", label: "Delegated", hint: "Waiting on others" },
  { href: "/reviews/weekly", label: "Weekly review", hint: "Report" },
  { href: "/settings", label: "Settings", hint: "Capacity and areas" },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (!open) {
      setQ("");
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return NAV;
    return NAV.filter(
      (n) => n.label.toLowerCase().includes(needle) || n.hint.toLowerCase().includes(needle) || n.href.includes(needle)
    );
  }, [q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]" onClick={onClose}>
      <div className="card w-full max-w-lg overflow-hidden shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-[#f4f4f8] p-3">
          <input
            className={fieldInput}
            placeholder="Jump to a page…"
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && items[0]) {
                router.push(items[0].href);
                onClose();
              }
            }}
          />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {items.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-[#9a9aa8]">No matches.</li>
          ) : (
            items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-[#f8f8fb]"
                  onClick={onClose}
                >
                  <span className="font-semibold text-[#17181f]">{item.label}</span>
                  <span className="text-xs text-[#9a9aa8]">{item.hint}</span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
