import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import area from "@turf/area";
import centroid from "@turf/centroid";
import kinks from "@turf/kinks";
import { polygon as turfPolygon } from "@turf/helpers";
import type { AnalyzeRequest, AnalyzeResponse, DataSourceRef, Module, WhatIfRequest } from "@/types/api";
import { EFFICIENCY, initialWeights, robustnessOf, scoreStrategy } from "@/lib/scoring";
import { hash, readCache, writeCache } from "./cache";
import { climate as climateOf, et0Climatology, et0Fao56, prepWx } from "./core/climate";
import { detectHistory, soilAnalysis } from "./core/history";
import { DEFAULT_LIVESTOCK, livestockModule } from "./core/livestock";
import { seasonalOutlook } from "./core/seasonal";
import { buildStrategies, DEFAULT_LIMIT, lvl } from "./core/strategies";
import { round } from "./core/stats";
import { et0DailyClim } from "./core/water";
import { actualWaterOf, calendarOf, gaezAt, waterSupplyOf } from "./core/extras";
import {
  fetchEra5, fetchForecast16, fetchForecast7, fetchModisEt, fetchModisMonthly, fetchSoilTemp, fetchNpp, fetchPlace, fetchPower, fetchS2Monthly, fetchSeas5, fetchSoil, fetchTerrain, fetchWaterSources, pastureArea,
  type Era5, type Forecast16, type PowerDaily, type S2Month, type Seas5, type SoilProps, type SoilTemp,
} from "./sources";

const UZ = { minLon: 55.9, maxLon: 73.2, minLat: 37.1, maxLat: 45.6 };

export class ValidationError extends Error {}

export function validatePolygon(p: GeoJSON.Polygon) {
  if (!p || p.type !== "Polygon" || !Array.isArray(p.coordinates?.[0]) || p.coordinates[0].length < 4) throw new ValidationError("invalid_polygon");
  const poly = turfPolygon(p.coordinates);
  const areaHa = area(poly) / 1e4;
  const [lon, lat] = centroid(poly).geometry.coordinates;
  if (areaHa < 0.1) throw new ValidationError("tooSmall");
  if (areaHa > 500) throw new ValidationError("tooLarge");
  if (kinks(poly).features.length) throw new ValidationError("selfIntersect");
  if (lon < UZ.minLon || lon > UZ.maxLon || lat < UZ.minLat || lat > UZ.maxLat) throw new ValidationError("outsideUz");
  return { areaHa: round(areaHa, 1), lat, lon };
}

const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

