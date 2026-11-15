// N9: FAO GAEZ v4 (theme 4, 1981–2010, high input) suitability index + attainable yield, clipped to Uzbekistan.
// Usage: node scripts/build-gaez.mjs → data/ref/gaez.json  (grid 5′ ≈ 9 km; values as published, no rescaling except SI/100)
import { fromUrl } from "geotiff";
import { writeFileSync } from "node:fs";

const BASE = "https://s3.eu-west-1.amazonaws.com/data.gaezdev.aws.fao.org/res05/CRUTS32/Hist/8110H";
const CROPS = { winter_wheat: "whe", cotton: "cot", alfalfa: "alf", sunflower: "sfl", barley: "brl", sorghum: "srg", maize: "mze", rice: "rcw" };
const BOX = [55.9, 37.1, 73.2, 45.6]; // minLon, minLat, maxLon, maxLat
const out = { source: "FAO & IIASA GAEZ v4, theme 4 (1981–2010, high input)", url: "https://gaez.fao.org", box: BOX, layers: {} };

for (const [crop, code] of Object.entries(CROPS)) {
  for (const regime of ["i", "r"]) {
    for (const kind of ["su", "yl"]) {
      const name = `${kind}H${regime}_${code}`;
      try {
        const tif = await fromUrl(`${BASE}/${name}.tif`);
        const img = await tif.getImage();
        const [x0, y1] = [img.getOrigin()[0], img.getOrigin()[1]];
        const [rx, ry] = img.getResolution();
        const c0 = Math.floor((BOX[0] - x0) / rx), c1 = Math.ceil((BOX[2] - x0) / rx);
        const r0 = Math.floor((BOX[3] - y1) / ry), r1 = Math.ceil((BOX[1] - y1) / ry);
        const [band] = await img.readRasters({ window: [c0, r0, c1, r1] });
        const nodata = img.getGDALNoData();
        const vals = Array.from(band, (v) => (v === nodata || v < 0 ? null : kind === "su" ? Math.round(v / 100) : Math.round(v)));
        out.layers[`${crop}_${regime === "i" ? "irrigated" : "rainfed"}_${kind}`] = { w: c1 - c0, h: r1 - r0, lon0: x0 + c0 * rx, lat0: y1 + r0 * ry, rx, ry, v: vals };
        console.log(name, c1 - c0, "x", r1 - r0, "max", Math.max(...vals.filter((x) => x != null)));
      } catch (e) {
        console.log(name, "unavailable", e.message?.slice(0, 60));
      }
    }
  }
}
writeFileSync("data/ref/gaez.json", JSON.stringify(out));
console.log("saved data/ref/gaez.json");
