import type { Crop, CropId, Level } from "@/types/api";

/**
 * Crop parameters.
 * - kc / stage lengths: FAO-56 Tables 11-12 (Allen et al. 1998), adapted to Central Asian sowing dates.
 * - eceThreshold / eceSlope: Maas & Hoffman (1977) via FAO-29 Rev.1 Table 4 (yield % = 100 − slope·(ECe − threshold)).
 * - gddRequired: base tbase °C, typical for Uzbekistan double-crop / main-crop varieties.
 * - market / labor: 1-5 expert estimates (to be replaced with FAO FPMA / local bazaar prices).
 * ⚠️ PRO_REJA T6: values still to be checked line by line against the FAO originals.
 */
export type CropParams = {
  id: CropId;
  name: { uz: string; en: string };
  icon: string;
  color: string;
  kc: [number, number, number]; // ini, mid, end
  stages: [number, number, number, number]; // ini, dev, mid, late (days)
  tbase: number;
  gddRequired: number;
  frostKillC: number; // Tmin that damages the crop in its sensitive stage
  heatSensitive: boolean; // flowering hurt by ≥40 °C
  eceThreshold: number; // dS/m
  eceSlope: number; // % yield loss per dS/m
  nFixing: boolean;
  rootDepthM: number;
  family: string;
  market: number; // 1-5
  labor: number; // 1-5
  waterClass: Level;
  /** extra water for flooded rice (percolation + ponding), mm/day */
  extraMmDay?: number;
};

const P = (p: CropParams) => p;

