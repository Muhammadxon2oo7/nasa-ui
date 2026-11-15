/**
 * Adapter for the FastAPI backend (github.com/Muhammadalixon-Qodirov/nasa_agro, FRONTEND_UCHUN_API.md).
 * The browser calls /py/* (Next.js rewrite → BACKEND_URL). The backend response is mapped onto the
 * frontend contract (src/types/api.ts) so every screen keeps working; missing parts become ❓ + reason.
 */
import type { AnalyzeRequest, AnalyzeResponse, CalendarData, CropId, Level, SoilData, Strategy } from "@/types/api";
import { CROPS } from "@/data/crops";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const LETTERS = ["A", "B", "C", "D", "E", "F"];
/** unknown crop ids from a newer backend never crash the UI */
const crop = (c: string): CropId => ((CROPS as Record<string, unknown>)[c] ? (c as CropId) : "other");
const ECE: Record<Level, number> = { low: 2.5, medium: 5, high: 8 };
const tol = (thr: number) => (thr >= 7 ? "tolerant" : thr >= 4 ? "moderate" : "sensitive");

export function toBackendRequest(req: AnalyzeRequest): Any {
  return {
    polygon: req.polygon,
    rotation: req.rotation.map((r) => ({ year: r.year, crop: r.crop, ...(r.secondCrop ? { secondCrop: r.secondCrop } : {}) })),
    priorities: req.priorities.filter((p) => p !== "forage").slice(0, 3),
    water: { availability: req.water.availability, method: req.water.method, ...(req.water.limitM3PerHa ? { limitM3PerHa: req.water.limitM3PerHa } : {}) },
    soil: { eceDsM: req.soil?.eceDsM ?? null, humusPct: req.soil?.humusPct ?? null, ecwDsM: req.soil?.ecwDsM ?? null },
    salinityLevel: req.salinityLevel ?? "medium",
    profile: req.profile ?? "farmer",
    lang: req.lang,
  };
}

/** Backend's pre-cached demo fields (FRONTEND_UCHUN_API.md §0): fast (cache) and real. */
export const LIVE_DEMOS: Record<string, { lon: number; lat: number; uz: string; en: string }> = {
  paxta: { lon: 68.7376, lat: 40.5609, uz: "Paxta dalasi", en: "Cotton field" },
  "paxta-bugdoy": { lon: 69.0353, lat: 40.4002, uz: "Paxta-bug'doy dalasi", en: "Cotton-wheat field" },
  beda: { lon: 68.8453, lat: 40.4775, uz: "Beda dalasi", en: "Alfalfa field" },
};
export function liveDemoRequest(name: string, lang: "uz" | "en"): AnalyzeRequest | null {
  const d = LIVE_DEMOS[name];
  if (!d) return null;
  const dx = 0.0012, dy = 0.0009;
  return {
    polygon: { type: "Polygon", coordinates: [[[d.lon - dx, d.lat - dy], [d.lon + dx, d.lat - dy], [d.lon + dx, d.lat + dy], [d.lon - dx, d.lat + dy], [d.lon - dx, d.lat - dy]]] },
    rotation: [2023, 2024, 2025].map((year) => ({ year, crop: null })),
    priorities: ["water", "salinity"],
    water: { availability: "medium", method: "furrow" },
    salinityLevel: "medium",
    profile: "farmer",
    lang,
  };
}

