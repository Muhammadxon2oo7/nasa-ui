import "server-only";
import { cached, DAY, getJson, pool } from "./cache";

/* ------------------------------------------------------------------ NASA POWER */

export type PowerDaily = {
  dates: string[]; // yyyy-mm-dd
  tmax: number[];
  tmin: number[];
  precip: number[];
  rh: number[];
  wind: number[]; // m/s @2m
  rs: number[]; // MJ/m²/day
  gwetRoot: number[];
  elevation: number;
};

const POWER_PARAMS = ["T2M_MAX", "T2M_MIN", "PRECTOTCORR", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN", "GWETROOT"];

/** 2005-01-01 → yesterday-ish. Key rounded to 0.1° (PRO_REJA §4.2), cached 30 days. */
export function fetchPower(lat: number, lon: number): Promise<PowerDaily> {
  const la = Math.round(lat * 10) / 10;
  const lo = Math.round(lon * 10) / 10;
  return cached("power", { la, lo, v: 2 }, 30 * DAY, async () => {
    const end = new Date(Date.now() - 5 * DAY).toISOString().slice(0, 10).replaceAll("-", "");
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${POWER_PARAMS.join(",")}&community=AG&latitude=${la}&longitude=${lo}&start=20050101&end=${end}&format=JSON`;
    const j = await getJson<{ geometry: { coordinates: number[] }; properties: { parameter: Record<string, Record<string, number>> } }>(url, { timeoutMs: 90_000 });
    const p = j.properties.parameter;
    let keys = Object.keys(p.T2M_MAX).sort();
    // drop the not-yet-available tail (-999)
    while (keys.length && POWER_PARAMS.some((k) => (p[k]?.[keys[keys.length - 1]] ?? -999) <= -998)) keys = keys.slice(0, -1);
    const col = (k: string) => {
      const out: number[] = [];
      for (let i = 0; i < keys.length; i++) {
        const v = p[k][keys[i]];
        out.push(v <= -998 ? NaN : v);
      }
      // PRO_REJA §4.3: interpolate gaps shorter than 3 days, else carry the climatology later
      for (let i = 0; i < out.length; i++) {
        if (!Number.isNaN(out[i])) continue;
        let j2 = i;
        while (j2 < out.length && Number.isNaN(out[j2])) j2++;
        const a = out[i - 1], b = out[j2];
        for (let q = i; q < j2; q++) out[q] = Number.isFinite(a) && Number.isFinite(b) && j2 - i < 3 ? a + ((b - a) * (q - i + 1)) / (j2 - i + 1) : Number.isFinite(a) ? a : b ?? 0;
        i = j2;
      }
      return out;
    };
    return {
      dates: keys.map((d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`),
      tmax: col("T2M_MAX"),
      tmin: col("T2M_MIN"),
      precip: col("PRECTOTCORR"),
      rh: col("RH2M"),
      wind: col("WS2M"),
      rs: col("ALLSKY_SFC_SW_DWN"),
      gwetRoot: col("GWETROOT"),
      elevation: j.geometry.coordinates[2] ?? 0,
    };
  });
}

/* ------------------------------------------- Sentinel-2 L2A via Planetary Computer */

const PC = "https://planetarycomputer.microsoft.com/api";

export type S2Month = { month: string; ndvi: number | null; si: number | null; validFrac: number; scenes: number };

type StacItem = { id: string; properties: { datetime: string; "eo:cloud_cover": number } };

/**
 * Monthly field NDVI + salinity index, 2017→now.
 * Per month: the 2 least-cloudy scenes (STAC cloud < 40 %), each reduced over the field polygon
 * server-side (TiTiler statistics) with the SCL mask {4 vegetation, 5 bare soil} (PRO_REJA §4.3).
 * Expressions: valid share, masked NDVI, masked SI = √(B2·B4) (Khan et al. 2005).
 */
