// N1 (QOSHIMCHA_FUNKSIYALAR §5A): mountain snow (MODIS MOD10A2, Planetary Computer) + summer river flow (GloFAS via Open-Meteo)
// per basin, 2001 → now. Basin-level, so it is computed once and shared by every field.
// Usage: node scripts/build-water-supply.mjs   → data/ref/water_supply.json
import { writeFileSync } from "node:fs";

const PC = "https://planetarycomputer.microsoft.com/api";
// headwater boxes (snow-fed upper catchments) and a GloFAS cell on the main river below them
const BASINS = {
  syrdarya: { name: "Sirdaryo", box: [72.8, 40.6, 78.0, 42.4], flow: [41.175, 72.125], flowName: "Norin (Uchqo'rg'on)" },
  amudarya: { name: "Amudaryo", box: [68.8, 36.6, 75.0, 39.6], flow: [37.825, 65.225], flowName: "Amudaryo (Kerki)" },
  zarafshan: { name: "Zarafshon", box: [67.8, 39.0, 70.6, 39.8], flow: [39.775, 66.775], flowName: "Zarafshon (Samarqand)" },
};
const poly = ([a, b, c, d]) => ({ type: "Polygon", coordinates: [[[a, b], [c, b], [c, d], [a, d], [a, b]]] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(url, init, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let k = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (k < items.length) { const i = k++; out[i] = await fn(items[i]).catch(() => null); } }));
  return out;
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const pearson = (x, y) => { const mx = mean(x), my = mean(y); let n = 0, a = 0, b = 0; x.forEach((v, i) => { n += (v - mx) * (y[i] - my); a += (v - mx) ** 2; b += (y[i] - my) ** 2; }); return n / Math.sqrt(a * b); };

const now = new Date();
const curSeasonEnd = now.getUTCMonth() >= 10 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(); // season named by its spring year
const out = { builtAt: now.toISOString(), source: ["MODIS MOD10A2 (NASA, Planetary Computer)", "GloFAS v4 (Copernicus, Open-Meteo Flood API)"], basins: {} };

for (const [id, b] of Object.entries(BASINS)) {
  const geom = poly(b.box);
  const feature = { type: "Feature", properties: {}, geometry: geom };
  // all 8-day composites Nov–Apr, 2000-11 → now
  const items = [];
  for (let y = 2001; y <= curSeasonEnd; y++) {
    const r = await json(`${PC}/stac/v1/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collections: ["modis-10A2-061"], intersects: geom, datetime: `${y - 1}-11-01T00:00:00Z/${y}-04-30T23:59:59Z`, limit: 200, fields: { include: ["id", "properties.start_datetime", "properties.datetime"], exclude: ["assets", "links", "geometry"] } }) });
    for (const f of r.features) items.push({ id: f.id, date: (f.properties.start_datetime ?? f.properties.datetime).slice(0, 10), season: y });
  }
  const expr = "where(Maximum_Snow_Extent==200,1,0);where((Maximum_Snow_Extent==200)|(Maximum_Snow_Extent==25),1,0)";
  console.log(id, items.length, "items");
  let done = 0;
  const stats = await pool(items, 10, async (it) => {
    const j = await json(`${PC}/data/v1/item/statistics?collection=modis-10A2-061&item=${encodeURIComponent(it.id)}&expression=${encodeURIComponent(expr)}&asset_as_band=true&max_size=256`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(feature) });
    if (++done % 100 === 0) console.log(id, done);
    const [s, v] = Object.values(j.properties.statistics);
    return { ...it, snow: s.mean * s.count, valid: v.mean * v.count };
  });
  // composite date → snow fraction (tiles merged)
  const byDate = new Map();
  for (const x of stats) if (x) { const o = byDate.get(x.date) ?? { season: x.season, snow: 0, valid: 0 }; o.snow += x.snow; o.valid += x.valid; byDate.set(x.date, o); }
  const comp = [...byDate].filter(([, o]) => o.valid > 0).map(([date, o]) => ({ date, season: o.season, frac: o.snow / o.valid })).sort((a, c) => a.date.localeCompare(c.date));
  // GloFAS summer (Jun–Aug) mean flow per year
  const fj = await json(`https://flood-api.open-meteo.com/v1/flood?latitude=${b.flow[0]}&longitude=${b.flow[1]}&daily=river_discharge&start_date=2001-01-01&end_date=${new Date(now.getTime() - 10 * 864e5).toISOString().slice(0, 10)}`);
  const flow = new Map();
  fj.daily.time.forEach((t, i) => { const m = +t.slice(5, 7), v = fj.daily.river_discharge[i]; if (m >= 6 && m <= 8 && v != null) { const y = +t.slice(0, 4); flow.set(y, [...(flow.get(y) ?? []), v]); } });
  const seasons = [...new Set(comp.map((c) => c.season))].sort();
  const history = seasons.map((s) => {
    const all = comp.filter((x) => x.season === s);
    const c = all.filter((x) => x.date.slice(5, 7) !== "04"); // winter index: Nov–Mar
    const mar = all.filter((x) => ["03", "04"].includes(x.date.slice(5, 7))); // spring (melt-season) index: Mar–Apr
    const f = flow.get(s);
    return { year: s, n: c.length, snowIndex: +(mean(c.map((x) => x.frac)) * 100).toFixed(1), marchSnow: mar.length ? +(mean(mar.map((x) => x.frac)) * 100).toFixed(1) : null, summerFlow: f ? Math.round(mean(f)) : null };
  });
  // current season so far vs the same calendar window in past seasons
  const md = (d) => d.slice(5, 10);
  const cur = comp.filter((x) => x.season === curSeasonEnd);
  const lastMd = cur.length ? md(cur[cur.length - 1].date) : null;
  const inWin = (d) => { const m = md(d); return lastMd && (lastMd >= "11-01" ? m >= "11-01" && m <= lastMd : m >= "11-01" || m <= lastMd); };
  const pastWin = seasons.filter((s) => s < curSeasonEnd).map((s) => { const c = comp.filter((x) => x.season === s && inWin(x.date)); return c.length ? mean(c.map((x) => x.frac)) * 100 : null; }).filter((v) => v != null);
  const full = history.filter((h) => h.year < curSeasonEnd && h.n >= 12);
  const pair = full.filter((h) => h.marchSnow != null && h.summerFlow != null);
  out.basins[id] = {
    name: b.name, flowName: b.flowName, box: b.box, history: history.filter((h) => h.year < curSeasonEnd),
    current: { season: `${curSeasonEnd - 1}–${String(curSeasonEnd).slice(2)}`, composites: cur.length, lastDate: cur.length ? cur[cur.length - 1].date : null, snowSoFar: cur.length ? +(mean(cur.map((x) => x.frac)) * 100).toFixed(1) : null, normSoFar: pastWin.length ? +mean(pastWin).toFixed(1) : null },
    correlation: pair.length > 8 ? +pearson(pair.map((h) => h.marchSnow), pair.map((h) => h.summerFlow)).toFixed(2) : null,
    correlationYears: pair.length ? `${pair[0].year}–${pair[pair.length - 1].year}` : null,
  };
  console.log(id, "seasons", full.length, "r", out.basins[id].correlation, "current", out.basins[id].current);
}
writeFileSync("data/ref/water_supply.json", JSON.stringify(out));
console.log("saved data/ref/water_supply.json");