export function fromBackend(b: Any, req?: AnalyzeRequest): AnalyzeResponse {
  const idMap = new Map<string, string>();
  (b.strategies ?? []).forEach((s: Any, i: number) => idMap.set(s.id, LETTERS[i] ?? s.id));
  const L = (id: string) => idMap.get(id) ?? id;
  const planStart = new Date().getUTCFullYear() + (new Date().getUTCMonth() >= 8 ? 1 : 0);
  const ece: number = b.soil?.eceUsed ?? ECE[(b.soil?.salinityLevel as Level) ?? "medium"];

  const strategies: Strategy[] = (b.strategies ?? []).map((s: Any): Strategy => {
    const scores = (s.robustness?.scenarios ?? []).map((x: Any) => x.score);
    const r2 = (s.rules ?? []).find((r: Any) => r.id === "R2")?.status;
    return {
      id: L(s.id),
      name: s.name,
      isCurrent: !!s.isCurrent,
      isNearest: s.isNearest || undefined,
      // backend: year 1..3 + "MM-DD" → real plan years (start > end means the season began the year before)
      seasons: (s.seasons ?? []).map((x: Any) => ({ year: planStart + (x.year - 1), crop: crop(x.crop), start: x.start, end: x.end })),
      metrics: s.metrics,
      unknownReasons: s.unknownReasons,
      score: s.score ?? 0,
      waterM3PerHa: s.waterM3PerHa ?? s.water?.grossM3PerHa ?? 0,
      saltFit: r2 === "fail" ? "bad" : r2 === "warn" ? "warn" : "ok",
      rules: s.rules ?? [],
      explanation: s.explanation,
      robustness: s.robustness ? { score: s.robustness.score, worstScore: scores.length ? Math.min(...scores) : s.robustness.score, scenarios: s.robustness.scenarios } : undefined,
    } as Strategy;
  });

  const byStrategy: AnalyzeResponse["water"]["byStrategy"] = {};
  for (const [id, w] of Object.entries<Any>(b.water?.byStrategy ?? {})) {
    const eff = b.water?.efficiency?.furrow ?? 0.55;
    byStrategy[L(id)] = {
      ...w,
      // the backend puts the irrigation schedule in the calendar; derive the monthly one here for the Water tab
      schedule: (w.monthly ?? []).filter((m: Any) => m.irrigationMm > 15).map((m: Any) => ({ month: m.month, times: Math.max(1, Math.round(m.irrigationMm / 75)), m3PerHa: Math.round((m.irrigationMm * 10) / eff / 100) * 100 })),
    };
  }

  const c = b.climate ?? {};
  const level: Level = (b.soil?.salinityLevel ?? b.summary?.salinity ?? "medium") as Level;
  const soil: SoilData = {
    salinityLevel: level,
    salinityTrend: [],
    isEstimated: b.soil?.isEstimated ?? true,
    cropTolerance: (["barley", "cotton", "sugar_beet", "winter_wheat", "sorghum", "safflower", "sunflower", "soybean", "rice", "alfalfa", "maize", "mung_bean", "chickpea"] as CropId[]).map((cr) => {
      const thr = CROPS[cr].eceThreshold;
      return { crop: cr, tolerance: tol(thr), fit: ece <= thr ? "ok" : ece <= thr * 1.5 ? "warn" : "bad" };
    }),
  };

  const h = b.history;
  const history = h
    ? {
        ndvi: (h.ndvi ?? []).map((x: Any) => ({ date: x.date, value: x.value })),
        seasons: (h.seasons ?? []).map((s: Any) => ({ year: s.year, crops: (s.crops ?? []).map((x: Any) => ({ crop: crop(x.crop), start: x.start, end: x.end, confidence: x.confidence ?? 0.5, source: x.source === "user" ? "user" : "rules" })) })),
        bareWindows: (h.bareSummers ?? []).filter((x: Any) => x.days > 0).map((x: Any) => ({ start: `${x.year}-06-15`, end: `${x.year}-10-15`, days: x.days })),
        model: h.model ? { name: h.model.name, accuracy: h.model.accuracy ?? undefined } : undefined,
      }
    : { ndvi: [], seasons: [], bareWindows: [] };

  const cal = b.calendar;
  const calendar: CalendarData | null = cal
    ? {
        today: cal.today,
        thisWeek: (cal.thisWeek ?? []).map((e: Any, i: number) => ({ ...e, id: `w${i}-${e.type}-${e.date}`, severity: e.severity ?? undefined, m3PerHa: e.m3PerHa ?? undefined })),
        next90Days: (cal.next90Days ?? []).map((e: Any, i: number) => ({ ...e, id: `n${i}-${e.type}-${e.date}`, severity: e.severity ?? undefined, m3PerHa: e.m3PerHa ?? undefined })),
        leaching: cal.leaching
          ? {
              recommended: !!cal.leaching.recommended,
              reason: cal.leaching.reason ?? "",
              stages: (cal.leaching.stages ?? []).map((x: Any) => ({ date: x.date, m3PerHa: x.m3PerHa })),
              totalLowM3PerHa: cal.leaching.totalLowM3PerHa ?? cal.leaching.totalM3PerHa ?? 0,
              totalHighM3PerHa: cal.leaching.totalHighM3PerHa ?? cal.leaching.totalM3PerHa ?? 0,
              continuousM3PerHa: cal.leaching.alternativeContinuousM3PerHa ?? 0,
              method: cal.leaching.method ?? "intermittent",
              inputs: { eci: cal.leaching.inputs?.eci ?? ece, ecf: cal.leaching.inputs?.ecf ?? 0, depthM: cal.leaching.inputs?.depthM ?? 0.6, k: cal.leaching.inputs?.k ?? 0.1, eciSource: cal.leaching.inputs?.eciSource ?? "satellite", nextCrop: (strategies[1]?.seasons[0]?.crop ?? "cotton") as CropId },
              warnings: cal.leaching.warnings ?? [],
              frozenRisk: (cal.leaching.frozenRisk ?? []).map((f: Any) => ({ dekad: `${f.month}-${f.dekad}`, pct: Math.round(f.pct) })),
            }
          : undefined,
      }
    : null;

  // short, user-facing wording for known backend gaps (the backend's own text is for developers)
  const FRIENDLY: Record<string, { uz: string; en: string }> = {
    salinity: { uz: "Sho'rlanish darajasi so'rovnomadagi qiymat bo'yicha olindi", en: "Salinity level taken from your answer" },
    satellite: { uz: "Sun'iy yo'ldosh qatlami vaqtincha ulanmagan", en: "Satellite layer temporarily unavailable" },
    forecast: { uz: "7 kunlik prognoz vaqtincha olinmadi", en: "7-day forecast temporarily unavailable" },
    seasonal: { uz: "Mavsumiy prognoz vaqtincha olinmadi", en: "Seasonal forecast temporarily unavailable" },
  };
  const lang = req?.lang === "en" ? "en" : "uz";
  const reasons: string[] = (b.degraded ?? []).map((d: Any) => FRIENDLY[d.part]?.[lang] ?? d.reason ?? d.part);
  const field = b.field ?? {};
  return {
    fieldId: b.fieldId,
    backend: "fastapi",
    field: { areaHa: field.areaHa, centroid: field.centroid, periodStart: field.periodStart, periodEnd: field.periodEnd, polygon: field.polygon ?? req?.polygon, elevationM: field.elevationM ?? null, slopeDeg: null },
    summary: { text: b.summary?.text ?? "", salinity: level, waterNeedM3PerHa: b.summary?.waterNeedM3PerHa ?? 0, mainRisk: b.summary?.mainRisk ?? "-", bestStrategyId: L(b.summary?.bestStrategyId ?? strategies[1]?.id ?? "A") },
    history,
    climate: {
      lastSpringFrost: { median: c.lastSpringFrost?.median ?? "-", latest: c.lastSpringFrost?.latest ?? "-", latestYear: c.lastSpringFrost?.latest_year ?? c.lastSpringFrost?.latestYear ?? 0 },
      firstAutumnFrost: { median: c.firstAutumnFrost?.median ?? "-", earliest: c.firstAutumnFrost?.earliest ?? "-", earliestYear: c.firstAutumnFrost?.earliest_year ?? c.firstAutumnFrost?.earliestYear ?? 0 },
      frostFreeDays: c.frostFreeDays ?? 0,
      heatDays40: c.heatDays40 ?? [],
      monthly: (c.monthly ?? []).map((m: Any) => ({ ...m, tmaxP10: m.tmaxP10 ?? m.tmaxAvg, tmaxP90: m.tmaxP90 ?? m.tmaxAvg })),
      precipTrendPct: c.precipTrendPctPerDecade ?? 0,
      gddAfterWheat: 0,
      cropGddFit: [],
      frostProbability: c.frostProbability ?? [],
      spi3: c.spi3,
    },
    soil,
    water: { byStrategy, efficiency: b.water?.efficiency ?? { furrow: 0.55, drip: 0.9, sprinkler: 0.75 }, limitM3PerHa: b.water?.limitM3PerHa ?? undefined },
    strategies,
    seasonal: b.seasonal
      ? {
          model: "ecmwf_seas5",
          issuedAt: b.generatedAt,
          members: b.seasonal.members,
          months: b.seasonal.months.map((m: Any) => ({ month: m.month, tempNormal: m.tmaxNormal, tempP10: m.tmaxP10, tempP50: m.tmaxP50, tempP90: m.tmaxP90, precipNormal: m.precipNormal, precipP10: m.precipP10, precipP50: m.precipP50, precipP90: m.precipP90, probWarmer: m.probWarmer, probWetter: m.probWetter })),
          robustness: {},
          confidence: (b.seasonal.months[0]?.confidence ?? "low") as Level,
        }
      : undefined,
    forecast: b.forecast ?? null,
    calendar,
    sources: (b.sources ?? []).map((s: Any) => ({ id: s.id, name: s.name, provider: s.provider ?? "", url: s.url ?? "" })),
    degraded: reasons.length ? reasons : undefined,
    degradedReasons: reasons,
    extrasUnknown: { norms: "-", ...(h ? {} : { history: reasons.join("; ") }) },
    generatedAt: b.generatedAt,
    profile: req?.profile ?? "farmer",
    modulesComputed: ["crop"],
  } as AnalyzeResponse;
}

/** POST /py/api/analyze → frontend contract. Throws on failure (caller falls back to the built-in API). */
export async function analyzeFastApi(req: AnalyzeRequest, signal?: AbortSignal): Promise<AnalyzeResponse> {
  const res = await fetch("/py/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toBackendRequest(req)), signal });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = (j as Any).detail;
    const err = new Error(typeof d === "string" ? d : `http_${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return fromBackend(dashes(j), req);
}

/** House style: plain hyphen instead of en/em dashes in any backend text. */
function dashes<T>(v: T): T {
  if (typeof v === "string") return v.replace(/ — /g, " - ").replace(/[—–]/g, "-") as T;
  if (Array.isArray(v)) return v.map(dashes) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dashes(x)])) as T;
  return v;
}
