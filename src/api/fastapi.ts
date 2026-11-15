import { dashes } from "@/lib/clean";
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
    // all unknown → [] so the backend reads the rotation from Sentinel-2 (rotationSource: "satellite")
    rotation: req.rotation.every((r) => !r.crop) ? [] : req.rotation.map((r) => ({ year: r.year, crop: r.crop, ...(r.secondCrop ? { secondCrop: r.secondCrop } : {}) })),
    priorities: req.priorities.filter((p) => p !== "forage").slice(0, 3),
    water: { availability: req.water.availability, method: req.water.method, ...(req.water.limitM3PerHa ? { limitM3PerHa: req.water.limitM3PerHa } : {}), ...(req.water.appliedM3PerHa ? { appliedM3PerHa: req.water.appliedM3PerHa } : {}) },
    soil: { eceDsM: req.soil?.eceDsM ?? null, humusPct: req.soil?.humusPct ?? null, ecwDsM: req.soil?.ecwDsM ?? null },
    salinityLevel: req.salinityLevel ?? "medium",
    profile: req.profile ?? "farmer",
    lang: req.lang,
    ...(req.modules?.length ? { modules: req.modules } : {}),
    ...(req.livestock ? { livestock: { herd: req.livestock.herd, grazingFrom: req.livestock.grazingFrom, grazingTo: req.livestock.grazingTo, pastureType: req.livestock.pastureType, hasWaterOnSite: req.livestock.hasWaterOnSite } } : {}),
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
      income: s.income ? { ...s.income, byCrop: (s.income.byCrop ?? []).map((c: Any) => ({ ...c, crop: crop(c.crop) })), missing: (s.income.missing ?? []).map(crop) } : undefined,
      waterNorms: Array.isArray(s.waterNorms) ? s.waterNorms.map((n: Any) => ({ ...n, crop: crop(n.crop) })) : undefined,
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
  const tx = b.soil?.texture;
  const si = b.soil?.salinityIndex;
  const soil: SoilData = {
    salinityLevel: level,
    salinityTrend: (si?.series ?? []).filter((x: Any) => x.si1 != null).map((x: Any) => ({ year: x.year, ndsi: x.si1 })),
    salinityTrendPct: si?.trendPctPerDecade ?? undefined,
    texture: tx?.clay != null ? { clay: Math.round(tx.clay), sand: Math.round(tx.sand), silt: Math.round(tx.silt), className: tx.clay < 10 ? "sandy" : tx.clay < 20 ? "light_loam" : tx.clay < 30 ? "medium_loam" : tx.clay < 40 ? "heavy_loam" : "clay" } : undefined,
    socGKg: b.soil?.socGKg ?? undefined,
    ph: b.soil?.ph ?? undefined,
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
  // Template explanations are a design choice, not missing data; and raw server reasons may name
  // config (env vars, keys, URLs), which never belongs on a farmer's screen.
  const SECRETISH = /[A-Z][A-Z0-9]*_[A-Z0-9_]{2,}|api[_ -]?key|token|secret|https?:\/\//i;
  const generic = lang === "en" ? "Part of the data is temporarily limited" : "Ma'lumotning bir qismi vaqtincha cheklangan";
  const reasons: string[] = [
    ...new Set<string>(
      (b.degraded ?? [])
        .filter((d: Any) => d.part !== "explanation")
        .map((d: Any) => FRIENDLY[d.part]?.[lang] ?? (typeof d.reason === "string" && !SECRETISH.test(d.reason) ? d.reason : generic)),
    ),
  ];
  const unk = (v: number | null | undefined, why: string) => (v == null ? { value: null, reason: why } : v);
  const LV = (l: string | null | undefined): Level => (l === "high" ? "high" : l === "low" ? "low" : "medium");

  const ls = b.livestock;
  const livestock = ls
    ? {
        pasture: {
          statusLevel: LV(ls.pasture?.statusLevel),
          anomalyPct: unk(ls.pasture?.anomalyPct, lang === "uz" ? "MODIS NDVI yetarli emas" : "Not enough MODIS NDVI"),
          percentile: unk(ls.pasture?.percentile, "-"),
          year: new Date().getUTCFullYear(),
          ndviThisYear: ls.pasture?.ndviThisYear ?? [],
          ndviNorm: ls.pasture?.ndviNorm ?? [],
          yearlyPeak: ls.pasture?.yearlyPeak ?? [],
          droughtYears: (ls.pasture?.yearlyPeak ?? []).filter((y: Any, _i: number, a: Any[]) => y.ndvi < [...a].sort((p: Any, q: Any) => p.ndvi - q.ndvi)[Math.floor(a.length * 0.2)]?.ndvi).map((y: Any) => y.year),
          areaHa: b.field?.areaHa ?? 0,
        },
        capacity: {
          lowAuPerHa: unk(ls.capacity?.lowAuPerHa, lang === "uz" ? "MODIS NPP ma'lumoti yo'q" : "No MODIS NPP"),
          highAuPerHa: unk(ls.capacity?.highAuPerHa, lang === "uz" ? "MODIS NPP ma'lumoti yo'q" : "No MODIS NPP"),
          herdAu: ls.capacity?.herdAu ?? 0,
          grazingDays: ls.grazingDays ?? 0,
          status: ls.capacity?.status ?? "unknown",
          assumptions: (ls.capacity?.assumptions ?? []).map((a: Any) => ({ name: a.name, value: a.value, unit: a.unit ?? "", source: a.source ?? "" })),
        },
        heat: {
          stressDaysPerYear: ls.heat?.stressDaysPerYear ?? 0,
          severeDaysPerYear: ls.heat?.severeDaysPerYear ?? 0,
          trendDaysPerDecade: ls.heat?.trendDaysPerDecade ?? 0,
          yearly: ls.heat?.perYear ?? [],
          monthly: (ls.heat?.monthly ?? []).map((m: Any) => ({ month: m.month, thiMean: m.thiMean, thiMax: m.thiPeakMean ?? m.thiMax })),
          forecast7d: (ls.heat?.forecast7d ?? []).map((f: Any) => ({ date: f.date, thiMax: f.thiMax, level: f.level === "severe" ? "high" : f.level === "moderate" ? "medium" : "low" })),
          thresholds: ls.heat?.thresholds ?? { mild: 72, moderate: 79, severe: 89 },
        },
        waterSources: ls.waterSources ? { nearestPermanentKm: unk(ls.waterSources.nearestPermanentKm, lang === "uz" ? "30 km ichida doimiy suv topilmadi" : "No permanent water within 30 km"), nearestSeasonalKm: unk(ls.waterSources.nearestSeasonalKm, lang === "uz" ? "30 km ichida mavsumiy suv topilmadi" : "No seasonal water within 30 km"), radiusKm: ls.waterSources.searchRadiusKm ?? 30 } : undefined,
        recommendations: (ls.recommendations ?? []).map((r: Any, i: number) => ({ ...r, id: `r${i}`, title: String(r.title ?? r.why ?? "").split(/[.:]/)[0].slice(0, 90) })),
      }
    : undefined;

  const wa = b.water?.actual;
  const actualWater = wa
    ? {
        year: wa.year,
        crops: (wa.cropsDetected ?? []).map(crop),
        needM3PerHa: wa.needM3PerHa ?? null,
        needReason: wa.needReason ?? undefined,
        consumedM3PerHa: wa.consumedM3PerHa,
        consumedLow: wa.consumedLowM3PerHa ?? wa.consumedM3PerHa,
        consumedHigh: wa.consumedHighM3PerHa ?? wa.consumedM3PerHa,
        checks: (wa.checks ?? []).map((c: Any) => ({ source: c.source, m3PerHa: c.m3PerHa ?? null, note: c.note })),
        monthly: (wa.monthly ?? []).map((m: Any) => ({ month: m.month, needMm: m.needMm ?? null, consumedMm: m.consumedMm, ndvi: null })),
        method: wa.method ?? "",
        appliedM3PerHa: wa.appliedM3PerHa ?? undefined,
        efficiencyPct: wa.efficiencyPct ?? undefined,
        excessM3PerHa: wa.excessM3PerHa ?? undefined,
      }
    : null;

  const ws = b.waterSupply;
  const L2 = (l: string | null | undefined): Level => (l === "low" ? "low" : l === "high" ? "high" : "medium");
  const waterSupply = ws
    ? {
        basin: ws.basin,
        basinName: ws.basinName,
        flowName: "",
        lastSeason: { season: ws.lastSeason?.season ?? "", snowAnomalyPct: Math.round(ws.lastSeason?.anomalyPct ?? 0), percentile: ws.lastSeason?.percentile ?? 50, level: L2(ws.lastSeason?.level) },
        currentSeason: { season: ws.currentSeason?.season ?? "", from: "11-01", lastDate: null, snowAnomalyPct: ws.currentSeason?.anomalyPct ?? null, level: ws.currentSeason?.level === "early" ? ("early" as const) : L2(ws.currentSeason?.level), confidence: ws.currentSeason?.confidence === "medium" ? ("medium" as Level) : ("low" as Level) },
        history: (ws.history ?? []).map((h: Any) => ({ year: +String(h.season).slice(0, 4) + 1, snowIndex: h.snowIndexPct, marchSnow: h.snowIndexPct, summerFlow: null })),
        correlation: null,
        correlationYears: null,
        sources: ws.sources ?? ["MODIS"],
      }
    : null;
  const field = b.field ?? {};
  return {
    fieldId: b.fieldId,
    sourceId: b.fieldId,
    backend: "fastapi",
    field: { areaHa: field.areaHa, centroid: field.centroid, periodStart: field.periodStart, periodEnd: field.periodEnd, polygon: field.polygon ?? req?.polygon, elevationM: field.elevationM ?? b.soil?.terrain?.elevationM ?? null, slopeDeg: b.soil?.terrain?.slopeDeg ?? null },
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
    extrasUnknown: { norms: lang === "uz" ? "Rasmiy gidromodul me'yorlari hali ulanmagan" : "Official hydromodule norms not connected yet", ...(h ? {} : { history: reasons.join("; ") }), ...(wa ? {} : { actualWater: lang === "uz" ? "Dala tarixi bo'lmagani uchun hisoblanmadi" : "Needs field history" }) },
    livestock,
    actualWater,
    waterSupply,
    generatedAt: b.generatedAt,
    profile: req?.profile ?? "farmer",
    modulesComputed: b.modulesComputed ?? (ls ? ["crop", "livestock"] : ["crop"]),
  } as AnalyzeResponse;
}

