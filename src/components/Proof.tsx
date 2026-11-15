"use client";

import { CloudRain, Droplets, Flame, Leaf, Mountain, Satellite, ScanLine, Thermometer, Waves } from "lucide-react";
import { useT } from "@/i18n";

type Lx = { uz: string; en: string };

/**
 * The three numbers that prove the method, shown first. Source: backend validation
 * (FRONTEND_UCHUN_API.md: backtest A6 on the cotton pilot field, OpenET check N4).
 */
const PROOF: { value: string; text: Lx; source: Lx }[] = [
  {
    value: "1 / 9",
    text: { uz: "eng qurg'oqchil 3 yilda (2014, 2021, 2023) tavsiya etilgan rotatsiya 9 ta variantdan 1-o'rinda", en: "in the 3 driest years (2014, 2021, 2023) the recommended rotation ranked 1st of 9 options" },
    source: { uz: "Backtest · paxta pilot dalasi · NASA POWER", en: "Backtest · cotton pilot field · NASA POWER" },
  },
  {
    value: "3 500-4 400 m³/ga",
    text: { uz: "o'sha yillarda hozirgi rotatsiyaga nisbatan har gektarda tejalgan suv", en: "water saved per hectare in those years versus the current rotation" },
    source: { uz: "Backtest · FAO-56", en: "Backtest · FAO-56" },
  },
  {
    value: "r = 0.96",
    text: { uz: "suv sarfi usulimiz AQShda mustaqil OpenET bahosi bilan solishtirilganda", en: "our water-use method against the independent OpenET estimate in the US" },
    source: { uz: "OpenET · Kaliforniya va Arizona dalalari", en: "OpenET · California and Arizona fields" },
  },
];

/** Every NASA dataset the platform uses, by name, with what it feeds. */
export const NASA_DATASETS: { name: string; icon: typeof Satellite; use: Lx; res: string }[] = [
  { name: "NASA POWER", icon: Thermometer, use: { uz: "20 yillik kunlik iqlim: suv ehtiyoji (ET0), sovuq, jazirama", en: "20 years of daily climate: water need (ET0), frost, heat" }, res: "0.5° · 1981-" },
  { name: "SMAP L4", icon: Droplets, use: { uz: "Tuproq namligi va harorati: qurg'oqchilik, ekish vaqti", en: "Soil moisture and temperature: drought, sowing dates" }, res: "9 km · 2015-" },
  { name: "GPM IMERG", icon: CloudRain, use: { uz: "Kuchli yog'in kunlari va eroziya xavfi", en: "Heavy-rain days and erosion risk" }, res: "0.1° · 2000-" },
  { name: "Landsat 8/9", icon: Satellite, use: { uz: "2013-2017 dala tarixi, yozgi yuza harorati (suv stressi zonalari)", en: "Field history 2013-2017, summer surface temperature (water-stress zones)" }, res: "30 m · 2013-" },
  { name: "HLS (Landsat + Sentinel-2)", icon: ScanLine, use: { uz: "Dalaning 30 metrli suratlari, oyma-oy eng toza kun", en: "30 m images of the field, clearest day of each month" }, res: "30 m · 2-3 d" },
  { name: "MODIS", icon: Leaf, use: { uz: "Yaylov ko'kligi (NDVI), sig'im (NPP), qor, bug'lanish", en: "Pasture greenness (NDVI), capacity (NPP), snow, evapotranspiration" }, res: "250-500 m · 2000-" },
  { name: "GRACE / GRACE-FO", icon: Waves, use: { uz: "Hududning yer osti va yer usti suv zaxirasi trendi", en: "Regional ground and surface water storage trend" }, res: "~300 km · 2002-" },
  { name: "SRTM", icon: Mountain, use: { uz: "Balandlik va qiyalik: eroziya, suv oqimi", en: "Elevation and slope: erosion, run-off" }, res: "30 m" },
  { name: "ECOSTRESS", icon: Flame, use: { uz: "Haqiqiy suv sarfini mustaqil tekshirish (issiqlik surati)", en: "Independent check of real water use (thermal imagery)" }, res: "70 m · 2018-" },
];

/** Three proof numbers in one quiet row, right under the headline. */
export function ProofStrip({ className = "" }: { className?: string }) {
  const { lang } = useT();
  const L = (x: Lx) => (lang === "en" ? x.en : x.uz);
  return (
    <dl className={`grid gap-3 sm:grid-cols-3 ${className}`}>
      {PROOF.map((p) => (
        <div key={p.value} className="rounded-2xl bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-card)]">
          <dt className="text-[22px] leading-tight font-semibold tracking-[-0.02em] text-[var(--accent)] tnum whitespace-nowrap">{p.value}</dt>
          <dd className="mt-1 text-[13.5px] leading-snug text-[var(--fg-2)]">{L(p.text)}</dd>
          <dd className="mt-1.5 text-[11.5px] text-[var(--fg-3)]">{L(p.source)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The nine NASA datasets, each named with what it is used for. */
export function NasaDatasets() {
  const { lang } = useT();
  return (
    <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {NASA_DATASETS.map((d) => (
        <li key={d.name} className="flex gap-3 rounded-2xl bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-card)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><d.icon size={18} strokeWidth={1.8} /></span>
          <span className="min-w-0">
            <b className="block text-[15px]">{d.name}</b>
            <span className="block text-[13.5px] leading-snug text-[var(--fg-2)]">{lang === "en" ? d.use.en : d.use.uz}</span>
            <span className="mt-0.5 block text-[11.5px] text-[var(--fg-3)] tnum">{d.res}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
