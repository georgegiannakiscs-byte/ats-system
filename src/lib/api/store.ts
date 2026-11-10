"use client";
/**
 * Client workspace store. Holds ONE company's workspace, loaded from
 * GET /api/orgs/:orgId/snapshot. UI writes are applied optimistically and
 * sent to POST /api/orgs/:orgId/commands; the server is authoritative and the
 * store re-syncs after every command (and rolls back on error).
 */
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { Database } from "@/lib/types";

let state: Database | null = null;
let orgId: string | null = null;
let pending = 0;
let resyncTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) {
    super(message);
  }
}

export async function apiFetch<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(url, { ...init, headers: { ...(isForm ? {} : { "Content-Type": "application/json" }), ...init?.headers }, credentials: "same-origin" });
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !url.includes("/api/auth/")) window.location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    throw new ApiError(res.status, data?.error ?? "Request failed", data?.code, data?.details);
  }
  return data as T;
}

export const currentOrgId = () => orgId;

export async function loadWorkspace(id: string) {
  const data = await apiFetch<Database>(`/api/orgs/${id}/snapshot`);
  if (orgId !== id) state = null;
  orgId = id;
  state = data;
  emit();
  return data;
}

export function clearWorkspace() {
  state = null;
  orgId = null;
  emit();
}

function scheduleResync() {
  if (resyncTimer) clearTimeout(resyncTimer);
  resyncTimer = setTimeout(() => {
    if (pending === 0 && orgId) loadWorkspace(orgId).catch(() => {});
  }, 250);
}

/** Sends a command for the current company. Errors are surfaced once, centrally, and state re-syncs. */
export async function send(type: string, payload: Record<string, unknown> = {}) {
  if (!orgId) throw new Error("No workspace loaded");
  pending++;
  try {
    await apiFetch(`/api/orgs/${orgId}/commands`, { method: "POST", body: JSON.stringify({ type, payload }) });
  } catch (e) {
    const err = e as ApiError;
    if (err.code !== "duplicate") toast.error(err.message || "Couldn't save the change", { description: err.code === "forbidden" ? "Your role in this company doesn't allow this action." : "Your change was not saved." });
    throw e;
  } finally {
    pending--;
    scheduleResync();
  }
}

export function getState(): Database {
  if (!state) throw new Error("Workspace not loaded");
  return state;
}

export function setState(updater: (db: Database) => Database) {
  if (!state) return;
  state = updater(state);
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onFocus = () => orgId && pending === 0 && loadWorkspace(orgId).catch(() => {});
  window.addEventListener("focus", onFocus);
  return () => {
    listeners.delete(l);
    window.removeEventListener("focus", onFocus);
  };
}

export function useDbOrNull(): Database | null {
  return useSyncExternalStore(subscribe, () => state, () => null);
}

export function useDb(): Database {
  const db = useDbOrNull();
  if (!db) throw new Error("useDb must be used inside the workspace shell");
  return db;
}

/** Permission check for UI affordances. The server enforces the same rules. */
export function useCan(permission: string) {
  const db = useDbOrNull();
  return !!db?.org.permissions.includes(permission);
}
