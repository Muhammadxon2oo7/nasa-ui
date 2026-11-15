import type { CropId, DetectedCrop, HistoryData, Level, SoilData } from "@/types/api";
import { CROPS, toleranceClass } from "@/data/crops";
import type { S2Month, SoilProps } from "../sources";
import type { PowerDaily } from "../sources";
import { mean, median, round, theilSen } from "./stats";

/* ------------------------------------------------------------------ M1 fallback (B0) */

/**
 * Field history from monthly Sentinel-2 NDVI with phenology rules (PRO_REJA §6.1 baseline B0,
 * used until the Presto model is trained). Returns crops per year + summer bare windows.
 */
export function detectHistory(months: S2Month[], userRotation: { year: number; crop: CropId | null; secondCrop?: CropId | null }[]): HistoryData {
  const byYear = new Map<number, (number | null)[]>();
  for (const m of months) {
    const y = +m.month.slice(0, 4);
    const arr = byYear.get(y) ?? new Array(12).fill(null);
    arr[+m.month.slice(5, 7) - 1] = m.ndvi;
    byYear.set(y, arr);
  }
  const fill = (a: (number | null)[]) => {
    const o = a.slice();
    for (let i = 0; i < 12; i++)
      if (o[i] == null) {
        const p = o.slice(0, i).reverse().find((v) => v != null);
        const n = o.slice(i + 1).find((v) => v != null);
        o[i] = p != null && n != null ? (p + n) / 2 : null;
      }
    return o;
  };
  const seasons: HistoryData["seasons"] = [];
  const bareWindows: HistoryData["bareWindows"] = [];
  const thisYear = new Date().getUTCFullYear();
  for (const [y, raw] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    const n = fill(raw);
    const present = raw.slice(2, 10).filter((v) => v != null).length / 8;
    const v = (i: number) => n[i] ?? 0;
    const springPeak = Math.max(v(2), v(3), v(4));
    const springIdx = [2, 3, 4].reduce((b, i) => (v(i) > v(b) ? i : b), 2);
    const summerPeak = Math.max(v(6), v(7), v(8));
    const summerIdx = [6, 7, 8].reduce((b, i) => (v(i) > v(b) ? i : b), 6);
    const earlySummerLow = Math.min(v(5), v(6));
    const growMonths = [3, 4, 5, 6, 7, 8, 9].filter((i) => v(i) >= 0.4).length;
    const minGrow = Math.min(...[3, 4, 5, 6, 7, 8, 9].map(v));
    const crops: DetectedCrop[] = [];
    const conf = (margin: number) => round(Math.max(0.35, Math.min(0.92, 0.5 + margin * 1.4)) * (0.6 + 0.4 * present), 2);

    if (present < 0.4 || (y === thisYear && raw.slice(0, 9).filter((x) => x != null).length < 6)) continue;

    if (growMonths >= 5 && minGrow >= 0.28) {
      crops.push({ crop: "alfalfa", start: `${y}-03-25`, end: `${y}-10-20`, confidence: conf(minGrow - 0.28 + 0.1), source: "rules" });
    } else if ((springPeak >= 0.45 && springPeak - v(6) >= 0.2) || (springPeak >= 0.3 && springPeak - v(6) >= 0.12 && summerPeak < springPeak)) {
      crops.push({ crop: "winter_wheat", start: `${y - 1}-10-05`, end: `${y}-06-15`, confidence: conf(springPeak - 0.45 + 0.1), source: "rules" });
      if (Math.max(v(7), v(8)) >= 0.4 && earlySummerLow < springPeak - 0.2) {
        crops.push({ crop: "other", start: `${y}-06-25`, end: `${y}-10-05`, confidence: conf(Math.max(v(7), v(8)) - 0.4), source: "rules" });
      }
    } else if (summerPeak >= 0.42 && springPeak < 0.38) {
      // cotton, maize and rice share this NDVI shape; cotton is by far the most common summer crop
      crops.push({ crop: "cotton", start: `${y}-04-20`, end: `${y}-10-20`, confidence: Math.min(0.8, conf(summerPeak - 0.42)), source: "rules" });
    } else if (Math.max(springPeak, summerPeak) < 0.3) {
      crops.push({ crop: "fallow", start: `${y}-01-01`, end: `${y}-12-31`, confidence: conf(0.3 - Math.max(springPeak, summerPeak)), source: "rules" });
    } else {
      crops.push({ crop: "other", start: `${y}-${String(springPeak > summerPeak ? springIdx + 1 : summerIdx - 2).padStart(2, "0")}-01`, end: `${y}-10-01`, confidence: 0.4, source: "rules" });
    }

    // summer bare windows (Jun-Oct, NDVI < 0.25, ≥ 2 months in a row)
    let runStart = -1;
    for (let i = 5; i <= 9; i++) {
      const low = n[i] != null && (n[i] as number) < 0.25;
      if (low && runStart < 0) runStart = i;
      if ((!low || i === 9) && runStart >= 0) {
        const endM = low && i === 9 ? i : i - 1;
        if (endM - runStart + 1 >= 2) {
          const s = `${y}-${String(runStart + 1).padStart(2, "0")}-01`;
          const lastDay = new Date(Date.UTC(y, endM + 1, 0)).getUTCDate();
          const e = `${y}-${String(endM + 1).padStart(2, "0")}-${lastDay}`;
          bareWindows.push({ start: s, end: e, days: Math.round((Date.parse(e) - Date.parse(s)) / 864e5) + 1 });
        }
        runStart = -1;
      }
    }
    seasons.push({ year: y, crops });
  }

  // farmer's answers override detection for those years (PRO_REJA: "user" source)
  for (const r of userRotation) {
    if (!r.crop) continue;
    const crops: DetectedCrop[] = [];
    const prev = r.crop === "winter_wheat" || r.crop === "barley";
    crops.push({ crop: r.crop, start: prev ? `${r.year - 1}-10-05` : `${r.year}-04-15`, end: prev ? `${r.year}-06-15` : `${r.year}-10-15`, confidence: 1, source: "user" });
    if (r.secondCrop) crops.push({ crop: r.secondCrop, start: `${r.year}-06-22`, end: `${r.year}-10-05`, confidence: 1, source: "user" });
    const i = seasons.findIndex((s) => s.year === r.year);
    if (i >= 0) seasons[i] = { year: r.year, crops };
    else seasons.push({ year: r.year, crops });
  }
  seasons.sort((a, b) => a.year - b.year);

  return {
    ndvi: months.map((m) => ({ date: m.month, value: m.ndvi == null ? null : round(m.ndvi, 3) })),
    seasons,
    bareWindows,
    model: { name: "NDVI phenology rules (B0) · Presto M1 planned" },
  };
}