export function fetchS2Monthly(polygon: GeoJSON.Polygon, fromYear = 2017): Promise<S2Month[]> {
  return cached("s2", { polygon, fromYear, v: 3 }, 30 * DAY, async () => {
    const now = new Date();
    const items: StacItem[] = [];
    for (let y = fromYear; y <= now.getUTCFullYear(); y++) {
      const body = {
        collections: ["sentinel-2-l2a"],
        intersects: polygon,
        datetime: `${y}-01-01T00:00:00Z/${y}-12-31T23:59:59Z`,
        query: { "eo:cloud_cover": { lt: 40 } },
        limit: 250,
        fields: { include: ["id", "properties.datetime", "properties.eo:cloud_cover"], exclude: ["assets", "links", "geometry"] },
      };
      const r = await getJson<{ features: StacItem[] }>(`${PC}/stac/v1/search`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" }, timeoutMs: 30_000 });
      items.push(...r.features);
    }
    // best 2 scenes per month
    const byMonth = new Map<string, StacItem[]>();
    for (const it of items) {
      const m = it.properties.datetime.slice(0, 7);
      byMonth.set(m, [...(byMonth.get(m) ?? []), it]);
    }
    const picks: { month: string; id: string }[] = [];
    for (const [m, arr] of byMonth) {
      arr.sort((a, b) => a.properties["eo:cloud_cover"] - b.properties["eo:cloud_cover"]);
      // de-duplicate same-day tiles
      const seen = new Set<string>();
      for (const it of arr) {
        const day = it.properties.datetime.slice(0, 10);
        if (seen.has(day)) continue;
        seen.add(day);
        picks.push({ month: m, id: it.id });
        if (seen.size >= 2) break;
      }
    }
    const valid = "((SCL==4)|(SCL==5))";
    const expr = [`where(${valid},1,0)`, `where(${valid},(B08-B04)/(B08+B04),0)`, `where(${valid},sqrt(B02*B04)/10000,0)`].join(";");
    const feature = { type: "Feature", properties: {}, geometry: polygon };
    const stats = await pool(picks, 8, async (pk) => {
      const u = `${PC}/data/v1/item/statistics?collection=sentinel-2-l2a&item=${encodeURIComponent(pk.id)}&expression=${encodeURIComponent(expr)}&asset_as_band=true`;
      const r = await getJson<{ properties: { statistics: Record<string, { mean: number }> } }>(u, { method: "POST", body: JSON.stringify(feature), headers: { "Content-Type": "application/json" }, timeoutMs: 40_000, tries: 2 });
      const s = Object.values(r.properties.statistics).map((x) => x.mean);
      const vf = s[0];
      if (!(vf > 0.3)) return { month: pk.month, vf, ndvi: null, si: null };
      return { month: pk.month, vf, ndvi: s[1] / vf, si: s[2] / vf };
    });
    const out = new Map<string, { n: number[]; s: number[]; vf: number; c: number }>();
    for (const st of stats) {
      if (!st) continue;
      const o = out.get(st.month) ?? { n: [], s: [], vf: 0, c: 0 };
      if (st.ndvi != null && Number.isFinite(st.ndvi)) o.n.push(st.ndvi);
      if (st.si != null && Number.isFinite(st.si)) o.s.push(st.si);
      o.vf = Math.max(o.vf, st.vf);
      o.c++;
      out.set(st.month, o);
    }
    const months: S2Month[] = [];
    for (let y = fromYear; y <= now.getUTCFullYear(); y++)
      for (let m = 1; m <= 12; m++) {
        const key = `${y}-${String(m).padStart(2, "0")}`;
        if (key > now.toISOString().slice(0, 7)) break;
        const o = out.get(key);
        const med = (a: number[]) => (a.length ? a.sort((x, z) => x - z)[Math.floor(a.length / 2)] : null);
        months.push({ month: key, ndvi: o ? med(o.n) : null, si: o ? med(o.s) : null, validFrac: o?.vf ?? 0, scenes: o?.c ?? 0 });
      }
    return months;
  });
}

/* ------------------------------------------------------------------ SoilGrids */

export type SoilProps = { clay: number; sand: number; silt: number; socGKg: number; ph: number };

export function fetchSoil(lat: number, lon: number): Promise<SoilProps> {
  return cached("soil", { lat: lat.toFixed(3), lon: lon.toFixed(3) }, 90 * DAY, async () => {
    const u = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon}&lat=${lat}&property=clay&property=sand&property=silt&property=soc&property=phh2o&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean`;
    const j = await getJson<{ properties: { layers: { name: string; unit_measure: { d_factor: number }; depths: { values: { mean: number | null } }[] }[] } }>(u, { timeoutMs: 40_000, tries: 2 });
    const get = (n: string) => {
      const l = j.properties.layers.find((x) => x.name === n);
      if (!l) return NaN;
      const vs = l.depths.map((d) => d.values.mean).filter((v): v is number => v != null);
      return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length / l.unit_measure.d_factor : NaN;
    };
    const r = { clay: get("clay"), sand: get("sand"), silt: get("silt"), socGKg: get("soc"), ph: get("phh2o") };
    if (!Number.isFinite(r.clay)) throw new Error("soilgrids empty");
    return r;
  });
}

/* --------------------------------------------------- SRTM / NASADEM elevation */

export function fetchTerrain(lat: number, lon: number): Promise<{ elevation: number; slopeDeg: number }> {
  return cached("dem", { lat: lat.toFixed(4), lon: lon.toFixed(4) }, 365 * DAY, async () => {
    const d = 0.0018; // ≈ 150-200 m
    const pts = [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]].map(([a, b]) => `${(lat + a).toFixed(5)},${(lon + b).toFixed(5)}`);
    const j = await getJson<{ results: { elevation: number | null }[] }>(`https://api.opentopodata.org/v1/srtm30m?locations=${pts.join("|")}`, { timeoutMs: 20_000, tries: 2 });
    const z = j.results.map((r) => r.elevation ?? NaN);
    const dy = d * 110574 * 2, dx = d * 111320 * Math.cos((lat * Math.PI) / 180) * 2;
    const gy = (z[1] - z[2]) / dy, gx = (z[3] - z[4]) / dx;
    return { elevation: z[0], slopeDeg: Math.round((Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI * 10) / 10 };
  });
}

/* ------------------------------------------- ERA5 reanalysis via Open-Meteo archive */

export type Era5 = { dates: string[]; tmean: number[]; precip: number[]; et0: number[] };

/** ERA5 daily 2005→last full year: FAO ET0 for the ET ensemble, and SEAS5's reference climate. */
export function fetchEra5(lat: number, lon: number): Promise<Era5> {
  const end = `${new Date().getUTCFullYear() - 1}-12-31`;
  return cached("era5", { lat: lat.toFixed(2), lon: lon.toFixed(2), end }, 30 * DAY, async () => {
    const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2005-01-01&end_date=${end}&daily=temperature_2m_mean,precipitation_sum,et0_fao_evapotranspiration&timezone=UTC`;
    const j = await getJson<{ daily: { time: string[]; temperature_2m_mean: (number | null)[]; precipitation_sum: (number | null)[]; et0_fao_evapotranspiration: (number | null)[] } }>(u, { timeoutMs: 60_000 });
    const n = (a: (number | null)[]) => a.map((v) => (v == null ? NaN : v));
    return { dates: j.daily.time, tmean: n(j.daily.temperature_2m_mean), precip: n(j.daily.precipitation_sum), et0: n(j.daily.et0_fao_evapotranspiration) };
  });
}

/* --------------------------------------------- ECMWF SEAS5 via Open-Meteo */

export type Seas5 = { elevation: number; time: string[]; tmax: number[][]; tmin: number[][]; precip: number[][] }; // [member][day]

export function fetchSeas5(lat: number, lon: number): Promise<Seas5> {
  const day = new Date().toISOString().slice(0, 10);
  return cached("seas5", { lat: lat.toFixed(2), lon: lon.toFixed(2), day }, 7 * DAY, async () => {
    const u = `https://seasonal-api.open-meteo.com/v1/seasonal?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=183&models=ecmwf_seas5`;
    const j = await getJson<{ elevation: number; daily: Record<string, (number | null)[]> & { time: string[] } }>(u, { timeoutMs: 40_000 });
    const pick = (v: string) =>
      Object.keys(j.daily)
        .filter((k) => k === v || k.startsWith(`${v}_member`))
        .map((k) => j.daily[k].map((x) => (x == null ? NaN : Number(x))));
    return { elevation: j.elevation, time: j.daily.time, tmax: pick("temperature_2m_max"), tmin: pick("temperature_2m_min"), precip: pick("precipitation_sum") };
  });
}

/* --------------------------------------- reverse geocode (region / district) */

export function fetchPlace(lat: number, lon: number): Promise<{ region?: string; district?: string }> {
  return cached("geo", { lat: lat.toFixed(3), lon: lon.toFixed(3) }, 365 * DAY, async () => {
    const j = await getJson<{ address?: Record<string, string> }>(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&accept-language=uz`, { timeoutMs: 12_000, tries: 1 });
    const a = j.address ?? {};
    return { region: a.state ?? a.region, district: a.county ?? a.city ?? a.town ?? a.district };
  });
}

/* ---------------------------------------------- MODIS (NASA) via Planetary Computer */

/** Pasture statistics need a few MODIS pixels: small fields get a ~1 km square around the centroid. */
export function pastureArea(polygon: GeoJSON.Polygon, lat: number, lon: number, areaHa: number): { geom: GeoJSON.Polygon; areaHa: number } {
  if (areaHa >= 60) return { geom: polygon, areaHa };
  const dLat = 0.5 / 110.574, dLon = 0.5 / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { geom: { type: "Polygon", coordinates: [[[lon - dLon, lat - dLat], [lon + dLon, lat - dLat], [lon + dLon, lat + dLat], [lon - dLon, lat + dLat], [lon - dLon, lat - dLat]]] }, areaHa: 100 };
}

type ItemRef = { id: string; properties: { datetime?: string; start_datetime?: string } };

async function stacYear(collection: string, geom: GeoJSON.Polygon, y: number) {
  const r = await getJson<{ features: ItemRef[] }>(`${PC}/stac/v1/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ collections: [collection], intersects: geom, datetime: `${y}-01-01T00:00:00Z/${y}-12-31T23:59:59Z`, limit: 60, fields: { include: ["id", "properties.datetime", "properties.start_datetime"], exclude: ["assets", "links", "geometry"] } }),
    timeoutMs: 30_000,
  });
  return r.features;
}

