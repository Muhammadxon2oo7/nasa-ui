import type { AnalyzeResponse, CropId, EconomicsInput, Level, Strategy } from "@/types/api";
import { CROPS } from "@/data/crops";

/** FAO-33 seasonal yield-response factors Ky (Doorenbos & Kassam 1979, Table 24). Missing crops: 1.0 (🔎 T12). */
export const KY: Partial<Record<CropId, number>> = { cotton: 0.85, winter_wheat: 1.05, maize: 1.25, sorghum: 0.9, sunflower: 0.95, soybean: 0.85, alfalfa: 1.1, sugar_beet: 1.0, safflower: 0.8, mung_bean: 1.15, chickpea: 1.15 };
const ECE_OF: Record<Level, number> = { low: 2.5, medium: 5, high: 8 };
/** GAEZ crops whose attainable yield is in the same unit as the farmer's yield (grain/seed, kg/ha). */
const GAEZ_CAP: CropId[] = ["winter_wheat", "barley", "sunflower", "sorghum", "maize"];

export const eceOf = (d: AnalyzeResponse) => d.calendar?.leaching?.inputs.eci ?? ECE_OF[d.soil.salinityLevel];
const saltPct = (c: CropId, ece: number) => Math.max(0, Math.min(100, 100 - CROPS[c].eceSlope * Math.max(0, ece - CROPS[c].eceThreshold)));

export type Profit = { profit: number | null; profitDry: number | null; missing: CropId[]; capped: { crop: CropId; t: number }[] };

/** Average annual net profit (UZS/ha) of a strategy from the farmer's own yields, prices and costs (B2, simplified). */
export function profitOf(s: Strategy, d: AnalyzeResponse, inp: EconomicsInput): Profit {
  const ece = eceOf(d);
  const limit = d.water.limitM3PerHa ?? Infinity;
  const years = [...new Set(s.seasons.map((x) => x.year))];
  const crops = s.seasons.map((x) => x.crop).filter((c) => c !== "fallow");
  const missing = [...new Set(crops.filter((c) => !inp.crops[c]?.yieldTPerHa || !inp.crops[c]?.priceUzsPerKg))];
  const capped: Profit["capped"] = [];
  const calc = (gross: number) => {
    const supply = Math.min(1, limit / Math.max(1, gross));
    let total = 0;
    for (const x of s.seasons) {
      if (x.crop === "fallow") continue;
      const i = inp.crops[x.crop]!;
      let y = i.yieldTPerHa!;
      const g = d.gaez?.crops.find((c) => c.crop === x.crop);
      if (GAEZ_CAP.includes(x.crop) && g?.attainableKgPerHa && y > g.attainableKgPerHa / 1000) {
        y = g.attainableKgPerHa / 1000;
        if (!capped.some((c) => c.crop === x.crop)) capped.push({ crop: x.crop, t: Math.round(y * 10) / 10 });
      }
      const water = Math.max(0, 1 - (KY[x.crop] ?? 1) * (1 - supply));
      total += y * (saltPct(x.crop, ece) / 100) * water * 1000 * i.priceUzsPerKg! - (i.costUzsPerHa ?? 0);
    }
    return total / Math.max(1, years.length);
  };
  if (missing.length) return { profit: null, profitDry: null, missing, capped };
  return { profit: calc(s.waterM3PerHa), profitDry: s.dryWaterM3PerHa ? calc(s.dryWaterM3PerHa) : null, missing, capped };
}

const KEY = "fs:econ";
export function loadEcon(): EconomicsInput {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null") ?? { crops: {} };
  } catch {
    return { crops: {} };
  }
}
export function saveEcon(v: EconomicsInput) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
}
