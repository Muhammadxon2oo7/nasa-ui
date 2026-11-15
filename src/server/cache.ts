import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Serverless hosts (Vercel) only allow writes under /tmp; the ignore hint keeps the tracer
// from bundling the whole project into the server function.
const DIR = process.env.CACHE_DIR ?? (process.env.VERCEL ? "/tmp/terravision-cache" : path.join(/* turbopackIgnore: true */ process.cwd(), ".cache"));

export const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 24);

/** File cache with TTL (PRO_REJA §4.2). Never throws: a broken cache just means a fresh fetch. */
export async function cached<T>(ns: string, key: unknown, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const file = path.join(DIR, ns, `${hash(key)}.json`);
  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as { t: number; v: T };
    if (Date.now() - raw.t < ttlMs) return raw.v;
  } catch {}
  const v = await fn();
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ t: Date.now(), v }));
  } catch {}
  return v;
}

export async function readCache<T>(ns: string, id: string): Promise<T | null> {
  if (!/^[a-z0-9-]+$/i.test(id)) return null;
  try {
    return (JSON.parse(await readFile(path.join(DIR, ns, `${id}.json`), "utf8")) as { v: T }).v;
  } catch {
    return null;
  }
}
export async function writeCache(ns: string, id: string, v: unknown) {
  try {
    await mkdir(path.join(DIR, ns), { recursive: true });
    await writeFile(path.join(DIR, ns, `${id}.json`), JSON.stringify({ t: Date.now(), v }));
  } catch {}
}

export const DAY = 864e5;

/** fetch JSON with timeout + retry on 5xx/429. */
export async function getJson<T>(url: string, init: RequestInit & { timeoutMs?: number; tries?: number } = {}): Promise<T> {
  const { timeoutMs = 30_000, tries = 3, ...rest } = init;
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...rest, signal: ctrl.signal, headers: { "User-Agent": "FieldShiftUZ/0.1 (NASA Space Apps 2026)", ...(rest.headers ?? {}) } });
      if (res.ok) return (await res.json()) as T;
      last = new Error(`${new URL(url).host} ${res.status}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) {
      last = e;
    } finally {
      clearTimeout(t);
    }
    await new Promise((r) => setTimeout(r, 800 * 2 ** i));
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/** Run async tasks with a concurrency limit, keeping order; failures become null. */
export async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      try {
        out[k] = await fn(items[k]);
      } catch {
        out[k] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
