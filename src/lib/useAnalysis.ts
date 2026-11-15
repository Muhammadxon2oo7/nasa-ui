"use client";

import { useEffect, useState } from "react";
import type { AnalyzeResponse } from "@/types/api";
import { loadDemo, readAnalysis } from "@/api/client";

const mem = new Map<string, AnalyzeResponse>();

/** fieldId → memory → localStorage → demo JSON (FRONTEND_REJASI §3.3.1). */
export function useAnalysis(fieldId: string) {
  const [state, setState] = useState<{ data: AnalyzeResponse | null; status: "loading" | "ok" | "missing" }>({ data: mem.get(fieldId) ?? null, status: mem.has(fieldId) ? "ok" : "loading" });
  useEffect(() => {
    let dead = false;
    (async () => {
      let d = mem.get(fieldId) ?? readAnalysis(fieldId);
      if (!d && fieldId.startsWith("demo-")) d = await loadDemo(fieldId.slice(5)).catch(() => null);
      if (dead) return;
      if (d) {
        mem.set(fieldId, d);
        setState({ data: d, status: "ok" });
      } else setState({ data: null, status: "missing" });
    })();
    return () => {
      dead = true;
    };
  }, [fieldId]);
  return state;
}
