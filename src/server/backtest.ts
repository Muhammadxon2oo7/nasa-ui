import "server-only";
import type { BacktestResult } from "@/types/api";
import { initialWeights, scoreStrategy } from "@/lib/scoring";
import { compute, loadInputs, type Inputs } from "./analyze";
import { et0Fao56, prepWx } from "./core/climate";
import { clamp, mean, round } from "./core/stats";
import { waterForPlan } from "./core/water";

/**
 * A6 backtest (QOSHIMCHA_FUNKSIYALAR §3, A6): the system only sees data up to the cutoff (no leakage),
 * recommends strategies, then every plan is re-scored with the REAL weather of the next year
 * (water need under that year's ET0 and rain, the same limit rule). Results are shown as they come out.
 */
export function backtestOne(name: string, fieldId: string, inp: Inputs, evalYear: number, lang: "uz" | "en"): BacktestResult {
  const L = (uz: string, en: string) => (lang === "uz" ? uz : en);
  const cutoff = `${evalYear - 1}-10-01`;
  const cutPower = <T extends { dates: string[] }>(p: T, to: string, from = "0000") => {
    const idx = p.dates.map((d, i) => (d < to && d >= from ? i : -1)).filter((i) => i >= 0);
    const out: Record<string, unknown> = { ...p };
    for (const [k, v] of Object.entries(p)) if (Array.isArray(v) && v.length === p.dates.length) out[k] = idx.map((i) => v[i]);
    return out as T;
  };
  const past: Inputs = {
    ...inp,
    req: { ...inp.req, rotation: inp.req.rotation.map((r) => ({ ...r, crop: null })), lang },
    power: cutPower(inp.power, cutoff),
    era5: inp.era5 ? cutPower(inp.era5, cutoff) : null,
    s2: inp.s2.filter((m) => m.month < cutoff.slice(0, 7)),
    seas5: null,
    livestock: undefined,
    soilTemp: null,
    forecast16: null,
    modisEt: null,
    degraded: [],
  };
  const pred = compute(fieldId, past, 0, 0);
  const strategies = pred.res.strategies;
  const weights = initialWeights(inp.req.priorities);

  // the real weather of the evaluation year (with the year before, so Oct-Dec sowings are covered)
  const real = cutPower(inp.power, `${evalYear + 1}-01-01`, `${evalYear - 1}-01-01`);
  const wR = prepWx(real);
  let et0R = et0Fao56(wR, inp.lat);
  if (inp.era5) {
    const m = new Map(inp.era5.dates.map((d, i) => [d, inp.era5!.et0[i]]));
    et0R = et0R.map((v, i) => {
      const e = m.get(wR.dates[i]);
      return e != null && Number.isFinite(e) ? (v + e) / 2 : v;
    });
  }
  const limit = inp.req.water.limitM3PerHa ?? pred.chosen[0]?.limit ?? 11000;
  const penalty = (g: number) => (g > limit ? Math.min(30, ((g - limit) / limit) * 60) : 0);
  const rows = strategies.map((s, i) => {
    const e = pred.chosen[i];
    const realized = waterForPlan(wR, et0R, e.years, inp.req.soil?.ecwDsM ?? 1.2, e.t.tag === "rainfed").grossM3PerHa;
    const metrics = { ...s.metrics };
    metrics.water = round(clamp(100 * (1 - realized / (pred.maxGross * 1.15))));
    if (metrics.climateRisk != null) metrics.climateRisk = round(clamp(metrics.climateRisk + penalty(s.waterM3PerHa) - penalty(realized)));
    return { s, realized, realScore: scoreStrategy(metrics, weights) };
  });
  const rank = (vals: number[]) => vals.map((v) => 1 + vals.filter((x) => x > v).length);
  const pr = rank(rows.map((r) => r.s.score));
  const rr = rank(rows.map((r) => r.realScore));
  const n = rows.length;
  const spearman = n >= 3 ? round(1 - (6 * pr.reduce((a, p, i) => a + (p - rr[i]) ** 2, 0)) / (n * (n * n - 1)), 2) : null;
  const best = rows.slice(1).reduce((a, b) => (b.s.score > a.s.score ? b : a), rows[1] ?? rows[0]);
  const bestIdx = rows.indexOf(best);
  const recommendedHeld = rr[bestIdx] <= 2;

  // weather of the evaluation year vs the pre-cutoff normal
  const wPast = prepWx(past.power);
  const hydro = (w: typeof wPast, y: number) => w.precip.reduce((a, p, i) => a + ((w.year[i] === y - 1 && w.month[i] >= 10) || (w.year[i] === y && w.month[i] <= 9) ? p : 0), 0);
  const pastYears = [...new Set(wPast.year)].filter((y) => y > wPast.year[0] && y < evalYear - 1);
  const pNorm = mean(pastYears.map((y) => hydro(wPast, y)));
  const et0Past = et0Fao56(wPast, inp.lat);
  const summer = (w: typeof wPast, e: number[], y: number) => e.reduce((a, v, i) => a + (w.year[i] === y && w.month[i] >= 4 && w.month[i] <= 9 ? v : 0), 0);
  const eNorm = mean(pastYears.map((y) => summer(wPast, et0Past, y)));
  const heat = (w: typeof wPast, y: number) => w.tmax.filter((t, i) => w.year[i] === y && t >= 40).length;
  const weather = {
    precipPct: round((hydro(wR, evalYear) / pNorm - 1) * 100, 0),
    et0Pct: round((summer(wR, et0R, evalYear) / eNorm - 1) * 100, 0),
    heatDays: heat(wR, evalYear),
    normalHeatDays: round(mean(pastYears.map((y) => heat(wPast, y))), 0),
  };
  const cur = rows[0];
  const over = (r: (typeof rows)[number]) => r.realized > limit;
  const fmt = (v: number) => v.toLocaleString(lang === "uz" ? "ru-RU" : "en-US");
  const summary = [
    L(`${evalYear - 1} kuzidagi tavsiya → ${evalYear} haqiqiy ob-havosi (yog'in ${weather.precipPct > 0 ? "+" : ""}${weather.precipPct}%, ET0 ${weather.et0Pct > 0 ? "+" : ""}${weather.et0Pct}%).`, `Advice of autumn ${evalYear - 1} → real ${evalYear} weather (rain ${weather.precipPct > 0 ? "+" : ""}${weather.precipPct}%, ET0 ${weather.et0Pct > 0 ? "+" : ""}${weather.et0Pct}%).`),
    over(cur)
      ? L(`Hozirgi rotatsiya suv limitidan ${round(((cur.realized - limit) / limit) * 100, 0)}% oshdi ❌.`, `The current rotation went ${round(((cur.realized - limit) / limit) * 100, 0)}% over the water limit ❌.`)
      : L(`Hozirgi rotatsiya limit ichida qoldi (${fmt(cur.realized)} m³/ga).`, `The current rotation stayed within the limit (${fmt(cur.realized)} m³/ha).`),
    L(`Tavsiya qilingan ${best.s.id} strategiya: ${over(best) ? "limitdan oshdi ❌" : "limit ichida ✅"}, haqiqiy reytingda ${rr[bestIdx]}-o'rin.`, `Recommended plan ${best.s.id}: ${over(best) ? "over the limit ❌" : "within the limit ✅"}, rank ${rr[bestIdx]} under the real weather.`),
  ].join(" ");
  return {
    fieldId,
    name,
    cutoff,
    evalYear,
    weather,
    rows: rows.map((r, i) => ({ strategyId: r.s.id, name: r.s.name, isCurrent: r.s.isCurrent, predictedRank: pr[i], realizedRank: rr[i], predictedWater: r.s.waterM3PerHa, realizedWater: r.realized, overLimit: over(r), robustness: r.s.robustness?.score })),
    spearman,
    recommendedHeld,
    summary,
  };
}

const PILOTS: [string, { uz: string; en: string }][] = [
  ["sirdaryo", { uz: "Sirdaryo", en: "Sirdaryo" }],
  ["xorazm", { uz: "Xorazm", en: "Khorezm" }],
  ["fargona", { uz: "Farg'ona", en: "Fergana" }],
  ["jizzax", { uz: "Jizzax", en: "Jizzakh" }],
];
const memo = new Map<string, BacktestResult[]>();

export async function backtestAll(lang: "uz" | "en", years = [2018, 2021, 2023]) {
  const key = lang + years.join();
  if (memo.has(key)) return memo.get(key)!;
  const out: BacktestResult[] = [];
  for (const [id, nm] of PILOTS) {
    const inp = await loadInputs(`demo-${id}`);
    if (!inp) continue;
    for (const y of years) out.push(backtestOne(nm[lang], `demo-${id}`, inp, y, lang));
  }
  memo.set(key, out);
  return out;
}