const SOURCES: DataSourceRef[] = [
  { id: "power", name: "NASA POWER (MERRA-2 / GEOS, AG community)", provider: "NASA LaRC", period: "2005-2025", url: "https://power.larc.nasa.gov/" },
  { id: "sentinel2", name: "Sentinel-2 L2A (SCL cloud mask)", provider: "ESA Copernicus · Microsoft Planetary Computer", period: "2017-2026", url: "https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a" },
  { id: "srtm", name: "SRTM GL1 30 m", provider: "NASA / USGS (OpenTopoData)", url: "https://www.earthdata.nasa.gov/data/instruments/srtm" },
  { id: "soilgrids", name: "SoilGrids 2.0 (250 m)", provider: "ISRIC", url: "https://soilgrids.org" },
  { id: "era5", name: "ERA5 reanalysis (FAO ET0, SEAS5 reference climate)", provider: "ECMWF Copernicus · Open-Meteo (CC BY 4.0)", period: "2005-2025", url: "https://open-meteo.com/en/docs/historical-weather-api" },
  { id: "seas5", name: "ECMWF SEAS5 seasonal forecast (51 members)", provider: "ECMWF · Open-Meteo (CC BY 4.0)", url: "https://open-meteo.com/en/docs/seasonal-forecast-api" },
  { id: "modis", name: "MODIS MOD13Q1 NDVI 250 m (pasture norm)", provider: "NASA LP DAAC · Microsoft Planetary Computer", period: "2005-2026", url: "https://planetarycomputer.microsoft.com/dataset/modis-13Q1-061" },
  { id: "npp", name: "MODIS MOD17A3HGF NPP 500 m", provider: "NASA LP DAAC · Microsoft Planetary Computer", url: "https://planetarycomputer.microsoft.com/dataset/modis-17A3HGF-061" },
  { id: "jrc", name: "JRC Global Surface Water (occurrence)", provider: "EC JRC / Google · Microsoft Planetary Computer", period: "1984-2020", url: "https://planetarycomputer.microsoft.com/dataset/jrc-gsw" },
  { id: "era5land", name: "ERA5-Land soil temperature 0-7 cm (sowing, frozen soil)", provider: "ECMWF Copernicus · Open-Meteo (CC BY 4.0)", period: "2005-2025", url: "https://open-meteo.com/en/docs/historical-weather-api" },
  { id: "modis-et", name: "MODIS MOD16A3GF actual ET 500 m (A1 check)", provider: "NASA LP DAAC · Microsoft Planetary Computer", url: "https://planetarycomputer.microsoft.com/dataset/modis-16A3GF-061" },
  { id: "modis-snow", name: "MODIS MOD10A2 snow cover 500 m (water-supply signal)", provider: "NASA NSIDC · Microsoft Planetary Computer", period: "2001-2026", url: "https://planetarycomputer.microsoft.com/dataset/modis-10A2-061" },
  { id: "glofas", name: "GloFAS v4 river discharge", provider: "Copernicus EMS · Open-Meteo Flood API", period: "2001-2026", url: "https://open-meteo.com/en/docs/flood-api" },
  { id: "gaez", name: "FAO GAEZ v4 suitability & attainable yield (5′)", provider: "FAO & IIASA", period: "1981-2010", url: "https://gaez.fao.org" },
  { id: "forecast", name: "Open-Meteo 16-day forecast", provider: "Open-Meteo (CC BY 4.0)", url: "https://open-meteo.com/en/docs" },
  { id: "fao56", name: "FAO-56 Penman-Monteith ET0, crop coefficients", provider: "FAO (Allen et al. 1998)", url: "https://www.fao.org/4/x0490e/x0490e00.htm" },
  { id: "fao29", name: "FAO-29 salinity tolerance (Maas-Hoffman)", provider: "FAO (Ayers & Westcot 1985)", url: "https://www.fao.org/4/t0234e/t0234e00.htm" },
];

export type Inputs = {
  req: AnalyzeRequest;
  power: PowerDaily;
  s2: S2Month[];
  soil: SoilProps | null;
  terrain: { elevation: number; slopeDeg: number } | null;
  seas5: Seas5 | null;
  era5: Era5 | null;
  place: { region?: string; district?: string };
  areaHa: number;
  lat: number;
  lon: number;
  degraded: string[];
  // v2.2 / v2.3 (optional: older cached inputs and demo archives may not have them)
  soilTemp?: SoilTemp | null;
  forecast16?: Forecast16 | null;
  modisEt?: { year: number; etMm: number }[] | null;
  livestock?: {
    modis: { month: string; ndvi: number | null }[] | null;
    npp: { year: number; npp: number }[] | null;
    water: Awaited<ReturnType<typeof fetchWaterSources>> | null;
    forecast: Awaited<ReturnType<typeof fetchForecast7>> | null;
    statsAreaHa: number;
  };
};

const modulesOf = (req: AnalyzeRequest): Module[] => {
  const m = new Set<Module>(req.modules?.length ? req.modules : ["crop"]);
  if (req.profile === "herder") m.add("livestock");
  if (req.profile === "expert") (m.add("crop"), m.add("livestock"));
  m.add("crop"); // the crop module is cheap once the core is fetched, and the challenge's centre
  return [...m];
};

export async function analyze(req: AnalyzeRequest, opts: { fieldId?: string } = {}): Promise<AnalyzeResponse> {
  return compute(...(await gather(req, opts))).res;
}

