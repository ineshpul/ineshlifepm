"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Area } from "@/lib/types";
import { createTaskFromToday, quickAddToTriage } from "@/app/today/actions";
import { btnAccent, btnGhost, btnSecondary, fieldInput, fieldSelect } from "./nesh-ui";

export function QuickAddDialog({
  open,
  onClose,
  areas,
  defaultAreaId,
}: {
  open: boolean;
  onClose: () => void;
  areas: Area[];
  defaultAreaId?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [areaId, setAreaId] = useState(defaultAreaId ?? areas[0]?.id ?? "");
  const [size, setSize] = useState<"S" | "M" | "L">("M");
  const [misc, setMisc] = useState(false);
  const [toToday, setToToday] = useState(false);
  const [toInbox, setToInbox] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setMessage(null);
    setAreaId(defaultAreaId ?? areas[0]?.id ?? "");
    setMisc(false);
    setToToday(false);
    setToInbox(true);
  }, [open, defaultAreaId, areas]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    setMessage(null);
    startTransition(async () => {
      if (toInbox && !toToday) {
        await quickAddToTriage(t, areaId);
        setMessage("Added to inbox.");
      } else {
        const res = await createTaskFromToday({
          title: t,
          areaId,
          size,
          miscellaneous: misc,
          addToTodayPlan: toToday,
        });
        setMessage(res.message);
        if (!res.ok) return;
      }
      setTitle("");
      router.refresh();
      if (toToday) onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onClick={onClose}>
      <div
        className="card w-full max-w-md p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="quick-add-title"
      >
        <h2 id="quick-add-title" className="font-display text-lg font-bold">
          Quick add
        </h2>
        <p className="mt-1 text-[13px] text-[#6b6f7d]">Capture work to your inbox or today&apos;s plan.</p>

        <input
          className={`${fieldInput} mt-4`}
          placeholder="What needs doing?"
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />

        <div className="mt-3 flex gap-2">
          <select
            className={`${fieldSelect} flex-1`}
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select className={fieldSelect} value={size} onChange={(e) => setSize(e.target.value as "S" | "M" | "L")}>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
          </select>
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px]">
          <input type="checkbox" checked={toInbox} onChange={(e) => setToInbox(e.target.checked)} />
          Send to inbox (triage)
        </label>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={toToday}
            onChange={(e) => {
              setToToday(e.target.checked);
              if (e.target.checked) setToInbox(false);
            }}
          />
          Add to today&apos;s plan instead
        </label>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-[13px]">
          <input type="checkbox" checked={misc} onChange={(e) => setMisc(e.target.checked)} />
          Miscellaneous <span className="text-[#9a9aa8]">(prefix only — still uses area above)</span>
        </label>

        {message ? <p className="mt-3 text-[13px] text-[#2fae5b]">{message}</p> : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className={btnAccent} disabled={isPending || !title.trim()} onClick={submit}>
            {isPending ? "Saving…" : "Add"}
          </button>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`${btnGhost} ml-auto`} onClick={() => { onClose(); router.push("/triage"); }}>
            Open Tasks →
          </button>
        </div>
      </div>
    </div>
  );
}
