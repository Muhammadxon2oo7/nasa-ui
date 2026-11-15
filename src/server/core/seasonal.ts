import type { ClimateData, SeasonalOutlook } from "@/types/api";
import type { Era5, Seas5 } from "../sources";
import { mean, quantile, round } from "./stats";
import type { Evaluated } from "./strategies";

/**
 * M2 (PRO_REJA §6.2, delta method): every SEAS5 member's monthly anomaly is taken against the
 * ERA5 2005-2025 normal at the same point (same ECMWF model family), then added to the
 * NASA POWER field normal: T_field = T_norm_POWER + ΔT, P_field = P_norm_POWER × (1 + ΔP%).
 * No hindcast skill check yet → confidence stays "low".
 */
export function seasonalOutlook(s: Seas5, era5: Era5, climate: ClimateData, chosen: Evaluated[], ids: string[], limitOf: (e: Evaluated) => number): SeasonalOutlook {
  const eraT = Array.from({ length: 12 }, () => [] as number[]);
  const eraP = new Map<string, number>();
  era5.dates.forEach((d, i) => {
    eraT[+d.slice(5, 7) - 1].push(era5.tmean[i]);
    eraP.set(d.slice(0, 7), (eraP.get(d.slice(0, 7)) ?? 0) + (Number.isFinite(era5.precip[i]) ? era5.precip[i] : 0));
  });
  const eraTn = eraT.map((a) => mean(a));
  const eraPn = Array.from({ length: 12 }, (_, m) => mean([...eraP.entries()].filter(([k]) => +k.slice(5, 7) === m + 1).map(([, v]) => v)));
  const first = new Date(s.time[0] + "T00:00:00Z");
  const months: string[] = [];
  for (let k = 1; k <= 6; k++) {
    const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + k, 1));
    const key = d.toISOString().slice(0, 7);
    const daysIn = s.time.filter((t) => t.startsWith(key)).length;
    const full = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    if (daysIn === full) months.push(key);
  }
  const memberAnoms: { dT: number; dP: number }[] = s.tmax.map(() => ({ dT: 0, dP: 0 }));
  const out = months.map((key) => {
    const idx = s.time.map((t, i) => (t.startsWith(key) ? i : -1)).filter((i) => i >= 0);
    const m = +key.slice(5, 7);
    const norm = climate.monthly[m - 1];
    const tNorm = (norm.tmaxAvg + norm.tminAvg) / 2;
    const temps = s.tmax.map((tx, k) => tNorm + mean(idx.map((i) => (tx[i] + s.tmin[k][i]) / 2)) - eraTn[m - 1]).filter(Number.isFinite);
    const precs = s.precip.map((p) => norm.precipMm * (idx.reduce((a, i) => a + (Number.isFinite(p[i]) ? p[i] : 0), 0) / Math.max(1, eraPn[m - 1])));
    temps.forEach((t, k) => (memberAnoms[k].dT += (t - tNorm) / months.length));
    precs.forEach((p, k) => (memberAnoms[k].dP += ((p - norm.precipMm) / Math.max(5, norm.precipMm)) * (100 / months.length)));
    return {
      month: key,
      tempNormal: round(tNorm, 1),
      tempP10: round(quantile(temps, 0.1), 1),
      tempP25: round(quantile(temps, 0.25), 1),
      tempP50: round(quantile(temps, 0.5), 1),
      tempP75: round(quantile(temps, 0.75), 1),
      tempP90: round(quantile(temps, 0.9), 1),
      precipNormal: round(norm.precipMm, 0),
      precipP10: round(quantile(precs, 0.1), 0),
      precipP50: round(quantile(precs, 0.5), 0),
      precipP90: round(quantile(precs, 0.9), 0),
      probWarmer: round(temps.filter((t) => t > tNorm).length / Math.max(1, temps.length), 2),
      probWetter: round(precs.filter((p) => p > norm.precipMm).length / Math.max(1, precs.length), 2),
    };
  });

  // robustness: share of members in which the plan stays inside its water limit
  // (ET0 sensitivity ≈ +3.5 %/°C; rainfall change shifts effective rain one-for-one, capped)
  const robustness: Record<string, number> = {};
  chosen.forEach((e, i) => {
    const limit = limitOf(e);
    const annualPeff = e.water.monthly.reduce((a, m) => a + m.peffMm, 0);
    const okN = memberAnoms.filter(({ dT, dP }) => {
      const g = e.water.grossM3PerHa * (1 + 0.035 * dT) - (annualPeff * (dP / 100) * 10) / 0.55;
      const heatPenalty = e.facts.heatSens && dT > 1.5;
      return g <= limit && !heatPenalty;
    }).length;
    robustness[ids[i]] = round(okN / Math.max(1, memberAnoms.length), 2);
  });

  return { model: "ecmwf_seas5", issuedAt: s.time[0], members: s.tmax.length, months: out, robustness, confidence: "low" };
}
