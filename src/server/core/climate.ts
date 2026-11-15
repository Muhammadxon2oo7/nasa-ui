import type { ClimateData, CropId } from "@/types/api";
import { CROPS, DOUBLE_CROPS } from "@/data/crops";
import type { PowerDaily } from "../sources";
import { mean, median, quantile, round, spiTransform, sum, theilSen } from "./stats";

/** Weather series after an optional what-if shift (ΔT °C, ΔP %). */
export type Wx = PowerDaily & { doy: number[]; year: number[]; month: number[] };

export function prepWx(p: PowerDaily, dT = 0, dPpct = 0): Wx {
  const year: number[] = [], month: number[] = [], doy: number[] = [];
  for (const d of p.dates) {
    const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
    year.push(+d.slice(0, 4));
    month.push(+d.slice(5, 7));
    doy.push(Math.floor((t - Date.UTC(+d.slice(0, 4), 0, 1)) / 864e5) + 1);
  }
  return {
    ...p,
    tmax: dT ? p.tmax.map((v) => v + dT) : p.tmax,
    tmin: dT ? p.tmin.map((v) => v + dT) : p.tmin,
    precip: dPpct ? p.precip.map((v) => v * (1 + dPpct / 100)) : p.precip,
    year,
    month,
    doy,
  };
}

/**
 * FAO-56 Penman-Monteith reference ET0 (mm/day), daily, Eq. 6 with
 * Rn from POWER all-sky shortwave (Rs), Rso = (0.75 + 2e-5 z) Ra, albedo 0.23, Eq. 39 Rnl.
 */
export function et0Fao56(w: Wx, latDeg: number): number[] {
  const z = w.elevation || 0;
  const P = 101.3 * Math.pow((293 - 0.0065 * z) / 293, 5.26);
  const gamma = 0.000665 * P;
  const phi = (latDeg * Math.PI) / 180;
  const out: number[] = [];
  for (let i = 0; i < w.dates.length; i++) {
    const tx = w.tmax[i], tn = w.tmin[i];
    const t = (tx + tn) / 2;
    const es = (e0(tx) + e0(tn)) / 2;
    const ea = (es * Math.min(100, Math.max(1, w.rh[i]))) / 100;
    const delta = (4098 * e0(t)) / Math.pow(t + 237.3, 2);
    const J = w.doy[i];
    const dr = 1 + 0.033 * Math.cos(((2 * Math.PI) / 365) * J);
    const dec = 0.409 * Math.sin(((2 * Math.PI) / 365) * J - 1.39);
    const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(dec))));
    const Ra = ((24 * 60) / Math.PI) * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.sin(ws));
    const Rs = Math.max(0, w.rs[i]);
    const Rso = (0.75 + 2e-5 * z) * Ra;
    const Rns = (1 - 0.23) * Rs;
    const sigma = 4.903e-9;
    const ratio = Rso > 0 ? Math.min(1, Rs / Rso) : 0.5;
    const Rnl = sigma * ((Math.pow(tx + 273.16, 4) + Math.pow(tn + 273.16, 4)) / 2) * (0.34 - 0.14 * Math.sqrt(Math.max(0, ea))) * (1.35 * ratio - 0.35);
    const Rn = Rns - Rnl;
    const u2 = Math.max(0.5, w.wind[i]);
    const et = (0.408 * delta * Rn + gamma * (900 / (t + 273)) * u2 * (es - ea)) / (delta + gamma * (1 + 0.34 * u2));
    out.push(Math.max(0, et));
  }
  return out;
}
const e0 = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3));

/** Mean daily ET0 by day of year (1..366), 20-year climatology. */
export function et0Climatology(w: Wx, et0: number[]) {
  const acc = new Array(367).fill(0), n = new Array(367).fill(0);
  for (let i = 0; i < et0.length; i++) {
    acc[w.doy[i]] += et0[i];
    n[w.doy[i]]++;
  }
  const out = acc.map((v, i) => (n[i] ? v / n[i] : 0));
  out[366] = out[365];
  return out;
}

