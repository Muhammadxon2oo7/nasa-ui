"use client";

import { useEffect, useState } from "react";
import type { AnalyzeResponse } from "@/types/api";
import { analyzeField, loadDemo, readAnalysis, saveAnalysis } from "@/api/client";
import { useLang } from "@/i18n";

const mem = new Map<string, AnalyzeResponse>();

/** fieldId → memory → localStorage → demo JSON (FRONTEND_REJASI §3.3.1). */
export function useAnalysis(fieldId: string) {
  const lang = useLang((x) => x.lang);
  const [state, setState] = useState<{ data: AnalyzeResponse | null; status: "loading" | "ok" | "missing" }>({ data: mem.get(fieldId) ?? null, status: mem.has(fieldId) ? "ok" : "loading" });
  useEffect(() => {
    let dead = false;
    const ctrl = new AbortController();
    (async () => {
      const uiLang = useLang.getState().lang === "en" ? "en" : "uz";
      let d = mem.get(fieldId) ?? readAnalysis(fieldId);
      // live demo boundaries were redrawn from imagery: a copy saved with an older polygon is stale
      if (d && fieldId.startsWith("live-")) {
        const { LIVE_DEMOS } = await import("@/api/fastapi");
        const ring = LIVE_DEMOS[fieldId.slice(5)]?.ring;
        const first = d.field.polygon?.coordinates?.[0]?.[0];
        if (ring && (!first || Math.abs(first[0] - ring[0][0]) > 1e-6 || Math.abs(first[1] - ring[0][1]) > 1e-6)) d = null;
        // the backend writes names and reasons in the request language: refetch after a language switch
        let savedLang: string | undefined;
        try {
          savedLang = JSON.parse(localStorage.getItem(`fs:req:${fieldId}`) ?? "null")?.lang;
        } catch {}
        if (d && savedLang && savedLang !== uiLang) d = null;
      }
      if (!d && fieldId.startsWith("demo-")) d = await loadDemo(fieldId.slice(5)).catch(() => null);
      // live-<name>: one of the FastAPI backend's cached demo fields, analysed live (~2-10 s)
      if (!d && fieldId.startsWith("live-")) {
        const { liveDemoRequest, LIVE_DEMOS } = await import("@/api/fastapi");
        const req = liveDemoRequest(fieldId.slice(5), uiLang);
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
      if (!d || d.backend !== "fastapi") return;
      const lang = uiLang;
      const swap = (next: AnalyzeResponse) => {
        const merged = { ...next, fieldId, field: { ...next.field, region: next.field.region ?? d!.field.region } };
        mem.set(fieldId, merged);
        saveAnalysis(merged);
        if (!dead) setState({ data: merged, status: "ok" });
        return merged;
      };
      // preliminary answer from the wizard: keep polling the job and swap in the full result
      if (d.preliminary && d.pendingJobId) {
        const { resumeJobFastApi } = await import("@/api/fastapi");
        const full = await resumeJobFastApi(d.pendingJobId, lang, ctrl.signal).catch(() => null);
        if (dead) return;
        if (full) d = swap(full);
        else {
          // job lost (server restart): the stored analysis is the next best thing
          const { getAnalysisFastApi } = await import("@/api/fastapi");
          const saved = await getAnalysisFastApi(d.sourceId ?? fieldId, lang).catch(() => null);
          if (saved && !dead) d = swap(saved);
        }
      }
      // optional parts (GAEZ, M1, ...) finish in the background: ask once more a little later
      if (d && (d.complete === false || d.explanationStatus === "pending") && !dead) {
        await new Promise((r) => setTimeout(r, 90_000));
        if (dead) return;
        const { getAnalysisFastApi } = await import("@/api/fastapi");
        const later = await getAnalysisFastApi(d.sourceId ?? fieldId, lang).catch(() => null);
        if (later && !dead) swap(later);
      }
    })();
    return () => {
      dead = true;
      ctrl.abort();
    };
  }, [fieldId, lang]);
  return state;
}
