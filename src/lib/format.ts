import type { CropId } from "@/types/api";
import { CROPS } from "@/data/crops";
import type { Lang } from "@/i18n";

/** "6 800" - thin-space thousands for both languages (plan §9). */
export function num(n: number | undefined | null, digits = 0) {
  if (n == null || !Number.isFinite(n)) return "-";
  const s = Math.abs(n).toFixed(digits);
  const [i, d] = s.split(".");
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${n < 0 ? "−" : ""}${g}${d ? "." + d : ""}`;
}

const MON_UZ = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
const MON_UZ_SHORT = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"];
const MON_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON_EN_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const monthShort = (m: number, lang: Lang) => (lang === "uz" ? MON_UZ_SHORT : MON_EN_SHORT)[(m - 1 + 12) % 12];
export const monthLong = (m: number, lang: Lang) => (lang === "uz" ? MON_UZ : MON_EN)[(m - 1 + 12) % 12];

/** "03-28" → "28-mart" / "28 March". Also accepts "2025-03-28". */
export function dayMonth(md: string, lang: Lang) {
  const p = md.length > 5 ? md.slice(5) : md;
  const m = +p.slice(0, 2), d = +p.slice(3, 5);
  return lang === "uz" ? `${d}-${MON_UZ[m - 1]}` : `${d} ${MON_EN[m - 1]}`;
}
/** "2026-12" → "Dek 2026". */
export const yearMonth = (ym: string, lang: Lang) => `${monthShort(+ym.slice(5, 7), lang)} ${ym.slice(0, 4)}`;

export const cropName = (c: CropId, lang: Lang) => CROPS[c]?.name[lang] ?? c;
/** @deprecated crops are shown by colour (CropDot); kept for plain-text contexts */
export const cropIcon = (c: CropId) => CROPS[c]?.icon ?? "";
export const cropColor = (c: CropId) => CROPS[c]?.color ?? "#90A4AE";