/** POST /py/api/analyze → frontend contract. Throws on failure (caller falls back to the built-in API). */
export async function analyzeFastApi(req: AnalyzeRequest, signal?: AbortSignal): Promise<AnalyzeResponse> {
  const body = JSON.stringify(toBackendRequest(req));
  // a first analysis can outlive the gateway (502/504) while the backend keeps computing and caches it: retry once
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("/py/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal });
    if ((res.status === 502 || res.status === 504) && attempt === 0) {
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const d = (j as Any).detail;
      const err = new Error(typeof d === "string" ? d : `http_${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return fromBackend(dashes(j), req);
  }
}


/** POST /py/api/compare (land selection) → the compare page's table rows. */
export async function compareFastApi(req: import("@/types/api").CompareRequest, signal?: AbortSignal): Promise<import("@/types/api").CompareResponse> {
  const res = await fetch("/py/api/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ places: req.places, goal: req.goal, method: "furrow" }), signal });
  const j = dashes(await res.json().catch(() => ({})));
  if (!res.ok) throw new Error(typeof (j as Any).detail === "string" ? (j as Any).detail : `http_${res.status}`);
  const uz = req.lang !== "en";
  const ps: Any[] = (j as Any).places ?? [];
  const best = (f: (p: Any) => number | null, dir: "min" | "max") => {
    const v = ps.map(f).filter((x): x is number => x != null);
    return v.length ? (dir === "min" ? Math.min(...v) : Math.max(...v)) : null;
  };
  const bWater = best((p) => p.waterM3PerHa ?? null, "min"), bFfd = best((p) => p.frostFreeDays ?? null, "max"), bSlope = best((p) => p.slopeDeg ?? null, "min");
  const bHeat = best((p) => p.heatDays ?? null, "min"), bSalt = best((p) => p.salinityTrendPct ?? null, "min"), bNear = best((p) => p.nearestWaterKm ?? null, "min");
  const n0 = (v: number) => Math.round(v).toLocaleString("ru-RU");
  return {
    goal: req.goal,
    bestPlaceId: (j as Any).bestPlaceId,
    explanation: (j as Any).explanation,
    places: ps.map((p, i) => ({
      placeId: p.placeId,
      name: p.name ?? req.places[i]?.name,
      areaHa: p.areaHa,
      suitability: p.suitability ?? 0,
      mainRisk: p.mainRisk ?? undefined,
      polygon: req.places.find((q) => q.name === p.name)?.polygon ?? req.places[i].polygon,
      rows: {
        suitability: { value: String(p.suitability ?? "?"), better: p.rank === 1 },
        region: { value: p.centroid ? `${(+p.centroid[0]).toFixed(3)}°N, ${(+p.centroid[1]).toFixed(3)}°E` : "-", better: false },
        salinity: { value: p.salinityTrendPct == null ? "?" : `${uz ? "indeks" : "index"} ${p.salinityTrendPct > 0 ? "+" : ""}${Math.round(p.salinityTrendPct)}%/${uz ? "10 yil" : "10 yr"}`, better: p.salinityTrendPct != null && p.salinityTrendPct === bSalt },
        ...(req.goal === "pasture" ? {} : { water: { value: p.waterM3PerHa == null ? "?" : `${n0(p.waterM3PerHa)} m³/${uz ? "ga" : "ha"}`, better: p.waterM3PerHa != null && p.waterM3PerHa === bWater } }),
        frostFree: { value: p.frostFreeDays == null ? "?" : `${p.frostFreeDays} ${uz ? "kun" : "days"}`, better: p.frostFreeDays === bFfd },
        slope: { value: p.slopeDeg == null ? "?" : `${p.slopeDeg}°`, better: p.slopeDeg != null && p.slopeDeg === bSlope },
        heat: { value: p.heatDays == null ? "?" : `${Math.round(p.heatDays)} ${uz ? "kun/yil" : "days/yr"}`, better: p.heatDays != null && p.heatDays === bHeat },
        nearWater: { value: p.nearestWaterKm == null ? "?" : `${p.nearestWaterKm} km`, better: p.nearestWaterKm != null && p.nearestWaterKm === bNear },
        history: { value: (p.recentCrops ?? []).map((c: string) => CROPS[crop(c)]?.name[uz ? "uz" : "en"] ?? c).join(" → ") || "-", better: false },
        risk: { value: p.mainRisk ?? "-", better: false },
      },
    })),
  };
}
