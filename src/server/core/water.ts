import type { WaterData } from "@/types/api";
import { CROPS } from "@/data/crops";
import type { SeasonSpec, YearSpec } from "@/data/templates";
import { EFFICIENCY } from "@/lib/scoring";
import type { Wx } from "./climate";
import { toDoy } from "./climate";
import { mean, quantile, round } from "./stats";

/** FAO-56 Kc curve: flat ini → linear dev → flat mid → linear late, scaled to the actual season length. */
export function kcAt(spec: SeasonSpec, dayInSeason: number, seasonLen: number) {
  const c = CROPS[spec.crop];
  if (spec.crop === "fallow") return 0;
  const total = c.stages.reduce((a, b) => a + b, 0);
  const k = seasonLen / total;
  const [a, b, m] = [c.stages[0] * k, (c.stages[0] + c.stages[1]) * k, (c.stages[0] + c.stages[1] + c.stages[2]) * k];
  const [ki, km, ke] = c.kc;
  if (dayInSeason <= a) return ki;
  if (dayInSeason <= b) return ki + ((km - ki) * (dayInSeason - a)) / (b - a);
  if (dayInSeason <= m) return km;
  return km + ((ke - km) * (dayInSeason - m)) / Math.max(1, seasonLen - m);
}

/** USDA-SCS effective rainfall on a monthly total (mm). */
export const peffMonthly = (p: number) => (p <= 0 ? 0 : p < 250 ? (p * (125 - 0.2 * p)) / 125 : 125 + 0.1 * p);

type Monthly = { etc: number[]; peff: number[]; irr: number[] }; // index 0..11

/** Crop water need of one plan-year (its seasons) under the weather of historical year y. */
export function yearNeed(w: Wx, et0: number[], idxByDate: Map<string, number>, year: YearSpec, y: number): Monthly {
  const etc = new Array(12).fill(0), pIn = new Array(12).fill(0);
  for (const s of year) {
    if (s.crop === "fallow") continue;
    const sy = s.prev ? y - 1 : y;
    const start = Date.UTC(sy, +s.start.slice(0, 2) - 1, +s.start.slice(3, 5));
    const end = Date.UTC(y, +s.end.slice(0, 2) - 1, +s.end.slice(3, 5));
    const len = Math.round((end - start) / 864e5) + 1;
    for (let d = 0; d < len; d++) {
      const t = new Date(start + d * 864e5);
      const key = t.toISOString().slice(0, 10);
      const i = idxByDate.get(key);
      if (i == null) continue;
      const m = t.getUTCMonth();
      etc[m] += kcAt(s, d, len) * et0[i] + (CROPS[s.crop].extraMmDay ?? 0);
      pIn[m] += w.precip[i];
    }
  }
  const peff = pIn.map(peffMonthly).map((v, m) => Math.min(v, etc[m]));
  const irr = etc.map((v, m) => Math.max(0, v - peff[m]));
  // FAO-56 initial soil water: spring-sown crops start on a profile refilled by winter rain
  // (≈ 80 mm usable), which covers the first irrigation(s).
  const reserve = new Array(12).fill(0);
  for (const s of year) if (!s.prev && s.crop !== "fallow" && +s.start.slice(0, 2) >= 2 && +s.start.slice(0, 2) <= 5) reserve[+s.start.slice(0, 2) - 1] += 80;
  let r = 0;
  for (let m = 0; m < 12; m++) {
    r += reserve[m];
    const take = Math.min(r, irr[m]);
    irr[m] -= take;
    r -= take;
  }
  return { etc, peff, irr };
}

/** Leaching requirement (FAO-29 Eq. 7): LR = ECw / (5·ECe_t − ECw), strictest crop of the plan. */
export function leaching(years: YearSpec[], ecw: number) {
  const thr = Math.min(...years.flat().filter((s) => s.crop !== "fallow").map((s) => CROPS[s.crop].eceThreshold), 99);
  return Math.min(0.3, Math.max(0, ecw / Math.max(0.5, 5 * thr - ecw)));
}

/** ET ensemble (OpenET idea): mean of NASA POWER FAO-56 and ERA5 FAO-56 ET0; range from both + interannual spread. */
export function waterForPlan(w: Wx, et0: number[], years: YearSpec[], ecw: number, rainfed = false, alt?: number[][]) {
  const main = waterOne(w, et0, years, ecw, rainfed);
  if (!alt?.length) return main;
  const others = alt.map((a) => waterOne(w, a, years, ecw, rainfed));
  return {
    ...main,
    lowM3PerHa: Math.min(main.lowM3PerHa, ...others.map((o) => o.grossM3PerHa)),
    highM3PerHa: Math.max(main.highM3PerHa, ...others.map((o) => o.grossM3PerHa)),
  };
}

function waterOne(w: Wx, et0: number[], years: YearSpec[], ecw: number, rainfed = false) {
  const idxByDate = new Map<string, number>();
  w.dates.forEach((d, i) => idxByDate.set(d, i));
  const histYears = [...new Set(w.year)].filter((y) => y > w.year[0] && w.year.filter((v) => v === y).length > 330);
  const LR = leaching(years, ecw);
  const perHist: number[] = [];
  const acc: Monthly = { etc: new Array(12).fill(0), peff: new Array(12).fill(0), irr: new Array(12).fill(0) };
  let n = 0;
  for (const y of histYears) {
    let tot = 0;
    for (const ys of years) {
      const r = yearNeed(w, et0, idxByDate, ys, y);
      tot += r.irr.reduce((a, b) => a + b, 0);
      for (let m = 0; m < 12; m++) {
        acc.etc[m] += r.etc[m];
        acc.peff[m] += r.peff[m];
        acc.irr[m] += r.irr[m];
      }
      n++;
    }
    perHist.push(tot / years.length);
  }
  const factor = rainfed ? 0 : 1 / (1 - LR);
  const net = mean(perHist) * factor;
  const monthly = acc.etc.map((_, m) => ({
    month: m + 1,
    etcMm: round(acc.etc[m] / n, 0),
    peffMm: round(acc.peff[m] / n, 0),
    irrigationMm: round((acc.irr[m] / n) * factor, 0),
  }));
  const eff = EFFICIENCY.furrow;
  const g = (mm: number) => Math.round((mm * 10) / eff / 100) * 100;
  return {
    netMm: round(net, 0),
    grossM3PerHa: g(net),
    lowM3PerHa: g(quantile(perHist, 0.1) * factor),
    highM3PerHa: g(quantile(perHist, 0.9) * factor),
    monthly,
    schedule: monthly
      .filter((m) => m.irrigationMm > 15)
      .map((m) => ({ month: m.month, times: Math.max(1, Math.round(m.irrigationMm / 75)), m3PerHa: g(m.irrigationMm) })),
    LR,
  };
}

export function et0DailyClim(clim: number[]): WaterData["et0Daily"] {
  return clim.slice(1, 366).map((mm, i) => ({ doy: i + 1, mm: round(mm, 2) }));
}

export { toDoy };