/* ------------------------------------------------------------------ salinity + soil */

const ECE_OF: Record<Level, number> = { low: 2.5, medium: 5, high: 8 };

/**
 * Salinity from bare-soil Sentinel-2 months (NDVI < 0.2): SI = √(Blue·Red) (Khan et al. 2005).
 * 3 levels with provisional thresholds (PRO_REJA T7: calibrate on pilot fields).
 * A lab ECe from the farmer always wins.
 */
export function soilAnalysis(months: S2Month[], soil: SoilProps | null, power: PowerDaily | null, eceUser?: number) {
  const perYear = new Map<number, number[]>();
  for (const m of months) {
    if (m.si == null || m.ndvi == null || m.ndvi >= 0.2) continue;
    const y = +m.month.slice(0, 4);
    perYear.set(y, [...(perYear.get(y) ?? []), m.si]);
  }
  const trend = [...perYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, v]) => ({ year, ndsi: round(median(v), 4) }));
  const recent = trend.slice(-3).map((t) => t.ndsi);
  const si = mean(recent);
  let level: Level = !Number.isFinite(si) ? "medium" : si < 0.22 ? "low" : si < 0.27 ? "medium" : "high";
  let isEstimated = true;
  if (eceUser != null && Number.isFinite(eceUser)) {
    level = eceUser < 4 ? "low" : eceUser < 8 ? "medium" : "high";
    isEstimated = false;
  }
  const ece = eceUser ?? ECE_OF[level];
  const yrs = trend.map((t) => t.year);
  const slope = theilSen(yrs, trend.map((t) => t.ndsi));
  const trendPct = trend.length >= 3 ? round(((slope * Math.min(3, yrs.length - 1)) / Math.max(1e-6, mean(trend.map((t) => t.ndsi)))) * 100, 0) : undefined;

  const show: CropId[] = ["barley", "cotton", "sugar_beet", "winter_wheat", "sorghum", "safflower", "sunflower", "soybean", "rice", "alfalfa", "maize", "mung_bean", "chickpea"];
  const cropTolerance: SoilData["cropTolerance"] = show.map((c) => {
    const p = CROPS[c];
    return { crop: c, tolerance: toleranceClass(p), fit: ece <= p.eceThreshold ? "ok" : ece <= p.eceThreshold * 1.5 ? "warn" : "bad" };
  });

  let texture: SoilData["texture"];
  if (soil && Number.isFinite(soil.clay)) {
    const cl = soil.clay;
    const className = cl < 10 ? "sandy" : cl < 20 ? "light_loam" : cl < 30 ? "medium_loam" : cl < 40 ? "heavy_loam" : "clay";
    texture = { clay: round(soil.clay, 0), sand: round(soil.sand, 0), silt: round(soil.silt, 0), className };
  }

  // root-zone wetness: last 24 months vs 20-year climatology (NASA POWER GWETROOT, MERRA-2)
  let soilMoisture: SoilData["soilMoisture"];
  if (power) {
    const byYm = new Map<string, number[]>();
    power.dates.forEach((d, i) => byYm.set(d.slice(0, 7), [...(byYm.get(d.slice(0, 7)) ?? []), power.gwetRoot[i]]));
    const clim = Array.from({ length: 12 }, (_, m) => mean([...byYm.entries()].filter(([k]) => +k.slice(5, 7) === m + 1).map(([, v]) => mean(v))));
    soilMoisture = [...byYm.entries()].slice(-24).map(([k, v]) => ({ date: k, rootzone: round(mean(v), 3), climatology: round(clim[+k.slice(5, 7) - 1], 3) }));
  }

  return {
    data: {
      salinityLevel: level,
      salinityTrend: trend,
      salinityTrendPct: trendPct,
      texture,
      socGKg: soil ? round(soil.socGKg, 1) : undefined,
      ph: soil ? round(soil.ph, 1) : undefined,
      soilMoisture,
      cropTolerance,
      isEstimated,
    } satisfies SoilData,
    ece,
  };
}