/** MOD13Q1 NDVI (250 m), one 16-day composite per month (closest to mid-month), 2005 → now. */
export function fetchModisMonthly(geom: GeoJSON.Polygon): Promise<{ month: string; ndvi: number | null }[]> {
  return cached("modis-ndvi", { geom, v: 1 }, 30 * DAY, async () => {
    const now = new Date();
    const years = Array.from({ length: now.getUTCFullYear() - 2005 + 1 }, (_, i) => 2005 + i);
    const perYear = await pool(years, 6, (y) => stacYear("modis-13Q1-061", geom, y));
    const picks: { month: string; id: string }[] = [];
    for (const items of perYear) {
      if (!items) continue;
      const byMonth = new Map<string, { id: string; dist: number }>();
      for (const it of items) {
        const d = it.properties.start_datetime ?? it.properties.datetime ?? "";
        const day = new Date(d);
        const mid = new Date(d.slice(0, 7) + "-15T00:00:00Z");
        // composites start every 16 days; use the composite's middle (start + 8 d)
        const centre = new Date(day.getTime() + 8 * DAY);
        const key = centre.toISOString().slice(0, 7);
        const dist = Math.abs(centre.getTime() - new Date(key + "-15T00:00:00Z").getTime());
        void mid;
        const cur = byMonth.get(key);
        if (!cur || dist < cur.dist) byMonth.set(key, { id: it.id, dist });
      }
      for (const [month, v] of byMonth) picks.push({ month, id: v.id });
    }
    const feature = { type: "Feature", properties: {}, geometry: geom };
    const stats = await pool(picks, 10, async (p) => {
      const r = await getJson<{ properties: { statistics: Record<string, { mean: number; count: number }> } }>(
        `${PC}/data/v1/item/statistics?collection=modis-13Q1-061&item=${encodeURIComponent(p.id)}&assets=250m_16_days_NDVI`,
        { method: "POST", body: JSON.stringify(feature), headers: { "Content-Type": "application/json" }, timeoutMs: 40_000, tries: 2 },
      );
      const s = Object.values(r.properties.statistics)[0];
      return { month: p.month, ndvi: s && s.count > 0 && s.mean > -2000 ? s.mean / 10000 : null };
    });
    return stats.filter((x): x is { month: string; ndvi: number | null } => !!x).sort((a, b) => a.month.localeCompare(b.month));
  });
}

