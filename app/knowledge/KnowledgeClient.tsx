"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnPrimary, btnSecondary } from "@/components/nesh/nesh-ui";
import { formatDate } from "@/lib/dates";
import type { Area, Goal, Initiative, KnowledgeEntry, KnowledgeEntryType, Task } from "@/lib/types";
import { createKnowledgeEntry, removeKnowledgeEntry } from "./actions";

const TYPE_LABELS: Record<KnowledgeEntryType, string> = {
  decision: "Decision",
  user_insight: "User insight",
  framework: "Framework",
  competitor: "Competitor",
  document: "Document",
};

export function KnowledgeClient({
  entries, goals, tasks, areas, initiatives,
}: {
  entries: KnowledgeEntry[];
  goals: Goal[];
  tasks: Task[];
  areas: Area[];
  initiatives: Initiative[];
}) {
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<KnowledgeEntryType | "all">("all");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const goalById = new Map(goals.map((g) => [g.id, g]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  void goalById;
  void taskById;

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
    <div className="nesh-page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[13.5px] leading-relaxed text-[#6b6f7d]">
          Decks, sheets, readouts and links — each tagged to an area so it surfaces when you focus there.
        </p>
        <button type="button" className={btnSecondary} onClick={() => setCreating(!creating)}>+ New entry</button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
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
          areas={areas}
          initiatives={initiatives}
          onDone={() => {
            setCreating(false);
            router.refresh();
          }}
          pending={isPending}
          startTransition={startTransition}
        />
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex min-h-[150px] flex-col items-start justify-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-[#d6d6e0] p-4 text-left"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#f2f2f6] text-xl text-[#a7a7b3]">＋</div>
          <div>
            <div className="text-[13.5px] font-semibold text-[#6b6f7d]">New entry</div>
            <div className="mt-0.5 text-xs font-medium text-[#a7a7b3]">decision, insight, framework, link</div>
          </div>
        </button>

        {filtered.length === 0 && !creating ? (
          <div className="col-span-full rounded-2xl border border-dashed border-[#dcdce4] bg-white py-10 text-center text-sm text-[#a7a7b3]">
            No documents yet. Add your first entry.
          </div>
        ) : null}

        {filtered.map((e) => {
          const glyph =
            e.type === "decision" ? "DEC" : e.type === "framework" ? "FWK" : e.type === "competitor" ? "CMP" : "INS";
          const glyphBg =
            e.type === "decision"
              ? "#e8eeff"
              : e.type === "framework"
                ? "#e7f7ec"
                : e.type === "competitor"
                  ? "#fff4e5"
                  : "#fbf1f6";
          const glyphColor =
            e.type === "decision"
              ? "#2f6bff"
              : e.type === "framework"
                ? "#2fae5b"
                : e.type === "competitor"
                  ? "#e8952b"
                  : "#e5449b";
          return (
            <button
              type="button"
              key={e.id}
              className="card flex min-h-[150px] flex-col gap-3 p-4 text-left transition-shadow hover:shadow-md"
              onClick={() => setOpenId(e.id)}
            >
              <div className="flex items-center justify-between">
                <div
                  className="rounded-lg px-2 py-1 text-[10px] font-extrabold tracking-wide"
                  style={{ background: glyphBg, color: glyphColor }}
                >
                  {glyph}
                </div>
                <span className="rounded-full bg-[#f4f4f8] px-2 py-0.5 text-[10px] font-semibold text-[#9a9aa8]">
                  {TYPE_LABELS[e.type]}
                </span>
              </div>
              <div className="text-sm font-semibold leading-snug text-[#1c1c24]">{e.title}</div>
              <p className="line-clamp-3 flex-1 text-xs leading-relaxed text-[#8d8d99]">{e.body}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] text-[#a7a7b3]">updated {formatDate(e.createdAt)}</span>
                <button
                  type="button"
                  className="text-[11px] font-semibold text-[#9a9aa8] hover:text-[#6d4aff]"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    startTransition(async () => {
                      await removeKnowledgeEntry(e.id);
                      router.refresh();
                    });
                  }}
                >
                  Delete
                </button>
              </div>
            </button>
          );
        })}
      </div>

      {openId && (() => {
        const e = entries.find((x) => x.id === openId);
        if (!e) return null;
        return (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpenId(null)}>
            <div className="card max-h-[80vh] w-full max-w-lg overflow-auto p-6" onClick={(ev) => ev.stopPropagation()}>
              <div className="text-xs font-semibold text-[#9a9aa8]">{TYPE_LABELS[e.type]}</div>
              <h3 className="mt-1 text-lg font-semibold">{e.title}</h3>
              <p className="mt-3 whitespace-pre-wrap text-sm text-[#3d3d47]">{e.body}</p>
              {e.source ? (
                <a href={e.source} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-[#6d4aff] hover:underline">
                  Open source →
                </a>
              ) : null}
              <button type="button" className="mt-4 text-xs text-[#9a9aa8] hover:underline" onClick={() => setOpenId(null)}>
                Close
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function NewEntryForm({
  goals, tasks, areas, initiatives, onDone, pending, startTransition,
}: {
  goals: Goal[];
  tasks: Task[];
  areas: Area[];
  initiatives: Initiative[];
  onDone: () => void;
  pending: boolean;
  startTransition: (fn: () => void) => void;
}) {
  const [type, setType] = useState<KnowledgeEntryType>("document");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [source, setSource] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [initiativeId, setInitiativeId] = useState("");
  const [goalId, setGoalId] = useState("");

  const sectorOptions = initiatives.filter((i) => i.areaId === areaId);

  return (
    <div className="card mx-6 mt-4 space-y-2 p-4 md:mx-8">
      <div className="flex gap-2">
        <select className="rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" value={type} onChange={(e) => setType(e.target.value as KnowledgeEntryType)}>
          {Object.entries(TYPE_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <input className="flex-1 rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <textarea className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" placeholder="Body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <select className="rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" value={areaId} onChange={(e) => { setAreaId(e.target.value); setInitiativeId(""); }}>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {sectorOptions.length > 0 && (
          <select className="rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" value={initiativeId} onChange={(e) => setInitiativeId(e.target.value)}>
            <option value="">All sectors in area</option>
            {sectorOptions.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
          </select>
        )}
      </div>
      <div className="flex gap-2">
        <input className="flex-1 rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" placeholder="Link URL (optional)" value={source} onChange={(e) => setSource(e.target.value)} />
        <input className="flex-1 rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" placeholder="File URL (Drive, Notion, etc.)" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} />
        {goals.length > 0 && (
          <select className="rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">Link goal (optional)</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-accent"
          disabled={pending || !title.trim()}
          onClick={() =>
            startTransition(async () => {
              try {
                await createKnowledgeEntry({
                  type,
                  title: title.trim(),
                  body,
                  source: source || null,
                  fileUrl: fileUrl || null,
                  areaId: areaId || null,
                  initiativeId: initiativeId || null,
                  linkedGoalIds: goalId ? [goalId] : [],
                  linkedTaskIds: [],
                });
                onDone();
              } catch (e) {
                console.error(e);
              }
            })
          }
        >
          Save
        </button>
        <button className="text-xs muted" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
