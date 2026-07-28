"use client";

import { useMemo, useState, useTransition } from "react";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/dates";
import type { Goal, KnowledgeEntry, KnowledgeEntryType, Task } from "@/lib/types";
import { createKnowledgeEntry, removeKnowledgeEntry } from "./actions";

const TYPE_LABELS: Record<KnowledgeEntryType, string> = {
  decision: "Decision",
  user_insight: "User insight",
  framework: "Framework",
  competitor: "Competitor",
};

export function KnowledgeClient({
  entries, goals, tasks,
}: {
  entries: KnowledgeEntry[];
  goals: Goal[];
  tasks: Task[];
}) {
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<KnowledgeEntryType | "all">("all");
  const [creating, setCreating] = useState(false);
  const [isPending, startTransition] = useTransition();

  const goalById = new Map(goals.map((g) => [g.id, g]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const filtered = useMemo(() => {
    return entries
      .filter((e) => filterType === "all" || e.type === filterType)
      .filter((e) =>
        !query.trim() ||
        e.title.toLowerCase().includes(query.toLowerCase()) ||
        e.body.toLowerCase().includes(query.toLowerCase())
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [entries, filterType, query]);

  return (
    <div>
      <PageHeader
        title="Knowledge base"
        subtitle="Decisions, user insights, frameworks, competitors."
        actions={<button className="rounded-md border hairline px-3 py-1.5 text-sm" onClick={() => setCreating(!creating)}>+ New entry</button>}
      />

      <div className="flex flex-wrap gap-2 px-6 pt-4 md:px-8">
        <input
          className="min-w-[200px] flex-1 rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" value={filterType} onChange={(e) => setFilterType(e.target.value as KnowledgeEntryType | "all")}>
          <option value="all">All types</option>
          {Object.entries(TYPE_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </div>

      {creating && (
        <NewEntryForm
          goals={goals}
          tasks={tasks}
          onDone={() => setCreating(false)}
          pending={isPending}
          startTransition={startTransition}
        />
      )}

      <div className="space-y-3 p-6 md:p-8">
        {filtered.length === 0 && <p className="muted text-sm">No entries yet.</p>}
        {filtered.map((e) => (
          <div key={e.id} className="card p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border hairline px-2 py-0.5 text-[10px] muted">{TYPE_LABELS[e.type]}</span>
                  <span className="text-sm font-medium">{e.title}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm muted">{e.body}</p>
                {e.source && <p className="mt-1 text-xs muted">Source: {e.source}</p>}
                {(e.linkedGoalIds.length > 0 || e.linkedTaskIds.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1 text-xs muted">
                    {e.linkedGoalIds.map((id) => goalById.get(id) && <span key={id} className="rounded-full border hairline px-2 py-0.5">{goalById.get(id)!.title}</span>)}
                    {e.linkedTaskIds.map((id) => taskById.get(id) && <span key={id} className="rounded-full border hairline px-2 py-0.5">{taskById.get(id)!.title}</span>)}
                  </div>
                )}
                <p className="mt-2 text-[11px] muted">{formatDate(e.createdAt)}</p>
              </div>
              <button className="text-xs muted hover:underline" onClick={() => startTransition(() => removeKnowledgeEntry(e.id))}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewEntryForm({
  goals, tasks, onDone, pending, startTransition,
}: {
  goals: Goal[];
  tasks: Task[];
  onDone: () => void;
  pending: boolean;
  startTransition: (fn: () => void) => void;
}) {
  const [type, setType] = useState<KnowledgeEntryType>("decision");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [source, setSource] = useState("");
  const [goalId, setGoalId] = useState("");

  return (
    <div className="card mx-6 mt-4 space-y-2 p-4 md:mx-8">
      <div className="flex gap-2">
        <select className="rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" value={type} onChange={(e) => setType(e.target.value as KnowledgeEntryType)}>
          {Object.entries(TYPE_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <input className="flex-1 rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <textarea className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" placeholder="Body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex gap-2">
        <input className="flex-1 rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" placeholder="Source (optional)" value={source} onChange={(e) => setSource(e.target.value)} />
        {goals.length > 0 && (
          <select className="rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">Link goal (optional)</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        )}
      </div>
      <div className="flex gap-2">
        <button
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-[var(--bg)]"
          disabled={pending || !title.trim()}
          onClick={() => startTransition(async () => {
            await createKnowledgeEntry({
              type, title: title.trim(), body, source: source || null,
              linkedGoalIds: goalId ? [goalId] : [], linkedTaskIds: [],
            });
            onDone();
          })}
        >
          Save
        </button>
        <button className="text-xs muted" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
