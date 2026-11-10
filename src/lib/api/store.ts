"use client";
/**
 * MOCK PERSISTENCE LAYER
 * A tiny external store persisted to localStorage. It stands in for a backend.
 * UI components never touch this directly for writes — they call `api.*`
 * (see ./index.ts), which can later be re-implemented with real HTTP calls.
 */
import { useSyncExternalStore } from "react";
import { BRAND } from "@/config/brand";
import type { Database } from "@/lib/types";
import { createSeed, DB_VERSION } from "@/lib/mock/seed";

const STORAGE_KEY = `${BRAND.slug}.demo-db.v${DB_VERSION}`;

let state: Database | null = null;
const listeners = new Set<() => void>();
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function load(): Database {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Database;
      if (parsed.version === DB_VERSION) return parsed;
    }
  } catch {
    /* corrupted or unavailable storage — fall back to the seed */
  }
  return createSeed();
}

function persist() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked — demo continues in memory */
    }
  }, 150);
}

function emit() {
  listeners.forEach((l) => l());
}

export function getState(): Database {
  if (!state) state = load();
  return state;
}

export function setState(updater: (db: Database) => Database) {
  state = updater(getState());
  persist();
  emit();
}

export function resetState() {
  state = createSeed();
  persist();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        state = JSON.parse(e.newValue);
        emit();
      } catch {}
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Returns `null` during server render / hydration, then the live database. */
export function useDbOrNull(): Database | null {
  return useSyncExternalStore(subscribe, getState, () => null);
}

/** Use inside the app shell, where <DataGate> guarantees the data is loaded. */
export function useDb(): Database {
  const db = useDbOrNull();
  if (!db) throw new Error("useDb must be used inside <DataGate>");
  return db;
}
