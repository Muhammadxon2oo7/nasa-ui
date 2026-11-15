"use client";

import type { AnalyzeRequest, AnalyzeResponse, ModelInfo, Strategy } from "@/types/api";
import { dashes } from "@/lib/clean";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export class ApiError extends Error {
  constructor(public code: string, public status: number, message?: string) {
    super(message ?? code);
  }
}
/** backend validation codes -> the wizard's own messages */
const CODE: Record<string, string> = { polygon_too_small: "tooSmall", polygon_too_large: "tooLarge" };

export async function api<T>(path: string, init?: RequestInit & { timeoutMs?: number; signal?: AbortSignal }): Promise<T> {
  if (DEMO_MODE) throw new ApiError("demo-mode", 0);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 35_000);
  init?.signal?.addEventListener("abort", () => ctrl.abort());
  try {
    const res = await fetch(`${API}${path}`, { ...init, signal: ctrl.signal, headers: { "Content-Type": "application/json", ...init?.headers } });
    const j = dashes(await res.json().catch(() => ({})));
    if (!res.ok) throw new ApiError((j as { error?: string }).error ?? `http_${res.status}`, res.status);
    return j as T;
  } finally {
    clearTimeout(t);
  }
}

export const loadDemo = async (name: string) => {
  const res = await fetch(`/demo/${name}.json`);
  if (!res.ok) throw new ApiError("demo_missing", res.status);
  return dashes(await res.json()) as AnalyzeResponse;
};

const USE_FASTAPI = process.env.NEXT_PUBLIC_USE_FASTAPI !== "false";

/**
 * Primary: the team's FastAPI backend (via /py rewrite). A 422 (bad input) is shown to the user as is;
 * any other failure falls back to the built-in Next.js analysis so the demo never dies.
 */
export const analyzeField = async (req: AnalyzeRequest, signal?: AbortSignal): Promise<AnalyzeResponse> => {
  if (USE_FASTAPI && !DEMO_MODE) {
    try {
      const { analyzeFastApi } = await import("./fastapi");
      return await analyzeFastApi(req, signal);
    } catch (e) {
      const x = e as Error & { status?: number; code?: string };
      if (x.status === 422) throw new ApiError(CODE[x.code ?? ""] ?? x.code ?? "validation_error", 422, x.message);
      if (signal?.aborted) throw e;
    }
  }
  return api<AnalyzeResponse>("/api/analyze", { method: "POST", body: JSON.stringify(req), timeoutMs: 150_000, signal });
};

export const whatIf = (fieldId: string, dT: number, dPpct: number, signal?: AbortSignal) =>
  api<{ strategies: Strategy[] }>("/api/whatif", { method: "POST", body: JSON.stringify({ fieldId, dT, dPpct }), timeoutMs: 20_000, signal });

export const getModels = async () => {
  try {
    return await api<ModelInfo[]>("/api/models");
  } catch {
    return (await (await fetch("/demo/models.json")).json()) as ModelInfo[];
  }
};

/* ------------- local storage: analyses (last 5) and saved fields (plan §6, §3.6) ------------- */

const safe = <T,>(fn: () => T, fb: T): T => {
  try {
    return fn();
  } catch {
    return fb;
  }
};

export function saveAnalysis(d: AnalyzeResponse) {
  safe(() => {
    localStorage.setItem(`fs:analysis:${d.fieldId}`, JSON.stringify(d));
    const idx: string[] = JSON.parse(localStorage.getItem("fs:analysis:index") ?? "[]");
    const next = [d.fieldId, ...idx.filter((x) => x !== d.fieldId)];
    next.slice(5).forEach((id) => localStorage.removeItem(`fs:analysis:${id}`));
    localStorage.setItem("fs:analysis:index", JSON.stringify(next.slice(0, 5)));
  }, undefined);
}
export const readAnalysis = (id: string) => safe(() => JSON.parse(localStorage.getItem(`fs:analysis:${id}`) ?? "null") as AnalyzeResponse | null, null);

export type SavedField = { id: string; name: string; areaHa: number; region?: string; polygon: GeoJSON.Polygon; savedAt: string; fieldId: string; request?: Partial<AnalyzeRequest> };
export const listFields = () => safe(() => JSON.parse(localStorage.getItem("fs:fields") ?? "[]") as SavedField[], []);
export const saveFields = (f: SavedField[]) => safe(() => localStorage.setItem("fs:fields", JSON.stringify(f)), undefined);

export const compareFields = async (req: import("@/types/api").CompareRequest, signal?: AbortSignal) => {
  // pasture goal still needs the built-in livestock comparison; everything else goes to the FastAPI backend first
  if (USE_FASTAPI && !DEMO_MODE && req.goal !== "pasture") {
    try {
      const { compareFastApi } = await import("./fastapi");
      return await compareFastApi(req, signal);
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  return api<import("@/types/api").CompareResponse>("/api/compare", { method: "POST", body: JSON.stringify(req), timeoutMs: 240_000, signal });
};
