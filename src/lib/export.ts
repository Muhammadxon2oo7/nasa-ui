import type { AnalyzeResponse } from "@/types/api";

/** Expert-mode export (PRO_REJA §3A.5). Shared by the API route and the in-browser fallback. */
export function toCsv(d: AnalyzeResponse): string {
  const rows: string[][] = [];
  const add = (...r: (string | number | null | undefined)[]) => rows.push(r.map((v) => (v == null ? "" : String(v))));
  add("# TerraVision export", d.fieldId, d.generatedAt);
  add("# field", "areaHa", d.field.areaHa, "lat", d.field.centroid[0], "lon", d.field.centroid[1], "region", d.field.region ?? "", "district", d.field.district ?? "");
  add();
  add("section", "month", "ndvi_sentinel2");
  d.history.ndvi.forEach((n) => add("ndvi", n.date, n.value));
  add();
  add("section", "month", "tmax_avg_C", "tmin_avg_C", "tmax_p10", "tmax_p90", "precip_mm", "et0_mm");
  d.climate.monthly.forEach((m) => add("climate", m.month, m.tmaxAvg, m.tminAvg, m.tmaxP10, m.tmaxP90, m.precipMm, m.et0Mm));
  add();
  add("section", "year", "days_tmax_ge_40");
  d.climate.heatDays40.forEach((h) => add("heat40", h.year, h.days));
  add();
  add("section", "strategy", "name", "score", "robustness", "worst", "water_m3_ha", "water", "income", "soil", "salinity", "climateRisk", "labor");
  d.strategies.forEach((s) => add("strategy", s.id, s.name, s.score, s.robustness?.score, s.robustness?.worstScore, s.waterM3PerHa, s.metrics.water, s.metrics.income, s.metrics.soil, s.metrics.salinity, s.metrics.climateRisk, s.metrics.labor));
  add();
  add("section", "strategy", "month", "etc_mm", "peff_mm", "irrigation_mm");
  Object.entries(d.water.byStrategy).forEach(([id, w]) => w.monthly.forEach((m) => add("water", id, m.month, m.etcMm, m.peffMm, m.irrigationMm)));
  if (d.livestock) {
    add();
    add("section", "month", "ndvi_this_year", "norm_p10", "norm_p50", "norm_p90", "thi_mean", "thi_max");
    d.livestock.pasture.ndviNorm.forEach((n, i) => add("pasture", n.month, d.livestock!.pasture.ndviThisYear[i]?.value, n.p10, n.p50, n.p90, d.livestock!.heat.monthly[i]?.thiMean, d.livestock!.heat.monthly[i]?.thiMax));
  }
  return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replaceAll('"', '""')}"` : c)).join(",")).join("\n");
}

export function toGeoJson(d: AnalyzeResponse) {
  const best = d.strategies.find((s) => s.id === d.summary.bestStrategyId);
  return {
    type: "Feature",
    geometry: d.field.polygon,
    properties: { fieldId: d.fieldId, areaHa: d.field.areaHa, region: d.field.region, district: d.field.district, salinity: d.summary.salinity, mainRisk: d.summary.mainRisk, bestStrategy: best?.name, bestScore: best?.score, waterNeedM3PerHa: d.summary.waterNeedM3PerHa, generatedAt: d.generatedAt },
  };
}