const mmdd = (doy: number) => {
  const d = new Date(Date.UTC(2021, 0, doy));
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};
const toDoy = (md: string) => Math.floor((Date.UTC(2021, +md.slice(0, 2) - 1, +md.slice(3, 5)) - Date.UTC(2021, 0, 1)) / 864e5) + 1;

export type FrostStats = { lastSpring: number[]; firstAutumn: number[]; years: number[] };

export function frostDates(w: Wx): FrostStats {
  const years = [...new Set(w.year)].filter((y) => w.year.filter((v) => v === y).length > 330);
  const lastSpring: number[] = [], firstAutumn: number[] = [];
  for (const y of years) {
    let ls = NaN, fa = NaN;
    for (let i = 0; i < w.dates.length; i++) {
      if (w.year[i] !== y) continue;
      if (w.tmin[i] < 0 && w.doy[i] <= 181) ls = w.doy[i];
      if (w.tmin[i] < 0 && w.doy[i] > 181 && !Number.isFinite(fa)) fa = w.doy[i];
    }
    lastSpring.push(ls);
    firstAutumn.push(Number.isFinite(fa) ? fa : 365);
  }
  return { lastSpring, firstAutumn, years };
}

/** GDD between two DOYs of each year (base tb). */
export function gddWindow(w: Wx, from: number, to: number, tb: number, year?: number) {
  const per = new Map<number, number>();
  for (let i = 0; i < w.dates.length; i++) {
    if (year && w.year[i] !== year) continue;
    if (w.doy[i] < from || w.doy[i] > to) continue;
    per.set(w.year[i], (per.get(w.year[i]) ?? 0) + Math.max(0, (w.tmax[i] + w.tmin[i]) / 2 - tb));
  }
  return [...per.values()];
}

