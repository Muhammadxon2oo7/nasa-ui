"use client";

import { useEffect, useState } from "react";
import type { AnalyzeResponse } from "@/types/api";
import { analyzeField, loadDemo, readAnalysis, saveAnalysis } from "@/api/client";

const mem = new Map<string, AnalyzeResponse>();

/** fieldId → memory → localStorage → demo JSON (FRONTEND_REJASI §3.3.1). */
export function useAnalysis(fieldId: string) {
  const [state, setState] = useState<{ data: AnalyzeResponse | null; status: "loading" | "ok" | "missing" }>({ data: mem.get(fieldId) ?? null, status: mem.has(fieldId) ? "ok" : "loading" });
  useEffect(() => {
    let dead = false;
    (async () => {
      let d = mem.get(fieldId) ?? readAnalysis(fieldId);
      if (!d && fieldId.startsWith("demo-")) d = await loadDemo(fieldId.slice(5)).catch(() => null);
      // live-<name>: one of the FastAPI backend's cached demo fields, analysed live (~2-10 s)
      if (!d && fieldId.startsWith("live-")) {
        const { liveDemoRequest, LIVE_DEMOS } = await import("@/api/fastapi");
        const req = liveDemoRequest(fieldId.slice(5), "uz");
        if (req) {
          d = await analyzeField(req).catch(() => null);
          if (d) {
            const demo = LIVE_DEMOS[fieldId.slice(5)];
            d = { ...d, fieldId, field: { ...d.field, region: d.field.region ?? demo?.uz } };
            saveAnalysis(d);
            try {
              localStorage.setItem(`fs:req:${fieldId}`, JSON.stringify(req));
            } catch {}
          }
        }
      }
      // f-<id>: analysed by the backend and stored there (QR passport opened on another phone)
      if (!d && fieldId.startsWith("f-")) {
        const { getAnalysisFastApi } = await import("@/api/fastapi");
        d = await getAnalysisFastApi(fieldId, document.documentElement.lang === "en" ? "en" : "uz").catch(() => null);
        if (d) saveAnalysis(d);
      }
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
