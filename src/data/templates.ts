import type { CropId } from "@/types/api";

/** One crop in one plan year. `prev` = sown in autumn of the previous year (winter cereals). */
export type SeasonSpec = { crop: CropId; start: string; end: string; prev?: boolean };
export type YearSpec = SeasonSpec[];

/** Standard Uzbek field calendar (planting windows used by the templates). */
export const CAL: Record<string, SeasonSpec> = {
  wheat: { crop: "winter_wheat", start: "10-05", end: "06-15", prev: true },
  barley: { crop: "barley", start: "10-05", end: "06-01", prev: true },
  cotton: { crop: "cotton", start: "04-15", end: "10-15" },
  alfalfa: { crop: "alfalfa", start: "03-25", end: "10-20" },
  maize: { crop: "maize", start: "04-25", end: "09-15" },
  rice: { crop: "rice", start: "05-10", end: "09-30" },
  sugar_beet: { crop: "sugar_beet", start: "03-25", end: "10-10" },
  chickpea: { crop: "chickpea", start: "03-01", end: "06-25" },
  sunflower_main: { crop: "sunflower", start: "04-10", end: "08-20" },
  safflower: { crop: "safflower", start: "03-10", end: "07-20" },
  quinoa: { crop: "quinoa", start: "03-15", end: "07-15" },
  // double crops after the cereal harvest
  mung: { crop: "mung_bean", start: "06-22", end: "09-25" },
  sorghum: { crop: "sorghum", start: "06-22", end: "10-10" },
  soy: { crop: "soybean", start: "06-22", end: "10-10" },
  sunflower: { crop: "sunflower", start: "06-22", end: "10-05" },
  maize2: { crop: "maize", start: "06-22", end: "10-05" },
};

export type Template = {
  id: string;
  name: { uz: string; en: string };
  tag?: "salt" | "water" | "rice" | "rainfed" | "soil" | "income";
  years: [YearSpec, YearSpec, YearSpec];
};

const c = CAL;

/** Uzbekistan-specific rotation templates (PRO_REJA §7.4). */
export const TEMPLATES: Template[] = [
  { id: "wheat_sorghum", name: { uz: "Bug'doy + oq jo'xori → Bug'doy + mosh → Paxta", en: "Wheat + sorghum → Wheat + mung bean → Cotton" }, tag: "salt", years: [[c.wheat, c.sorghum], [c.wheat, c.mung], [c.cotton]] },
  { id: "cotton_wheat_mung", name: { uz: "Paxta → Bug'doy + mosh → Paxta", en: "Cotton → Wheat + mung bean → Cotton" }, tag: "soil", years: [[c.cotton], [c.wheat, c.mung], [c.cotton]] },
  { id: "wheat_alfalfa", name: { uz: "Bug'doy → Beda (2 yil)", en: "Wheat → Alfalfa (2 years)" }, tag: "soil", years: [[c.wheat], [c.alfalfa], [c.alfalfa]] },
  { id: "barley_sorghum", name: { uz: "Sho'r yer: Arpa + oq jo'xori → Arpa + oq jo'xori → Paxta", en: "Saline land: Barley + sorghum ×2 → Cotton" }, tag: "salt", years: [[c.barley, c.sorghum], [c.barley, c.sorghum], [c.cotton]] },
  { id: "wheat_sunflower", name: { uz: "Suv tanqisligi: Bug'doy + kungaboqar → Bug'doy → Paxta", en: "Water-short: Wheat + sunflower → Wheat → Cotton" }, tag: "water", years: [[c.wheat, c.sunflower], [c.wheat], [c.cotton]] },
  { id: "maize_not_rice", name: { uz: "Sholi o'rniga: Makkajo'xori → Bug'doy + mosh → Makkajo'xori", en: "Instead of rice: Maize → Wheat + mung bean → Maize" }, tag: "rice", years: [[c.maize], [c.wheat, c.mung], [c.maize]] },
  { id: "wheat_soy", name: { uz: "Bug'doy + soya → Paxta → Bug'doy + soya", en: "Wheat + soybean → Cotton → Wheat + soybean" }, tag: "soil", years: [[c.wheat, c.soy], [c.cotton], [c.wheat, c.soy]] },
  { id: "beet_wheat_mung", name: { uz: "Qand lavlagi → Bug'doy + mosh → Paxta", en: "Sugar beet → Wheat + mung bean → Cotton" }, tag: "income", years: [[c.sugar_beet], [c.wheat, c.mung], [c.cotton]] },
  { id: "rainfed_chickpea", name: { uz: "Lalmi: Bug'doy → No'xat → Bug'doy", en: "Rainfed: Wheat → Chickpea → Wheat" }, tag: "rainfed", years: [[c.wheat], [c.chickpea], [c.wheat]] },
  { id: "barley_mung", name: { uz: "Arpa + mosh → Paxta → Arpa + mosh", en: "Barley + mung bean → Cotton → Barley + mung bean" }, tag: "water", years: [[c.barley, c.mung], [c.cotton], [c.barley, c.mung]] },
  { id: "safflower_wheat", name: { uz: "Qurg'oqchil: Maxsar → Bug'doy → Arpa", en: "Dry: Safflower → Wheat → Barley" }, tag: "water", years: [[c.safflower], [c.wheat], [c.barley]] },
  { id: "wheat_maize_silage", name: { uz: "Yem-xashak: Bug'doy + silos makkajo'xori → Beda", en: "Forage: Wheat + silage maize → Alfalfa" }, tag: "income", years: [[c.wheat, c.maize2], [c.alfalfa], [c.alfalfa]] },
];

/** Builds a forward plan from what the farmer grew (last 3 years repeated). */
export function currentFromHistory(hist: { crop: CropId; second?: CropId | null }[]): Template {
  const spec = (cid: CropId): SeasonSpec => {
    const hit = Object.values(CAL).find((s) => s.crop === cid && !["06-22"].includes(s.start));
    return hit ?? { crop: cid, start: "04-15", end: "09-30" };
  };
  const second = (cid: CropId): SeasonSpec => Object.values(CAL).find((s) => s.crop === cid && s.start === "06-22") ?? { crop: cid, start: "06-22", end: "10-05" };
  const yrs = hist.slice(-3).map((h) => {
    if (h.crop === "fallow") return [] as YearSpec;
    const y: YearSpec = [spec(h.crop)];
    if (h.second && h.second !== "fallow") y.push(second(h.second));
    return y;
  });
  while (yrs.length < 3) yrs.unshift([CAL.cotton]);
  const name = hist
    .slice(-3)
    .map((h) => (h.second && h.second !== "fallow" ? `${h.crop}+${h.second}` : h.crop))
    .join(" → ");
  return { id: "current", name: { uz: name, en: name }, years: [yrs[0], yrs[1], yrs[2]] };
}
