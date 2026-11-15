// Builds public/demo/*.json from REAL analyses of the 4 pilot fields (plan ADR-8).
// Usage: npm run dev, then: node scripts/build-demo.mjs [http://localhost:3000]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3000";
const sq = (lat, lon, w = 0.0045, h = 0.0028) => ({ type: "Polygon", coordinates: [[[lon, lat], [lon + w, lat], [lon + w, lat + h], [lon, lat + h], [lon, lat]]] });
// small family herd sized to the ~12 ha pilot field (pasture NDVI stats use a 1 km square)
const LIVESTOCK = { herd: { cattle: 2, smallRuminants: 10, horses: 0 }, grazingFrom: 4, grazingTo: 10, pastureType: "natural", hasWaterOnSite: false, priorities: ["conserve", "heat"] };
const PILOTS = {
  sirdaryo: { c: [40.502, 68.686], priorities: ["salinity", "water", "income"], water: "medium" },
  xorazm: { c: [41.496, 60.614], priorities: ["water", "income"], water: "low" },
  fargona: { c: [40.5, 71.686], priorities: ["income", "soil"], water: "high" },
  jizzax: { c: [39.97, 67.55], priorities: ["water", "soil"], water: "low" },
};
mkdirSync("public/demo", { recursive: true });
mkdirSync("data/demo-inputs", { recursive: true });
for (const [id, p] of Object.entries(PILOTS)) {
  const req = { polygon: sq(...p.c), rotation: [2023, 2024, 2025].map((year) => ({ year, crop: null, secondCrop: null })), priorities: p.priorities, water: { availability: p.water, method: "furrow" }, soil: {}, lang: "uz", modules: ["crop", "livestock"], livestock: LIVESTOCK };
  const t = Date.now();
  const r = await fetch(`${base}/api/analyze`, { method: "POST", headers: { "Content-Type": "application/json", "x-demo-id": `demo-${id}` }, body: JSON.stringify(req) });
  const j = await r.json();
  if (!r.ok) {
    console.error(id, j);
    continue;
  }
  writeFileSync(`public/demo/${id}.json`, JSON.stringify(j));
  writeFileSync(`public/demo/${id}.req.json`, JSON.stringify(req));
  const inputs = JSON.parse(readFileSync(`.cache/fields/demo-${id}.json`, "utf8")).v;
  writeFileSync(`data/demo-inputs/${id}.json`, JSON.stringify(inputs));
  console.log(`${id}: ${((Date.now() - t) / 1000).toFixed(1)} s, best ${j.summary.bestStrategyId}, degraded ${j.degraded ?? "-"}`);
}
// offline land selection (FRONTEND_REJASI demo: 3 places side by side), one file per goal
const NAMES = { sirdaryo: "Sirdaryo", jizzax: "Jizzax", fargona: "Farg'ona" };
for (const goal of ["winter_wheat", "cotton", "alfalfa", "pasture", "general"]) {
  const places = Object.entries(NAMES).map(([id, name]) => ({ name, polygon: sq(...PILOTS[id].c) }));
  const r = await fetch(`${base}/api/compare`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ places, goal, lang: "uz" }) });
  const j = await r.json();
  if (!r.ok) console.error("compare", goal, j);
  else {
    writeFileSync(`public/demo/compare-${goal}.json`, JSON.stringify(j));
    console.log(`compare ${goal}: best ${j.places.find((p) => p.placeId === j.bestPlaceId)?.name}`);
  }
}
const models = await (await fetch(`${base}/api/models`)).json();
writeFileSync("public/demo/models.json", JSON.stringify(models));