/** MOD17A3HGF annual NPP (500 m) in kg C/m²/yr, fill values (≥ 32700) masked. */
export function fetchNpp(geom: GeoJSON.Polygon): Promise<{ year: number; npp: number }[]> {
  return cached("modis-npp", { geom, v: 2 }, 90 * DAY, async () => {
    const r = await getJson<{ features: ItemRef[] }>(`${PC}/stac/v1/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collections: ["modis-17A3HGF-061"], intersects: geom, datetime: "2005-01-01T00:00:00Z/2030-01-01T00:00:00Z", limit: 50, fields: { include: ["id", "properties.datetime", "properties.start_datetime"], exclude: ["assets", "links", "geometry"] } }),
      timeoutMs: 30_000,
    });
    const expr = "where(Npp_500m<32700,Npp_500m,0);where(Npp_500m<32700,1,0)";
    const feature = { type: "Feature", properties: {}, geometry: geom };
    const out = await pool(r.features, 8, async (it) => {
      const j = await getJson<{ properties: { statistics: Record<string, { mean: number }> } }>(
        `${PC}/data/v1/item/statistics?collection=modis-17A3HGF-061&item=${encodeURIComponent(it.id)}&expression=${encodeURIComponent(expr)}&asset_as_band=true`,
        { method: "POST", body: JSON.stringify(feature), headers: { "Content-Type": "application/json" }, timeoutMs: 40_000, tries: 2 },
      );
      const [sum, valid] = Object.values(j.properties.statistics).map((x) => x.mean);
      const year = +(it.properties.start_datetime ?? it.properties.datetime ?? "").slice(0, 4);
      return valid > 0.2 ? { year, npp: (sum / valid) * 0.0001 } : null;
    });
    // Terra (MOD) + Aqua (MYD) give one value each per year → average them
    const by = new Map<number, number[]>();
    for (const x of out) if (x && x.year > 2000) by.set(x.year, [...(by.get(x.year) ?? []), x.npp]);
    return [...by].map(([year, v]) => ({ year, npp: v.reduce((a, b) => a + b, 0) / v.length })).sort((a, b) => a.year - b.year);
  });
}

/** JRC Global Surface Water occurrence around a point → nearest permanent (≥ 75 %) and seasonal (10-74 %) water. */
export function fetchWaterSources(lat: number, lon: number): Promise<{ permanentKm: number | null; seasonalKm: number | null; permanentAt?: [number, number]; seasonalAt?: [number, number]; radiusKm: number }> {
  return cached("jrc", { lat: lat.toFixed(3), lon: lon.toFixed(3), v: 1 }, 365 * DAY, async () => {
    const s = await getJson<{ features: { id: string }[] }>(`${PC}/stac/v1/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collections: ["jrc-gsw"], intersects: { type: "Point", coordinates: [lon, lat] }, limit: 1, fields: { include: ["id"], exclude: ["assets", "links", "geometry"] } }),
      timeoutMs: 20_000,
    });
    const item = s.features[0]?.id;
    if (!item) throw new Error("jrc: no tile");
    const dLat = 0.11, dLon = 0.11 / Math.cos((lat * Math.PI) / 180);
    const N = 256;
    const u = `${PC}/data/v1/item/bbox/${lon - dLon},${lat - dLat},${lon + dLon},${lat + dLat}/${N}x${N}.npy?collection=jrc-gsw&item=${encodeURIComponent(item)}&assets=occurrence`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 40_000);
    const buf = new Uint8Array(await (await fetch(u, { signal: ctrl.signal })).arrayBuffer());
    clearTimeout(t);
    // .npy v1: magic(6) ver(2) headerLen(2, LE) header, then C-order uint8 data: [band, row, col]
    const hl = buf[8] | (buf[9] << 8);
    const data = buf.subarray(10 + hl);
    const occ = data.subarray(0, N * N), mask = data.subarray(N * N, 2 * N * N);
    let bp = Infinity, bs = Infinity, ap: [number, number] | undefined, as: [number, number] | undefined;
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        const i = r * N + c;
        if (!mask[i]) continue;
        const v = occ[i];
        if (v < 10 || v > 100) continue;
        const plat = lat + dLat - ((r + 0.5) / N) * 2 * dLat;
        const plon = lon - dLon + ((c + 0.5) / N) * 2 * dLon;
        const km = Math.hypot((plat - lat) * 110.574, (plon - lon) * 111.32 * Math.cos((lat * Math.PI) / 180));
        if (v >= 75 && km < bp) { bp = km; ap = [plat, plon]; }
        else if (v < 75 && km < bs) { bs = km; as = [plat, plon]; }
      }
    const radiusKm = Math.round(0.11 * 110.574);
    return { permanentKm: Number.isFinite(bp) ? Math.round(bp * 10) / 10 : null, seasonalKm: Number.isFinite(bs) ? Math.round(bs * 10) / 10 : null, permanentAt: ap, seasonalAt: as, radiusKm };
  });
}

