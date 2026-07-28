"use server";

import { revalidatePath } from "next/cache";
import { saveKnowledgeEntry, deleteKnowledgeEntry, newId, nowIso } from "@/lib/repo";
import { normalizeKnowledgeEntry } from "@/lib/goal-utils";
import type { KnowledgeEntry, KnowledgeEntryType } from "@/lib/types";

export async function createKnowledgeEntry(input: {
  type: KnowledgeEntryType;
  title: string;
  body: string;
  source: string | null;
  fileUrl?: string | null;
  areaId: string | null;
  initiativeId: string | null;
  linkedGoalIds: string[];
  linkedTaskIds: string[];
}) {
  const entry: KnowledgeEntry = normalizeKnowledgeEntry({
    id: newId("kb"),
    ...input,
    fileUrl: input.fileUrl ?? null,
    createdAt: nowIso(),
  });
  await saveKnowledgeEntry(entry);
  revalidatePath("/knowledge");
  return entry;
}

export async function removeKnowledgeEntry(id: string) {
  await deleteKnowledgeEntry(id);
  revalidatePath("/knowledge");
}
