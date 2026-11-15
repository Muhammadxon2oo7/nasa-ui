import type { IrrigationMethod, Priority, Strategy, WaterData } from "@/types/api";

// Shared by the backend (initial score) and the frontend (instant re-ranking) - FRONTEND_REJASI §13.6.

export type MetricKey = keyof Strategy["metrics"];
export const metricValue = (v: number | null | undefined) => (v == null ? null : v);
export type Weights = Record<MetricKey, number>;
export const METRIC_KEYS: MetricKey[] = ["water", "income", "soil", "salinity", "climateRisk", "labor"];

const MAP: Record<Priority, MetricKey> = {
  water: "water",
  income: "income",
  soil: "soil",
  salinity: "salinity",
  forage: "income",
  labor: "labor",
};

/** 1st priority = 3, 2nd = 2, 3rd = 1.5, others = 0.5 (climate risk always 1). */
export function initialWeights(priorities: Priority[]): Weights {
  const w: Weights = { water: 0.5, income: 0.5, soil: 0.5, salinity: 0.5, climateRisk: 1, labor: 0.5 };
  [3, 2, 1.5].forEach((v, i) => {
    const p = priorities[i];
    if (p) w[MAP[p]] = Math.max(w[MAP[p]], v);
  });
  return w;
}

/** Unknown (null) metrics drop out and the remaining weights are re-normalised (ADR-10). */
export function scoreStrategy(m: Strategy["metrics"], w: Weights): number {
  const keys = METRIC_KEYS.filter((k) => m[k] != null && Number.isFinite(m[k] as number));
  const total = keys.reduce((s, k) => s + w[k], 0) || 1;
  return Math.round(keys.reduce((s, k) => s + (m[k] as number) * w[k], 0) / total);
}

/** robustness = 0.5·min(scenario scores) + 0.5·(100 − 2·std) (PRO_REJA §7.3). */
export function robustnessOf(scores: number[]) {
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const std = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
  return Math.round(Math.max(0, Math.min(100, 0.5 * Math.min(...scores) + 0.5 * (100 - 2 * std))));
}

export function grossM3(water: WaterData, strategyId: string, method: IrrigationMethod): number {
  const s = water.byStrategy[strategyId];
  if (!s) return 0;
  return Math.round((s.netMm * 10) / water.efficiency[method] / 100) * 100; // round to 100 m³
}

export const EFFICIENCY: Record<IrrigationMethod, number> = { furrow: 0.55, drip: 0.9, sprinkler: 0.75 };
