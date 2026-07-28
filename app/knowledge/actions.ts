"use server";

import { revalidatePath } from "next/cache";
import { saveKnowledgeEntry, deleteKnowledgeEntry, newId, nowIso } from "@/lib/repo";
import type { KnowledgeEntry, KnowledgeEntryType } from "@/lib/types";

export async function createKnowledgeEntry(input: {
  type: KnowledgeEntryType;
  title: string;
  body: string;
  source: string | null;
  linkedGoalIds: string[];
  linkedTaskIds: string[];
}) {
  const entry: KnowledgeEntry = {
    id: newId("kb"),
    ...input,
    createdAt: nowIso(),
  };
  await saveKnowledgeEntry(entry);
  revalidatePath("/knowledge");
  return entry;
}

export async function removeKnowledgeEntry(id: string) {
  await deleteKnowledgeEntry(id);
  revalidatePath("/knowledge");
}