export const CROPS: Record<CropId, CropParams> = {
  cotton: P({ id: "cotton", name: { uz: "Paxta", en: "Cotton" }, icon: "☁️", color: "#B0BEC5", kc: [0.35, 1.18, 0.6], stages: [30, 50, 60, 45], tbase: 10, gddRequired: 2000, frostKillC: 0, heatSensitive: false, eceThreshold: 7.7, eceSlope: 5.2, nFixing: false, rootDepthM: 1.4, family: "malvaceae", market: 4, labor: 4, waterClass: "high" }),
  winter_wheat: P({ id: "winter_wheat", name: { uz: "Kuzgi bug'doy", en: "Winter wheat" }, icon: "🌾", color: "#F9A825", kc: [0.7, 1.15, 0.3], stages: [30, 140, 40, 30], tbase: 0, gddRequired: 2000, frostKillC: -18, heatSensitive: true, eceThreshold: 6.0, eceSlope: 7.1, nFixing: false, rootDepthM: 1.5, family: "poaceae", market: 4, labor: 2, waterClass: "medium" }),
  barley: P({ id: "barley", name: { uz: "Arpa", en: "Barley" }, icon: "🌾", color: "#FFCA28", kc: [0.3, 1.15, 0.25], stages: [30, 120, 40, 25], tbase: 0, gddRequired: 1700, frostKillC: -15, heatSensitive: true, eceThreshold: 8.0, eceSlope: 5.0, nFixing: false, rootDepthM: 1.2, family: "poaceae", market: 3, labor: 2, waterClass: "low" }),
  sorghum: P({ id: "sorghum", name: { uz: "Oq jo'xori", en: "Sorghum" }, icon: "🌿", color: "#A1887F", kc: [0.3, 1.05, 0.55], stages: [20, 30, 40, 20], tbase: 10, gddRequired: 1600, frostKillC: 0, heatSensitive: false, eceThreshold: 6.8, eceSlope: 16, nFixing: false, rootDepthM: 1.5, family: "poaceae", market: 3, labor: 2, waterClass: "low" }),
  sunflower: P({ id: "sunflower", name: { uz: "Kungaboqar", en: "Sunflower" }, icon: "🌻", color: "#FDD835", kc: [0.35, 1.0, 0.35], stages: [20, 30, 35, 20], tbase: 7, gddRequired: 1400, frostKillC: -1, heatSensitive: true, eceThreshold: 4.8, eceSlope: 5.0, nFixing: false, rootDepthM: 1.5, family: "asteraceae", market: 3, labor: 2, waterClass: "medium" }),
  sugar_beet: P({ id: "sugar_beet", name: { uz: "Qand lavlagi", en: "Sugar beet" }, icon: "🟣", color: "#AD1457", kc: [0.35, 1.2, 0.7], stages: [30, 45, 70, 45], tbase: 3, gddRequired: 2400, frostKillC: -3, heatSensitive: false, eceThreshold: 7.0, eceSlope: 5.9, nFixing: false, rootDepthM: 1.0, family: "amaranthaceae", market: 3, labor: 4, waterClass: "high" }),
  safflower: P({ id: "safflower", name: { uz: "Maxsar", en: "Safflower" }, icon: "🌼", color: "#FFB74D", kc: [0.35, 1.0, 0.25], stages: [20, 35, 45, 25], tbase: 5, gddRequired: 1500, frostKillC: -6, heatSensitive: false, eceThreshold: 7.0, eceSlope: 5.0, nFixing: false, rootDepthM: 1.8, family: "asteraceae", market: 2, labor: 2, waterClass: "low" }),
  quinoa: P({ id: "quinoa", name: { uz: "Kinoa", en: "Quinoa" }, icon: "🌾", color: "#D4A373", kc: [0.5, 1.0, 0.7], stages: [20, 35, 40, 25], tbase: 3, gddRequired: 1300, frostKillC: -4, heatSensitive: true, eceThreshold: 8.0, eceSlope: 4.0, nFixing: false, rootDepthM: 1.0, family: "amaranthaceae", market: 2, labor: 3, waterClass: "low" }),
  mung_bean: P({ id: "mung_bean", name: { uz: "Mosh", en: "Mung bean" }, icon: "🫘", color: "#7CB342", kc: [0.4, 1.05, 0.35], stages: [15, 25, 30, 15], tbase: 10, gddRequired: 1100, frostKillC: 0, heatSensitive: false, eceThreshold: 1.8, eceSlope: 20.7, nFixing: true, rootDepthM: 0.8, family: "fabaceae", market: 4, labor: 3, waterClass: "low" }),
  soybean: P({ id: "soybean", name: { uz: "Soya", en: "Soybean" }, icon: "🫘", color: "#9CCC65", kc: [0.4, 1.15, 0.5], stages: [20, 30, 40, 20], tbase: 10, gddRequired: 1700, frostKillC: -1, heatSensitive: true, eceThreshold: 5.0, eceSlope: 20, nFixing: true, rootDepthM: 1.0, family: "fabaceae", market: 3, labor: 3, waterClass: "medium" }),
  chickpea: P({ id: "chickpea", name: { uz: "No'xat", en: "Chickpea" }, icon: "🫘", color: "#C0CA33", kc: [0.4, 1.0, 0.35], stages: [20, 30, 40, 20], tbase: 5, gddRequired: 1200, frostKillC: -5, heatSensitive: true, eceThreshold: 1.5, eceSlope: 15, nFixing: true, rootDepthM: 1.0, family: "fabaceae", market: 3, labor: 2, waterClass: "low" }),
  alfalfa: P({ id: "alfalfa", name: { uz: "Beda", en: "Alfalfa" }, icon: "🍀", color: "#2E7D32", kc: [0.4, 0.95, 0.9], stages: [20, 30, 130, 30], tbase: 5, gddRequired: 1500, frostKillC: -15, heatSensitive: false, eceThreshold: 2.0, eceSlope: 7.3, nFixing: true, rootDepthM: 2.5, family: "fabaceae", market: 3, labor: 2, waterClass: "high" }),
  maize: P({ id: "maize", name: { uz: "Makkajo'xori", en: "Maize" }, icon: "🌽", color: "#FFB300", kc: [0.3, 1.2, 0.6], stages: [25, 35, 40, 25], tbase: 10, gddRequired: 1500, frostKillC: 0, heatSensitive: true, eceThreshold: 1.7, eceSlope: 12, nFixing: false, rootDepthM: 1.2, family: "poaceae", market: 3, labor: 3, waterClass: "medium" }),
  rice: P({ id: "rice", name: { uz: "Sholi", en: "Rice" }, icon: "🌾", color: "#4FC3F7", kc: [1.05, 1.2, 0.75], stages: [30, 30, 60, 30], tbase: 10, gddRequired: 2000, frostKillC: 2, heatSensitive: true, eceThreshold: 3.0, eceSlope: 12, nFixing: false, rootDepthM: 0.6, family: "poaceae", market: 4, labor: 5, waterClass: "high", extraMmDay: 5 }),
  potato: P({ id: "potato", name: { uz: "Kartoshka", en: "Potato" }, icon: "🥔", color: "#BCAAA4", kc: [0.5, 1.15, 0.75], stages: [25, 30, 45, 30], tbase: 7, gddRequired: 1500, frostKillC: -2, heatSensitive: true, eceThreshold: 1.7, eceSlope: 12, nFixing: false, rootDepthM: 0.5, family: "solanaceae", market: 4, labor: 4, waterClass: "medium" }),
  carrot: P({ id: "carrot", name: { uz: "Sabzi", en: "Carrot" }, icon: "🥕", color: "#FF7043", kc: [0.7, 1.05, 0.95], stages: [20, 30, 40, 20], tbase: 5, gddRequired: 1300, frostKillC: -4, heatSensitive: false, eceThreshold: 1.0, eceSlope: 14, nFixing: false, rootDepthM: 0.6, family: "apiaceae", market: 4, labor: 4, waterClass: "medium" }),
  tomato: P({ id: "tomato", name: { uz: "Pomidor", en: "Tomato" }, icon: "🍅", color: "#E53935", kc: [0.6, 1.15, 0.8], stages: [30, 40, 45, 30], tbase: 10, gddRequired: 1600, frostKillC: 0, heatSensitive: true, eceThreshold: 2.5, eceSlope: 9.9, nFixing: false, rootDepthM: 1.0, family: "solanaceae", market: 4, labor: 5, waterClass: "medium" }),
  melon: P({ id: "melon", name: { uz: "Qovun", en: "Melon" }, icon: "🍈", color: "#C5E1A5", kc: [0.5, 1.05, 0.75], stages: [25, 35, 40, 20], tbase: 12, gddRequired: 1400, frostKillC: 0, heatSensitive: false, eceThreshold: 1.0, eceSlope: 8.4, nFixing: false, rootDepthM: 1.0, family: "cucurbitaceae", market: 4, labor: 4, waterClass: "medium" }),
  fallow: P({ id: "fallow", name: { uz: "Bo'sh", en: "Fallow" }, icon: "∅", color: "#E0E0E0", kc: [0, 0, 0], stages: [1, 1, 1, 1], tbase: 0, gddRequired: 0, frostKillC: -99, heatSensitive: false, eceThreshold: 99, eceSlope: 0, nFixing: false, rootDepthM: 0, family: "none", market: 0, labor: 0, waterClass: "low" }),
  other: P({ id: "other", name: { uz: "Boshqa", en: "Other" }, icon: "🌱", color: "#90A4AE", kc: [0.4, 1.0, 0.6], stages: [25, 35, 40, 25], tbase: 8, gddRequired: 1500, frostKillC: -1, heatSensitive: false, eceThreshold: 3.0, eceSlope: 10, nFixing: false, rootDepthM: 1.0, family: "other", market: 3, labor: 3, waterClass: "medium" }),
};

export const SELECTABLE: CropId[] = [
  "cotton", "winter_wheat", "barley", "sorghum", "sunflower", "sugar_beet", "safflower", "quinoa",
  "mung_bean", "soybean", "chickpea", "alfalfa", "maize", "rice", "potato", "carrot", "tomato", "melon", "fallow",
];
export const DOUBLE_CROPS: CropId[] = ["mung_bean", "sorghum", "soybean", "sunflower", "maize"];

export const toleranceClass = (c: CropParams): Crop["saltTolerance"] =>
  c.eceThreshold >= 6 ? "tolerant" : c.eceThreshold >= 3 ? "moderate" : "sensitive";

export const cropList = (): Crop[] =>
  SELECTABLE.map((id) => {
    const c = CROPS[id];
    return { id, name: c.name, color: c.color, icon: c.icon, waterClass: c.waterClass, saltTolerance: toleranceClass(c), nFixing: c.nFixing };
  });

/** Season length (days) from FAO stage lengths. */
export const seasonDays = (id: CropId) => CROPS[id].stages.reduce((a, b) => a + b, 0);