/** Fetch everything once (core + requested modules), cache the inputs under the field id. */
export async function gather(req: AnalyzeRequest, opts: { fieldId?: string } = {}): Promise<[string, Inputs, number, number]> {
  const { areaHa, lat, lon } = validatePolygon(req.polygon);
  const modules = modulesOf(req);
  const fieldId = opts.fieldId ?? hash({ p: req.polygon, r: req.rotation, pr: req.priorities, w: req.water, s: req.soil, l: req.lang, lv: req.livestock, m: modules }).slice(0, 12);
  const degraded: string[] = [];
  const soft = <T,>(name: string, p: Promise<T>, ms: number) =>
    withTimeout(p, ms).catch(() => {
      degraded.push(name);
      return null;
    });
  const wantLs = modules.includes("livestock");
  const pa = pastureArea(req.polygon, lat, lon, areaHa);
  const [power, s2, soil, terrain, seas5, place, era5, modis, npp, water, forecast, soilTemp, forecast16, modisEt] = await Promise.all([
    withTimeout(fetchPower(lat, lon), 90_000),
    soft("sentinel2", fetchS2Monthly(req.polygon), 75_000),
    soft("soilgrids", fetchSoil(lat, lon), 40_000),
    soft("srtm", fetchTerrain(lat, lon), 20_000),
    soft("seas5", fetchSeas5(lat, lon), 40_000),
    soft("geocode", fetchPlace(lat, lon), 12_000),
    soft("era5", fetchEra5(lat, lon), 60_000),
    wantLs ? soft("modis", fetchModisMonthly(pa.geom), 80_000) : null,
    wantLs ? soft("npp", fetchNpp(pa.geom), 40_000) : null,
    wantLs ? soft("jrc", fetchWaterSources(lat, lon), 40_000) : null,
    wantLs ? soft("forecast", fetchForecast7(lat, lon), 15_000) : null,
    soft("era5land", fetchSoilTemp(lat, lon), 60_000),
    soft("forecast", fetchForecast16(lat, lon), 15_000),
    soft("modis-et", fetchModisEt(req.polygon), 45_000),
  ]);
  const inputs: Inputs = {
    req: { ...req, modules },
    power,
    s2: s2 ?? [],
    soil,
    terrain,
    seas5,
    era5,
    place: place ?? {},
    areaHa,
    lat,
    lon,
    degraded: degraded.filter((d) => d !== "geocode" && d !== "forecast"),
    soilTemp,
    forecast16,
    modisEt,
    livestock: wantLs ? { modis, npp, water, forecast, statsAreaHa: pa.areaHa } : undefined,
  };
  await writeCache("fields", fieldId, inputs);
  return [fieldId, inputs, 0, 0];
}

/** Demo fields ship their archived inputs in the repo, so what-if and export work without a fresh fetch. */
async function demoInputs(id: string): Promise<Inputs | null> {
  const m = /^demo-([a-z]+)$/.exec(id);
  if (!m) return null;
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "data", "demo-inputs", `${m[1]}.json`), "utf8")) as Inputs;
  } catch {
    return null;
  }
}
export const loadInputs = async (id: string) => (await readCache<Inputs>("fields", id)) ?? (await demoInputs(id));

export async function whatIf(r: WhatIfRequest) {
  const inputs = await loadInputs(r.fieldId);
  if (!inputs) return null;
  const dT = Math.max(-1, Math.min(3, Number(r.dT) || 0));
  const dP = Math.max(-40, Math.min(20, Number(r.dPpct) || 0));
  const base = compute(r.fieldId, inputs, 0, 0, undefined, undefined, true);
  const res = compute(r.fieldId, inputs, dT, dP, base.maxGross, base.res.strategies.map((s) => s.name), true);
  return { strategies: res.res.strategies };
}

export async function recompute(fieldId: string) {
  const inputs = await loadInputs(fieldId);
  return inputs ? compute(fieldId, inputs, 0, 0).res : null;
}