/** 7-day forecast for livestock heat (Open-Meteo). */
export function fetchForecast7(lat: number, lon: number): Promise<{ date: string; tmax: number; rh: number }[]> {
  const day = new Date().toISOString().slice(0, 10);
  return cached("forecast", { lat: lat.toFixed(2), lon: lon.toFixed(2), day }, 0.25 * DAY, async () => {
    const j = await getJson<{ daily: { time: string[]; temperature_2m_max: number[]; relative_humidity_2m_mean: number[] } }>(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,relative_humidity_2m_mean&timezone=auto&forecast_days=7`,
      { timeoutMs: 15_000 },
    );
    return j.daily.time.map((d, i) => ({ date: d, tmax: j.daily.temperature_2m_max[i], rh: j.daily.relative_humidity_2m_mean[i] }));
  });
}

/* ------------------------------------------- v2.2: soil temperature, 16-day forecast, MODIS ET */

export type SoilTemp = { dates: string[]; t: number[] }; // daily mean 0-7 cm, °C

/** ERA5-Land soil temperature 0-7 cm (Open-Meteo archive), 2005 → last full year. N2 sowing, N8 frozen soil. */
export function fetchSoilTemp(lat: number, lon: number): Promise<SoilTemp> {
  const end = `${new Date().getUTCFullYear() - 1}-12-31`;
  return cached("soiltemp", { lat: lat.toFixed(2), lon: lon.toFixed(2), end }, 30 * DAY, async () => {
    const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2005-01-01&end_date=${end}&daily=soil_temperature_0_to_7cm_mean&timezone=UTC`;
    const j = await getJson<{ daily: { time: string[]; soil_temperature_0_to_7cm_mean: (number | null)[] } }>(u, { timeoutMs: 60_000 });
    return { dates: j.daily.time, t: j.daily.soil_temperature_0_to_7cm_mean.map((v) => (v == null ? NaN : v)) };
  });
}

export type Forecast16 = { date: string; tmin: number; tmax: number; precip: number; soilT: number }[];

/** 16-day forecast (Open-Meteo): frost / heat events for "this week", soil temperature trend. */
export function fetchForecast16(lat: number, lon: number): Promise<Forecast16> {
  const day = new Date().toISOString().slice(0, 10);
  return cached("forecast16", { lat: lat.toFixed(2), lon: lon.toFixed(2), day }, 0.25 * DAY, async () => {
    const j = await getJson<{ daily: Record<string, (number | null)[]> & { time: string[] } }>(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,soil_temperature_0_to_7cm_mean&timezone=auto&forecast_days=16`,
      { timeoutMs: 15_000 },
    );
    const n = (v: number | null | undefined) => (v == null ? NaN : v);
    return j.daily.time.map((d, i) => ({ date: d, tmin: n(j.daily.temperature_2m_min[i]), tmax: n(j.daily.temperature_2m_max[i]), precip: n(j.daily.precipitation_sum[i]), soilT: n(j.daily.soil_temperature_0_to_7cm_mean?.[i]) }));
  });
}

/** MODIS MOD16A3GF annual actual ET (mm/yr) over the field - independent check for A1. Terra+Aqua averaged per year. */
export function fetchModisEt(geom: GeoJSON.Polygon): Promise<{ year: number; etMm: number }[]> {
  return cached("modis-et", { geom, v: 1 }, 90 * DAY, async () => {
    const r = await getJson<{ features: ItemRef[] }>(`${PC}/stac/v1/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collections: ["modis-16A3GF-061"], intersects: geom, datetime: "2015-01-01T00:00:00Z/2030-01-01T00:00:00Z", limit: 40, fields: { include: ["id", "properties.datetime", "properties.start_datetime"], exclude: ["assets", "links", "geometry"] } }),
      timeoutMs: 30_000,
    });
    const expr = "where(ET_500m<32700,ET_500m,0);where(ET_500m<32700,1,0)";
    const feature = { type: "Feature", properties: {}, geometry: geom };
    const out = await pool(r.features, 8, async (it) => {
      const j = await getJson<{ properties: { statistics: Record<string, { mean: number }> } }>(
        `${PC}/data/v1/item/statistics?collection=modis-16A3GF-061&item=${encodeURIComponent(it.id)}&expression=${encodeURIComponent(expr)}&asset_as_band=true`,
        { method: "POST", body: JSON.stringify(feature), headers: { "Content-Type": "application/json" }, timeoutMs: 40_000, tries: 2 },
      );
      const [sum, valid] = Object.values(j.properties.statistics).map((x) => x.mean);
      const year = +(it.properties.start_datetime ?? it.properties.datetime ?? "").slice(0, 4);
      return valid > 0.2 ? { year, etMm: (sum / valid) * 0.1 } : null;
    });
    const by = new Map<number, number[]>();
    for (const x of out) if (x && x.year > 2000) by.set(x.year, [...(by.get(x.year) ?? []), x.etMm]);
    return [...by].map(([year, v]) => ({ year, etMm: v.reduce((a, b) => a + b, 0) / v.length })).sort((a, b) => a.year - b.year);
  });
}
