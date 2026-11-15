import "server-only";
import type { AnalyzeRequest, CompareRequest, CompareResponse, CompareGoal, CropId } from "@/types/api";
import { CROPS, seasonDays } from "@/data/crops";
import { CAL } from "@/data/templates";
import { cropIcon } from "@/lib/format";
import { compute, gather, type Inputs } from "./analyze";
import { et0Fao56, prepWx } from "./core/climate";
import { clamp, mean, round } from "./core/stats";
import { waterForPlan } from "./core/water";
import { pool } from "./cache";

const GOAL_CROP: Record<Exclude<CompareGoal, "pasture" | "general">, CropId> = { winter_wheat: "winter_wheat", cotton: "cotton", alfalfa: "alfalfa" };
const ECE_OF = { low: 2.5, medium: 5, high: 8 } as const;

/** Water need (m³/ha, furrow) of the goal crop grown every year on this place. */
function goalWater(inp: Inputs, crop: CropId) {
  const w = prepWx(inp.power, 0, 0);
  const et0 = et0Fao56(w, inp.lat);
  const spec = Object.values(CAL).find((s) => s.crop === crop && s.start !== "06-22") ?? CAL.cotton;
  return waterForPlan(w, et0, [[spec], [spec], [spec]], 1.2).grossM3PerHa;
}

const yieldPct = (crop: CropId, ece: number) => clamp(100 - CROPS[crop].eceSlope * Math.max(0, ece - CROPS[crop].eceThreshold));

/** Weighted mean that skips unknown (null) parts (ADR-10). */
const wmean = (parts: { v: number | null; w: number }[]) => {
  const ok = parts.filter((p) => p.v != null && Number.isFinite(p.v));
  const tw = ok.reduce((a, p) => a + p.w, 0);
  return tw ? Math.round(ok.reduce((a, p) => a + (p.v as number) * p.w, 0) / tw) : 0;
};

