"use server";

import { revalidatePath } from "next/cache";
import {
  getSettings,
  saveSettings,
  saveWorkspaceInvite,
  listWorkspaceInvites,
  deleteWorkspaceInvite,
  saveWorkspace,
  getWorkspace,
  newId,
  nowIso,
} from "@/lib/repo";
import { DEFAULT_WORKSPACE_ID } from "@/lib/types";
import type { WorkspaceInvite } from "@/lib/types";

export async function ensureDefaultWorkspace() {
  const existing = await getWorkspace(DEFAULT_WORKSPACE_ID);
  if (existing) return existing;
  const ws = {
    id: DEFAULT_WORKSPACE_ID,
    name: "My workspace",
    createdAt: nowIso(),
    ownerUserId: null,
  };
  await saveWorkspace(ws);
  return ws;
}

export async function updateWorkspaceName(name: string) {
  const settings = await getSettings();
  await saveSettings({ ...settings, workspaceName: name.trim() || "My workspace" });
  const ws = await getWorkspace(settings.activeWorkspaceId ?? DEFAULT_WORKSPACE_ID);
  if (ws) await saveWorkspace({ ...ws, name: name.trim() || ws.name });
  revalidatePath("/settings");
}

export async function createWorkspaceInvite(email: string): Promise<{ ok: true; inviteUrl: string } | { ok: false; message: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) return { ok: false, message: "Enter a valid email." };

  await ensureDefaultWorkspace();
  const settings = await getSettings();
  const workspaceId = settings.activeWorkspaceId ?? DEFAULT_WORKSPACE_ID;
  const token = newId("inv");

  const invite: WorkspaceInvite = {
    id: newId("wsinv"),
    workspaceId,
    email: trimmed,
    token,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    acceptedAt: null,
  };
  await saveWorkspaceInvite(invite);
  revalidatePath("/settings");

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return { ok: true, inviteUrl: `${base}/join?token=${token}` };
}

export async function listPendingInvites() {
  const settings = await getSettings();
  const ws = settings.activeWorkspaceId ?? DEFAULT_WORKSPACE_ID;
  const invites = await listWorkspaceInvites();
  return invites.filter((i) => i.workspaceId === ws && !i.acceptedAt);
}

export async function revokeInvite(inviteId: string) {
  await deleteWorkspaceInvite(inviteId);
  revalidatePath("/settings");
}
