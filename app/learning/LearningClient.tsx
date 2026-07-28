"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AreaTag } from "@/components/AreaTag";
import type { Area, Task } from "@/lib/types";
import { activateLearningItem, closeLearningItem, createLearningItem, deleteLearningItem, returnToBacklog } from "./actions";

export function LearningClient({ areas, tasks }: { areas: Area[]; tasks: Task[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const areaById = new Map(areas.map((a) => [a.id, a]));

  const active = tasks.filter((t) => t.status === "active");
  const backlog = tasks.filter((t) => t.status === "backlog");

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="nesh-page">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-[#6b6f7d]">Active is capped at 2. Every item closes only when its artifact exists.</p>
        <button className="rounded-[10px] border border-[#e6e6ee] bg-white px-3 py-1.5 text-sm font-semibold" onClick={() => setCreating(!creating)}>
          + New
        </button>
      </div>
      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}
      {creating && <NewLearningForm areas={areas} onDone={() => { setCreating(false); router.refresh(); }} run={run} pending={isPending} />}

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium">Active ({active.length}/2)</h2>
          <div className="space-y-2">
            {active.map((t) => (
              <div key={t.id} className="card p-4">
                <div className="text-sm font-medium">{t.title}</div>
                {areaById.get(t.areaId) && <div className="mt-1"><AreaTag name={areaById.get(t.areaId)!.name} colorToken={areaById.get(t.areaId)!.colorToken} /></div>}
                <div className="mt-2 text-xs muted">Artifact: {t.artifactDefinition}</div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <button className="muted hover:underline" onClick={() => run(() => returnToBacklog(t.id))}>Return to backlog</button>
                  <button className="text-emerald-600 hover:underline dark:text-emerald-400" onClick={() => run(() => closeLearningItem(t.id))}>
                    Artifact produced — close
                  </button>
                  <button
                    className="text-[#9a9aa8] hover:text-[#c95a2b] hover:underline"
                    onClick={() => {
                      if (confirm("Delete this learning item?")) {
                        run(async () => {
                          await deleteLearningItem(t.id);
                          router.refresh();
                        });
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {active.length === 0 && <p className="muted text-sm">No active slot in use.</p>}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium">Backlog ({backlog.length})</h2>
          <div className="space-y-2">
            {backlog.map((t) => (
              <div key={t.id} className="card p-4">
                <div className="text-sm font-medium">{t.title}</div>
                {areaById.get(t.areaId) && <div className="mt-1"><AreaTag name={areaById.get(t.areaId)!.name} colorToken={areaById.get(t.areaId)!.colorToken} /></div>}
                {t.artifactDefinition && <div className="mt-2 text-xs muted">Artifact: {t.artifactDefinition}</div>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="rounded-md border hairline px-2 py-1 text-xs disabled:opacity-40"
                    disabled={isPending || active.length >= 2}
                    onClick={() => run(() => activateLearningItem(t.id))}
                  >
                    Move to active
                  </button>
                  <button
                    type="button"
                    className="text-xs text-[#9a9aa8] hover:text-[#c95a2b] hover:underline"
                    onClick={() => {
                      if (confirm("Delete this learning item?")) {
                        run(async () => {
                          await deleteLearningItem(t.id);
                          router.refresh();
                        });
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {backlog.length === 0 && <p className="muted text-sm">Backlog is empty.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function NewLearningForm({
  areas, onDone, run, pending,
}: {
  areas: Area[];
  onDone: () => void;
  run: (fn: () => Promise<void>) => void;
  pending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [artifactDefinition, setArtifactDefinition] = useState("");

  return (
    <div className="card mx-6 mt-4 space-y-2 p-4 md:mx-8">
      <input className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" placeholder="What are you learning?" value={title} onChange={(e) => setTitle(e.target.value)} />
      <select className="rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
        {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <textarea className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" placeholder="Artifact definition — what closes this out" rows={2} value={artifactDefinition} onChange={(e) => setArtifactDefinition(e.target.value)} />
      <div className="flex gap-2">
        <button
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-[var(--bg)]"
          disabled={pending || !title.trim()}
          onClick={() => { run(async () => { await createLearningItem(title.trim(), areaId, artifactDefinition); onDone(); }); }}
        >
          Add to backlog
        </button>
        <button className="text-xs muted" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