export async function compare(req: CompareRequest): Promise<CompareResponse> {
  const lang = req.lang === "en" ? "en" : "uz";
  const L = (uz: string, en: string) => (lang === "uz" ? uz : en);
  const goal = req.goal;
  const places = req.places.slice(0, 4);
  const done = await pool(places, 2, async (p) => {
    const ar: AnalyzeRequest = {
      polygon: p.polygon,
      rotation: [2023, 2024, 2025].map((year) => ({ year, crop: null })),
      priorities: goal === "pasture" ? ["forage"] : ["water", "salinity"],
      water: { availability: "medium", method: "furrow" },
      lang,
      profile: "land_seeker",
      modules: goal === "pasture" ? ["crop", "livestock"] : ["crop"],
    };
    const [id, inputs] = await gather(ar);
    const res = compute(id, inputs, 0, 0).res;
    return { p, id, inputs, res };
  });
  if (done.some((d) => !d)) throw new Error("one place failed");
  const rows = done.map((d) => {
    const { res, inputs } = d!;
    const ece = inputs.req.soil?.eceDsM ?? ECE_OF[res.soil.salinityLevel];
    const unknownSalt = !res.soil.salinityTrend.length && res.soil.isEstimated;
    const slope = res.field.slopeDeg ?? null;
    const slopeScore = slope == null ? null : slope < 2 ? 100 : slope < 5 ? 80 : slope < 8 ? 50 : 20;
    const cultivated = res.history.seasons.length ? (res.history.seasons.filter((s) => s.crops.some((c) => c.crop !== "fallow")).length / res.history.seasons.length) * 100 : null;
    const heat = mean(res.climate.heatDays40.slice(-10).map((h) => h.days));
    const crops: CropId[] = goal === "general" ? ["winter_wheat", "cotton"] : goal === "pasture" ? [] : [GOAL_CROP[goal]];
    const gaezOf = (c: CropId) => res.gaez?.crops.find((g) => g.crop === c)?.suitability ?? null;
    const cropScores = crops.map((c) => {
      const water = goalWater(inputs, c);
      const fits = res.climate.frostFreeDays >= seasonDays(c) || CROPS[c].frostKillC < -5;
      const s = wmean([
        { v: unknownSalt ? null : yieldPct(c, ece), w: 0.25 },
        { v: clamp(100 * (1 - water / 18000)), w: 0.2 },
        { v: fits ? 100 : 40, w: 0.2 },
        { v: slopeScore, w: 0.1 },
        { v: cultivated, w: 0.15 },
        { v: CROPS[c].heatSensitive ? clamp(100 - heat * 1.5) : 90, w: 0.1 },
        { v: gaezOf(c), w: 0.2 }, // N9: FAO GAEZ as an independent "second opinion"
      ]);
      return { c, s, water, gaez: gaezOf(c) };
    });
    let suitability = cropScores.length ? Math.round(mean(cropScores.map((x) => x.s))) : 0;
    let waterNeed = cropScores.length ? Math.round(mean(cropScores.map((x) => x.water)) / 100) * 100 : null;
    const gz = cropScores.map((x) => x.gaez).filter((v): v is number => v != null);
    const gaez = gz.length ? Math.round(mean(gz)) : null;
    let pastureTxt: string | undefined;
    if (goal === "pasture") {
      const ls = res.livestock;
      const anomaly = ls && typeof ls.pasture.anomalyPct === "number" ? ls.pasture.anomalyPct : null;
      const peak = ls?.pasture.yearlyPeak.length ? mean(ls.pasture.yearlyPeak.slice(-5).map((p) => p.ndvi)) : null;
      const waterKm = ls && typeof ls.waterSources?.nearestPermanentKm === "number" ? ls.waterSources.nearestPermanentKm : null;
      suitability = wmean([
        { v: peak == null ? null : clamp(((peak - 0.12) / 0.4) * 100), w: 0.35 },
        { v: anomaly == null ? null : clamp(60 + anomaly * 2), w: 0.15 },
        { v: ls ? clamp(100 - ls.heat.stressDaysPerYear * 1.2) : null, w: 0.2 },
        { v: waterKm == null ? null : clamp(100 - waterKm * 8), w: 0.2 },
        { v: slopeScore, w: 0.1 },
      ]);
      waterNeed = null;
      pastureTxt = anomaly == null ? "?" : `${anomaly > 0 ? "+" : ""}${anomaly}%`;
    }
    const last3 = res.history.seasons.slice(-4, -1).map((s) => s.crops.map((c) => cropIcon(c.crop)).join("")).join(" ") || "—";
    const risks: string[] = [];
    if (res.soil.salinityLevel === "high") risks.push(L("kuchli sho'r", "high salinity"));
    else if ((res.soil.salinityTrendPct ?? 0) > 10 && res.soil.salinityLevel !== "low") risks.push(L("sho'r ortmoqda", "salinity rising"));
    if (heat > 25) risks.push(L("jazirama", "heat waves"));
    if (slope != null && slope > 5) risks.push(L("qiyalik / eroziya", "slope / erosion"));
    return {
      placeId: d!.id,
      name: d!.p.name,
      areaHa: res.field.areaHa,
      polygon: d!.p.polygon,
      suitability,
      mainRisk: risks[0],
      raw: { salt: res.soil.salinityLevel, saltUnknown: unknownSalt, trend: res.soil.salinityTrendPct, water: waterNeed, ffd: res.climate.frostFreeDays, slope, heat: Math.round(heat), last3, pastureTxt, gaez, region: [res.field.region, res.field.district].filter(Boolean).join(", ") },
    };
  });

  const bestIdx = rows.reduce((b, r, i, a) => (r.suitability > a[b].suitability ? i : b), 0);
  const minBy = (f: (r: (typeof rows)[number]) => number | null) => {
    const vs = rows.map(f).filter((v): v is number => v != null);
    return vs.length ? Math.min(...vs) : null;
  };
  const maxBy = (f: (r: (typeof rows)[number]) => number | null) => {
    const vs = rows.map(f).filter((v): v is number => v != null);
    return vs.length ? Math.max(...vs) : null;
  };
  const saltRank = { low: 0, medium: 1, high: 2 } as const;
  const bestSalt = minBy((r) => (r.raw.saltUnknown ? null : saltRank[r.raw.salt]));
  const bestWater = minBy((r) => r.raw.water);
  const bestFfd = maxBy((r) => r.raw.ffd);
  const bestSlope = minBy((r) => r.raw.slope);
  const bestHeat = minBy((r) => r.raw.heat);
  const bestGaez = maxBy((r) => r.raw.gaez);
  const lvlTxt = (l: "low" | "medium" | "high") => (lang === "uz" ? { low: "past", medium: "o'rta", high: "yuqori" }[l] : l);

  const out: CompareResponse["places"] = rows.map((r, i) => ({
    placeId: r.placeId,
    name: r.name,
    areaHa: r.areaHa,
    polygon: r.polygon,
    suitability: r.suitability,
    mainRisk: r.mainRisk,
    rows: {
      suitability: { value: String(r.suitability), better: i === bestIdx },
      region: { value: r.raw.region || "—", better: false },
      salinity: { value: r.raw.saltUnknown ? "❓" : `${lvlTxt(r.raw.salt)}${(r.raw.trend ?? 0) > 5 ? " ↑" : ""}`, better: !r.raw.saltUnknown && saltRank[r.raw.salt] === bestSalt },
      ...(goal === "pasture"
        ? { pasture: { value: r.raw.pastureTxt ?? "?", better: false } }
        : { water: { value: r.raw.water == null ? "—" : `${r.raw.water.toLocaleString("ru-RU")} m³/${L("ga", "ha")}`, better: r.raw.water === bestWater } }),
      frostFree: { value: `${r.raw.ffd} ${L("kun", "days")}`, better: r.raw.ffd === bestFfd },
      slope: { value: r.raw.slope == null ? "❓" : `${r.raw.slope}°`, better: r.raw.slope === bestSlope },
      heat: { value: `${r.raw.heat} ${L("kun/yil", "days/yr")}`, better: r.raw.heat === bestHeat },
      ...(goal === "pasture" ? {} : { gaez: { value: r.raw.gaez == null ? "❓" : `${r.raw.gaez}/100`, better: r.raw.gaez != null && r.raw.gaez === bestGaez } }),
      history: { value: r.raw.last3, better: false },
      risk: { value: r.mainRisk ?? "—", better: false },
    },
  }));

  const b = rows[bestIdx];
  const second = [...rows].sort((x, y) => y.suitability - x.suitability)[1];
  const goalName = { winter_wheat: L("bug'doy", "wheat"), cotton: L("paxta", "cotton"), alfalfa: L("beda", "alfalfa"), pasture: L("yaylov", "pasture"), general: L("umumiy dehqonchilik", "general farming") }[goal];
  const explanation: CompareResponse["explanation"] = {
    why: L(`"${b.name}" ${goalName} uchun eng yuqori moslik baliga ega (${b.suitability}${second ? `, keyingisi ${second.name}: ${second.suitability}` : ""}).`, `"${b.name}" has the highest suitability for ${goalName} (${b.suitability}${second ? `, next ${second.name}: ${second.suitability}` : ""}).`),
    evidence: [
      { text: L(`Sho'rlanish: ${b.raw.saltUnknown ? "noma'lum" : lvlTxt(b.raw.salt)}`, `Salinity: ${b.raw.saltUnknown ? "unknown" : lvlTxt(b.raw.salt)}`), source: "Sentinel-2 SI" },
      { text: L(`Sovuqsiz davr: ${b.raw.ffd} kun`, `Frost-free period: ${b.raw.ffd} days`), source: "NASA POWER 2005–2025" },
      ...(b.raw.water != null ? [{ text: L(`Suv talabi: ${b.raw.water.toLocaleString("ru-RU")} m³/ga`, `Water need: ${b.raw.water.toLocaleString("en-US")} m³/ha`), source: "FAO-56" }] : []),
      ...(b.raw.slope != null ? [{ text: L(`Qiyalik: ${b.raw.slope}°`, `Slope: ${b.raw.slope}°`), source: "SRTM" }] : []),
    ],
    benefits: [L("Maqsadga mos ekin uchun kam xavf", "Lower risk for the target use")],
    gaps: [L("Yer narxi, suv huquqi va infratuzilma hisobga olinmagan", "Land price, water rights and infrastructure are not included"), L("Sho'rlanish sun'iy yo'ldosh taxmini", "Salinity is a satellite estimate")],
    risks: b.mainRisk ? [b.mainRisk] : [L("Sotib olish yoki ijaradan oldin tuproq tahlili qildiring", "Run a soil test before buying or renting")],
    generatedBy: "template",
  };
  return { goal, places: out, bestPlaceId: rows[bestIdx].placeId, explanation };
}

export const _round = round;
