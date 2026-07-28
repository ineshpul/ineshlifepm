"use client";

import { useState, useTransition } from "react";
import { AREA_COLOR_HEX } from "@/lib/constants";
import type { Area, Goal, VisionItem } from "@/lib/types";
import { promoteVisionItemToGoal, upsertVisionItem } from "./actions";

export function VisionClient({
  areas, visionItems, goals,
}: {
  areas: Area[];
  visionItems: VisionItem[];
  goals: Goal[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [isPending, startTransition] = useTransition();

  const areaById = new Map(areas.map((a) => [a.id, a]));
  const itemsByArea = new Map<string, VisionItem[]>();
  for (const v of visionItems) {
    if (!itemsByArea.has(v.areaId)) itemsByArea.set(v.areaId, []);
    itemsByArea.get(v.areaId)!.push(v);
  }
  const open = visionItems.find((v) => v.id === openId) ?? null;
  const linkedGoals = open ? goals.filter((g) => open.linkedGoalIds.includes(g.id)) : [];

  return (
    <div
      style={{
        background:
          "radial-gradient(1200px 500px at 70% -80px,#efe7ff 0%,rgba(239,231,255,0) 60%), radial-gradient(1000px 500px at 10% 0px,#ffe7f3 0%,rgba(255,231,243,0) 55%)",
      }}
    >
      <div className="nesh-page !max-w-[1220px]">
        <div className="mb-8">
          <div className="font-display text-[34px] font-extrabold tracking-tight bg-gradient-to-r from-[#6d4aff] via-[#e5449b] to-[#f2683c] bg-clip-text text-transparent">
            The life you&apos;re actually building.
          </div>
          <p className="mt-2 max-w-[660px] text-[14.5px] leading-relaxed text-[#6b6f7d]">
            Dreams don&apos;t compete with your to-do list. They live here, and never nag you on Today. Move one into
            Active when you&apos;re ready to make it real.
          </p>
          <button
            className="mt-4 rounded-full border border-[#ececf1] bg-white px-4 py-2 text-sm font-semibold shadow-sm"
            onClick={() => setCreating(true)}
          >
            + New vision
          </button>
        </div>

        <div className="space-y-10 pb-12">
        {areas.map((area) => {
          const items = itemsByArea.get(area.id) ?? [];
          if (!items.length) return null;
          const hex = AREA_COLOR_HEX[area.colorToken] ?? "#71717a";
          return (
            <section key={area.id}>
              <h2 className="mb-3 text-sm font-semibold" style={{ color: hex }}>{area.name}</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setOpenId(v.id)}
                    className="group overflow-hidden rounded-2xl border text-left shadow-sm transition hover:shadow-md"
                    style={{
                      borderColor: hex + "30",
                      opacity: v.status === "dormant" ? 0.55 : 1,
                    }}
                  >
                    <div
                      className="h-32 w-full bg-cover bg-center"
                      style={{
                        backgroundImage: v.imageUrl
                          ? `url(${v.imageUrl})`
                          : `linear-gradient(135deg, ${hex}, ${hex}88)`,
                      }}
                    />
                    <div className="p-4">
                      <div className="font-medium">{v.title}</div>
                      <p className="mt-1 line-clamp-2 text-sm muted">{v.body}</p>
                      {v.status === "active" && (
                        <span className="mt-2 inline-block rounded-full px-2 py-0.5 text-[10px]" style={{ background: hex + "22", color: hex }}>
                          active
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {creating && (
        <NewVisionModal areas={areas} onClose={() => setCreating(false)} />
      )}

      {open && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpenId(null)}>
          <div className="card max-h-[80vh] w-full max-w-lg overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">{open.title}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm muted">{open.body}</p>
            <div className="mt-4">
              <div className="mb-1 text-xs muted">Linked active goals</div>
              {linkedGoals.length === 0 ? (
                <PromoteForm visionId={open.id} pending={isPending} startTransition={startTransition} />
              ) : (
                <ul className="space-y-1 text-sm">
                  {linkedGoals.map((g) => <li key={g.id}>{g.title}</li>)}
                </ul>
              )}
            </div>
            <button className="mt-4 text-xs muted hover:underline" onClick={() => setOpenId(null)}>Close</button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function PromoteForm({
  visionId, pending, startTransition,
}: {
  visionId: string;
  pending: boolean;
  startTransition: (fn: () => void) => void;
}) {
  const [title, setTitle] = useState("");
  return (
    <div className="space-y-2">
      <p className="text-sm muted">No active goal yet. Promote this to Active with a first goal.</p>
      <input
        className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
        placeholder="Goal title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button
        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-[var(--bg)]"
        disabled={pending || !title.trim()}
        onClick={() => startTransition(() => { promoteVisionItemToGoal(visionId, title.trim()); })}
      >
        Promote to Active
      </button>
    </div>
  );
}

function NewVisionModal({ areas, onClose }: { areas: Area[]; onClose: () => void }) {
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg space-y-3 p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">New vision item</h3>
        <select
          className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
          value={areaId}
          onChange={(e) => setAreaId(e.target.value)}
        >
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input
          className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
          placeholder="Statement"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <input
          className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
          placeholder="Image URL (optional)"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-[var(--bg)]"
            disabled={isPending || !title.trim()}
            onClick={() =>
              startTransition(async () => {
                await upsertVisionItem({ areaId, title: title.trim(), body, imageUrl: imageUrl || null });
                onClose();
              })
            }
          >
            Save
          </button>
          <button className="text-xs muted" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