export function climate(w: Wx, et0: number[], lastFullYear: number): ClimateData & { _frost: FrostStats; _p90LastFrost: number } {
  const fr = frostDates(w);
  const ls = fr.lastSpring.filter(Number.isFinite);
  const fa = fr.firstAutumn;
  const latestIdx = fr.lastSpring.reduce((bi, v, i, a) => (Number.isFinite(v) && (!Number.isFinite(a[bi]) || v > a[bi]) ? i : bi), 0);
  const earliestIdx = fa.reduce((bi, v, i, a) => (v < a[bi] ? i : bi), 0);
  const medLs = Math.round(median(ls));
  const medFa = Math.round(median(fa));

  const years = [...new Set(w.year)].filter((y) => y <= lastFullYear);
  const heatDays40 = years.map((y) => ({ year: y, days: w.tmax.filter((v, i) => w.year[i] === y && v >= 40).length }));

  const monthly = Array.from({ length: 12 }, (_, m) => {
    const ym = years.map((y) => {
      const idx = w.dates.map((_, i) => i).filter((i) => w.year[i] === y && w.month[i] === m + 1);
      return { tx: mean(idx.map((i) => w.tmax[i])), tn: mean(idx.map((i) => w.tmin[i])), p: sum(idx.map((i) => w.precip[i])), e: sum(idx.map((i) => et0[i])) };
    });
    return {
      month: m + 1,
      tmaxAvg: round(mean(ym.map((v) => v.tx)), 1),
      tminAvg: round(mean(ym.map((v) => v.tn)), 1),
      tmaxP10: round(quantile(ym.map((v) => v.tx), 0.1), 1),
      tmaxP90: round(quantile(ym.map((v) => v.tx), 0.9), 1),
      precipMm: round(mean(ym.map((v) => v.p)), 1),
      et0Mm: round(mean(ym.map((v) => v.e)), 1),
    };
  });
  const lastYearMonthly = Array.from({ length: 12 }, (_, m) => {
    const idx = w.dates.map((_, i) => i).filter((i) => w.year[i] === lastFullYear && w.month[i] === m + 1);
    return { month: m + 1, tmax: round(mean(idx.map((i) => w.tmax[i])), 1), tmin: round(mean(idx.map((i) => w.tmin[i])), 1), precipMm: round(sum(idx.map((i) => w.precip[i])), 1) };
  });

  const annualP = years.map((y) => sum(w.precip.filter((_, i) => w.year[i] === y)));
  const slope = theilSen(years, annualP);
  const precipTrendPct = round(((slope * (years.length - 1)) / Math.max(1, mean(annualP))) * 100, 0);

  // heat left after the wheat harvest (Jun 20 → first autumn frost), median year
  const after = years.map((y, k) => gddWindow(w, toDoy("06-20"), fa[fr.years.indexOf(y)] ?? fa[k] ?? 300, 10, y)[0] ?? 0);
  const gddAfterWheat = Math.round(median(after));
  const cropGddFit = DOUBLE_CROPS.map((c: CropId) => {
    const cp = CROPS[c];
    const g = Math.round(median(years.map((y) => gddWindow(w, toDoy("06-22"), fa[fr.years.indexOf(y)] ?? 300, cp.tbase, y)[0] ?? 0)));
    return { crop: c, required: cp.gddRequired, fits: g >= cp.gddRequired };
  });
  const cottonG = Math.round(median(years.map((y) => gddWindow(w, toDoy("06-22"), fa[fr.years.indexOf(y)] ?? 300, 10, y)[0] ?? 0)));
  cropGddFit.push({ crop: "cotton", required: CROPS.cotton.gddRequired, fits: cottonG >= CROPS.cotton.gddRequired });

  // probability of a frost on or after a date (Mar 1 → May 31, 5-day steps)
  const frostProbability: { date: string; pct: number }[] = [];
  for (let d = toDoy("03-01"); d <= toDoy("05-31"); d += 5) {
    const n = fr.lastSpring.filter((v) => Number.isFinite(v) && v >= d).length;
    frostProbability.push({ date: mmdd(d), pct: Math.round((n / Math.max(1, fr.years.length)) * 100) });
  }

  // SPI-3 by month (gamma per calendar month)
  const monthsKeys: string[] = [], mP: number[] = [];
  const ymSet = new Map<string, number>();
  w.dates.forEach((d, i) => ymSet.set(d.slice(0, 7), (ymSet.get(d.slice(0, 7)) ?? 0) + w.precip[i]));
  for (const [k, v] of ymSet) {
    monthsKeys.push(k);
    mP.push(v);
  }
  const roll = mP.map((_, i) => (i >= 2 ? mP[i] + mP[i - 1] + mP[i - 2] : NaN));
  const spi3: { date: string; value: number }[] = [];
  const byCal: number[][] = Array.from({ length: 12 }, () => []);
  roll.forEach((v, i) => Number.isFinite(v) && byCal[+monthsKeys[i].slice(5, 7) - 1].push(v));
  const tf = byCal.map((s) => spiTransform(s));
  roll.forEach((v, i) => {
    if (!Number.isFinite(v)) return;
    spi3.push({ date: monthsKeys[i], value: round(tf[+monthsKeys[i].slice(5, 7) - 1](v), 2) });
  });

  return {
    lastSpringFrost: { median: mmdd(medLs), latest: mmdd(fr.lastSpring[latestIdx]), latestYear: fr.years[latestIdx] },
    firstAutumnFrost: { median: mmdd(medFa), earliest: mmdd(fa[earliestIdx]), earliestYear: fr.years[earliestIdx] },
    frostFreeDays: Math.round(median(fr.years.map((_, i) => fa[i] - (fr.lastSpring[i] || 60)))),
    heatDays40,
    monthly,
    lastYearMonthly,
    precipTrendPct,
    gddAfterWheat,
    cropGddFit,
    frostProbability,
    spi3,
    _frost: fr,
    _p90LastFrost: Math.round(quantile(ls, 0.9)),
  };
}

export { mmdd, toDoy };
