"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AreaTag } from "@/components/AreaTag";
import { btnDangerGhost, btnPrimary } from "@/components/nesh/nesh-ui";
import { daysSince, formatDate } from "@/lib/dates";
import type { Area, Assignee, Goal, Initiative } from "@/lib/types";
import { createInitiative, removeInitiative } from "./actions";

export function InitiativesIndexClient({
  areas,
  initiatives,
  assignees,
  goals,
}: {
  areas: Area[];
  initiatives: Initiative[];
  assignees: Assignee[];
  goals: Goal[];
}) {
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const assigneeById = new Map(assignees.map((a) => [a.id, a]));
  const [creating, setCreating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const sortedAreas = [...areas].sort((a, b) => a.sortOrder - b.sortOrder);

  const byArea = new Map<string, Initiative[]>();
  for (const i of initiatives) {
    if (!byArea.has(i.areaId)) byArea.set(i.areaId, []);
    byArea.get(i.areaId)!.push(i);
  }

  function goalProgress(i: Initiative) {
    const gs = goals.filter((g) => i.goalIds.includes(g.id));
    const done = gs.filter((g) => g.status === "done").length;
    return { done, total: gs.length };
  }

  return (
    <div className="nesh-page">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-[#6b6f7d]">
          Sectors are ongoing workstreams inside each area (e.g. IU engagement, Technical tickets, Marketing). Add goals
          and tasks under each sector.
        </p>
        <button type="button" className={btnPrimary} onClick={() => setCreating(!creating)}>
          + New sector
        </button>
      </div>

      {creating && (
        <NewInitiativeForm
          areas={sortedAreas}
          onDone={() => {
            setCreating(false);
            router.refresh();
          }}
          pending={isPending}
          startTransition={startTransition}
        />
      )}

      <div className="space-y-8">
        {sortedAreas.map((area) => {
          const items = byArea.get(area.id) ?? [];
          return (
            <section key={area.id}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <AreaTag name={area.name} colorToken={area.colorToken} />
                <button
                  type="button"
                  className="text-xs font-semibold text-[#6d4aff] hover:underline"
                  onClick={() => setCreating(true)}
                >
                  + Add in {area.name}
                </button>
              </div>
              {items.length === 0 ? (
                <p className="text-sm text-[#9a9aa8]">No initiatives in {area.name} yet.</p>
              ) : (
                <div className="card divide-y hairline">
                  {items.map((i) => {
                    const owner = i.ownerId ? assigneeById.get(i.ownerId) : null;
                    const { done, total } = goalProgress(i);
                    const lastActivity = i.outcomeNotes.length
                      ? i.outcomeNotes[i.outcomeNotes.length - 1]!.date
                      : i.startedAt;
                    return (
                      <div key={i.id} className="flex items-center justify-between gap-4 p-4">
                        <Link
                          href={`/initiatives/${i.id}`}
                          className="min-w-0 flex-1 hover:bg-black/[0.02] dark:hover:bg-white/5"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{i.title}</span>
                              <span className="rounded-full border hairline px-2 py-0.5 text-[10px] muted">
                                {i.status.replace("_", " ")}
                              </span>
                              {owner && <span className="text-xs muted">→ {owner.name}</span>}
                            </div>
                            <div className="mt-1 text-xs muted">
                              {daysSince(lastActivity)} days since last movement · target {formatDate(i.targetDate)}
                            </div>
                          </div>
                        </Link>
                        <div className="flex shrink-0 items-center gap-3">
                          <div className="text-xs muted">
                            {done}/{total} goals
                          </div>
                          <button
                            type="button"
                            className={btnDangerGhost + " text-xs"}
                            disabled={isPending}
                            onClick={() => {
                              if (confirm(`Delete initiative “${i.title}”?`)) {
                                startTransition(async () => {
                                  await removeInitiative(i.id);
                                  router.refresh();
                                });
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
        {sortedAreas.length === 0 && <p className="muted text-sm">Add life areas in Settings first.</p>}
      </div>
    </div>
  );
}

function NewInitiativeForm({
  areas,
  onDone,
  pending,
  startTransition,
}: {
  areas: Area[];
  onDone: () => void;
  pending: boolean;
  startTransition: (fn: () => void) => void;
}) {
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [planBody, setPlanBody] = useState("");
  const [targetDate, setTargetDate] = useState("");

  return (
    <div className="card mb-4 space-y-2 p-4">
      <div className="flex gap-2">
        <select
          className="rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
          value={areaId}
          onChange={(e) => setAreaId(e.target.value)}
        >
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <input
          className="flex-1 rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
          placeholder="Sector name (e.g. Marketing, Technical tickets)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="date"
          className="rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      </div>
      <textarea
        className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
        placeholder="Plan — the strategy in your own words"
        rows={4}
        value={planBody}
        onChange={(e) => setPlanBody(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          type="button"
          className={btnPrimary + " !px-3 !py-1.5 text-xs"}
          disabled={pending || !title.trim() || !areaId}
          onClick={() =>
            startTransition(async () => {
              await createInitiative({ areaId, title: title.trim(), planBody, targetDate: targetDate || null });
              onDone();
            })
          }
        >
          Save
        </button>
        <button type="button" className="text-xs muted" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