export function compute(fieldId: string, inp: Inputs, dT: number, dP: number, waterRef?: number, keep?: string[], light = false): { res: AnalyzeResponse; maxGross: number; chosen: ReturnType<typeof buildStrategies>["chosen"]; et0: number[]; et0Alt?: number[][] } {
  const { req, power, lat } = inp;
  const lang = req.lang === "en" ? "en" : "uz";
  const L = (uz: string, en: string) => (lang === "uz" ? uz : en);
  const w = prepWx(power, dT, dP);
  const et0Power = et0Fao56(w, lat);
  // ET ensemble: NASA POWER FAO-56 + ERA5 FAO-56 (same dates), mean used, both kept for the range
  let et0 = et0Power;
  let et0Alt: number[][] | undefined;
  if (inp.era5) {
    const m = new Map(inp.era5.dates.map((d, i) => [d, inp.era5!.et0[i]]));
    const shift = dT ? 1 + 0.035 * dT : 1;
    const era = w.dates.map((d, i) => {
      const v = m.get(d);
      return v != null && Number.isFinite(v) ? v * shift : et0Power[i];
    });
    et0 = et0Power.map((v, i) => (v + era[i]) / 2);
    et0Alt = [et0Power, era];
  }
  const lastFullYear = Math.max(...w.year.filter((y) => w.year.filter((v) => v === y).length > 360));
  const climate = climateOf(w, et0, lastFullYear);
  const history = detectHistory(inp.s2, req.rotation);
  const { data: soil, ece } = soilAnalysis(inp.s2, inp.soil, power, req.soil?.eceDsM);
  const histYears: [number, number, number] = [lastFullYear - 2, lastFullYear - 1, lastFullYear];
  const ctx = { w, et0, et0Alt, climate, history, soil, ece, req, lang, waterRef, keep, histYears } as const;
  const { strategies, chosen, maxGross } = buildStrategies({ ...ctx });

  // "unknown" rule (ADR-10): no bare-soil imagery and no lab test → salinity fit is not computed
  const weights = initialWeights(req.priorities);
  if (!soil.salinityTrend.length && soil.isEstimated) {
    for (const s of strategies) {
      s.metrics.salinity = null;
      s.unknownReasons = { ...s.unknownReasons, salinity: L("Yalang'och tuproq oylari topilmadi va laboratoriya tahlili kiritilmagan: sho'rga moslik hisobga olinmadi", "No bare-soil months and no lab test: salt fit left out of the score") };
      s.score = scoreStrategy(s.metrics, weights);
    }
  }

  // robustness (GeoAgri idea, PRO_REJA §7.3): same plans scored in a normal, a dry (−30 % rain) and a hot (+1.5 °C) year
  if (!light && !dT && !dP) {
    const names = strategies.map((s) => s.name);
    const dry = compute(fieldId, inp, 0, -30, maxGross, names, true).res.strategies;
    const hot = compute(fieldId, inp, 1.5, 0, maxGross, names, true).res.strategies;
    strategies.forEach((s, i) => {
      const sc = [
        { id: "normal", score: s.score },
        { id: "dry", score: scoreStrategy(dry[i]?.metrics ?? s.metrics, weights) },
        { id: "hot", score: scoreStrategy(hot[i]?.metrics ?? s.metrics, weights) },
      ];
      s.robustness = { score: robustnessOf(sc.map((x) => x.score)), worstScore: Math.min(...sc.map((x) => x.score)), scenarios: sc };
      s.dryWaterM3PerHa = dry[i]?.waterM3PerHa;
    });
  }

  const byStrategy: AnalyzeResponse["water"]["byStrategy"] = {};
  chosen.forEach((e, i) => {
    const { LR: _lr, ...rest } = e.water;
    void _lr;
    byStrategy[strategies[i].id] = rest;
  });
  const limitM3PerHa = req.water.limitM3PerHa ?? DEFAULT_LIMIT[req.water.availability];

  let seasonal: AnalyzeResponse["seasonal"];
  if (!light && inp.seas5 && inp.era5 && !dT && !dP) {
    try {
      seasonal = seasonalOutlook(inp.seas5, inp.era5, climate, chosen, strategies.map((s) => s.id), () => limitM3PerHa);
    } catch {
      inp.degraded.push("seas5");
    }
  }

  let livestock: AnalyzeResponse["livestock"];
  if (!light && inp.livestock) {
    livestock = livestockModule({
      w,
      climate,
      modis: inp.livestock.modis,
      npp: inp.livestock.npp,
      water: inp.livestock.water,
      forecast: inp.livestock.forecast,
      areaHa: inp.areaHa,
      statsAreaHa: inp.livestock.statsAreaHa,
      input: req.livestock ?? DEFAULT_LIVESTOCK,
      lang,
    });
  }

  const best = strategies.slice(1).reduce((a, b) => (b.score > a.score ? b : a), strategies[1] ?? strategies[0]);
  const heatNow = climate.heatDays40.slice(-5).reduce((a, h) => a + h.days, 0) / 5;
  const mainRisk = heatNow >= 10 ? L("Jazirama", "Heat waves") : climate.precipTrendPct < -10 ? L("Qurg'oqchilik", "Drought") : climate.frostFreeDays < 190 ? L("Sovuq", "Frost") : L("Suv tanqisligi", "Water shortage");
  const bare = history.bareWindows.slice(-6);
  const bareDays = bare.length ? Math.round(bare.reduce((a, b) => a + b.days, 0) / bare.length) : 0;
  const fmt = (n: number) => n.toLocaleString(lang === "uz" ? "ru-RU" : "en-US");
  const text = [
    soil.salinityTrendPct != null && soil.salinityTrendPct > 5 && soil.salinityLevel !== "low"
      ? L(`Dalangizda so'nggi yillarda sho'rlanish belgilari kuchaygan (${lvl(soil.salinityLevel, lang)}, +${soil.salinityTrendPct}%).`, `Salinity signs have grown on your field in recent years (${lvl(soil.salinityLevel, lang)}, +${soil.salinityTrendPct}%).`)
      : L(`Sho'rlanish darajasi: ${lvl(soil.salinityLevel, lang)}.`, `Salinity level: ${lvl(soil.salinityLevel, lang)}.`),
    bareDays ? L(`Yozda dala o'rtacha ${bareDays} kun bo'sh turadi.`, `In summer the field stands bare for about ${bareDays} days.`) : "",
    strategies[0].score >= best.score
      ? L(`Hozirgi rotatsiyangiz ustuvorliklaringiz bo'yicha yaxshi (${strategies[0].score} ball). Eng yaqin alternativa: ${best.name} (${best.score} ball).`, `Your current rotation already scores well on your priorities (${strategies[0].score}). Closest alternative: ${best.name} (${best.score}).`)
      : L(`Eng yaxshi variant: ${best.name} (${best.score} ball). U yiliga ≈${fmt(best.waterM3PerHa)} m³/ga suv talab qiladi.`, `Best option: ${best.name} (score ${best.score}), about ${fmt(best.waterM3PerHa)} m³/ha of water per year.`),
  ]
    .filter(Boolean)
    .join(" ");

  // ---- v2.2 / v2.3 extras (QOSHIMCHA_FUNKSIYALAR): never fake a number - null + reason (ADR-10)
  const extras: Pick<AnalyzeResponse, "calendar" | "actualWater" | "norms" | "waterSupply" | "gaez" | "extrasUnknown"> = {};
  if (!light && !dT && !dP) {
    const unk: NonNullable<AnalyzeResponse["extrasUnknown"]> = {};
    const bi = strategies.findIndex((s) => s.id === best.id);
    try {
      extras.calendar = calendarOf({
        now: new Date(),
        best,
        bestYears: chosen[bi]?.years ?? [],
        ece,
        eciSource: soil.isEstimated ? "satellite" : "lab",
        salinity: soil.salinityLevel,
        schedule: chosen[bi]?.water.schedule,
        st: inp.soilTemp ?? null,
        fc: inp.forecast16 ?? null,
        p90LastFrostDoy: climate._p90LastFrost,
        livestock: !!inp.livestock,
        L,
        lang,
      });
    } catch (e) {
      extras.calendar = null;
      unk.calendar = (e as Error).message;
    }
    const cur = chosen[0];
    const aw = actualWaterOf({ w, et0, et0Alt, s2: inp.s2, yearSpec: cur?.years[2] ?? null, crops: [...new Set((cur?.years[2] ?? []).map((s) => s.crop).filter((c) => c !== "fallow"))], modisEt: inp.modisEt ?? null, L });
    extras.actualWater = aw.data;
    if (aw.reason) unk.actualWater = aw.reason;
    extras.norms = null;
    unk.norms = L("O'zbekiston gidromodul rayonlari bo'yicha rasmiy me'yorlar hali yig'ilmagan (D2)", "Official Uzbek hydromodule irrigation norms not collected yet (D2)");
    const ws = waterSupplyOf(inp.place.region, inp.lon, L);
    extras.waterSupply = ws.data;
    if (ws.reason) unk.waterSupply = ws.reason;
    const gz = gaezAt(inp.lat, inp.lon, false, L);
    extras.gaez = gz.data;
    if (gz.reason) unk.gaez = gz.reason;
    if (!inp.soilTemp) unk.leaching = L("Tuproq harorati (ERA5-Land) olinmadi", "Soil temperature (ERA5-Land) unavailable");
    extras.extrasUnknown = unk;
  }

  const usedIds = new Set(["power", "fao56", "fao29", "sentinel2", "srtm", "soilgrids", "era5", "seas5", ...(inp.livestock ? ["modis", "npp", "jrc"] : []), ...(inp.soilTemp ? ["era5land"] : []), ...(inp.modisEt?.length ? ["modis-et"] : []), ...(extras.waterSupply ? ["modis-snow", "glofas"] : []), ...(extras.gaez ? ["gaez"] : []), ...(inp.forecast16 ? ["forecast"] : [])]);
  const res: AnalyzeResponse = {
    fieldId,
    field: {
      areaHa: inp.areaHa,
      centroid: [round(inp.lat, 5), round(inp.lon, 5)],
      region: inp.place.region,
      district: inp.place.district,
      periodStart: 2005,
      periodEnd: lastFullYear,
      polygon: req.polygon,
      placeType: req.placeType ?? "polygon",
      slopeDeg: inp.terrain?.slopeDeg ?? null,
      elevationM: inp.terrain?.elevation ?? null,
    },
    summary: { text, salinity: soil.salinityLevel, waterNeedM3PerHa: best.waterM3PerHa, mainRisk, bestStrategyId: best.id },
    history,
    climate: stripPrivate(climate),
    soil,
    water: { byStrategy, et0Daily: et0DailyClim(et0Climatology(w, et0)), efficiency: EFFICIENCY, limitM3PerHa },
    strategies,
    seasonal,
    sources: SOURCES.filter((s) => usedIds.has(s.id) && !inp.degraded.includes(s.id)),
    degraded: inp.degraded.length ? [...new Set(inp.degraded)] : undefined,
    generatedAt: new Date().toISOString(),
    profile: req.profile ?? "farmer",
    modulesComputed: inp.livestock ? ["crop", "livestock"] : ["crop"],
    livestock,
    ...extras,
  };
  return { res, maxGross, chosen, et0, et0Alt };
}

function stripPrivate<T extends object>(o: T) {
  const r = { ...o } as Record<string, unknown>;
  for (const k of Object.keys(r)) if (k.startsWith("_")) delete r[k];
  return r as unknown as AnalyzeResponse["climate"];
}
