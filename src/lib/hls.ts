/**
 * NASA HLS (Harmonized Landsat 8/9 + Sentinel-2, 30 m) scene finder for one field.
 *
 * GIBS publishes HLS as daily true-colour tiles, but a given day only has data where a
 * satellite passed, and many passes are cloudy. We probe the single z12 tile that holds
 * the field, read the pixels around the field centre and keep only dates where that
 * neighbourhood is covered and mostly cloud-free. Everything runs in the browser
 * (GIBS sends `Access-Control-Allow-Origin: *`), so no backend is involved.
 */

export type HlsSensor = "L30" | "S30";
export type HlsScene = { date: string; sensor: HlsSensor; cloudPct: number; contrast: number };

export const HLS_LAYER: Record<HlsSensor, string> = {
  L30: "HLS_L30_Nadir_BRDF_Adjusted_Reflectance",
  S30: "HLS_S30_Nadir_BRDF_Adjusted_Reflectance",
};
export const HLS_SENSOR_NAME: Record<HlsSensor, string> = { L30: "Landsat 8/9", S30: "Sentinel-2" };
export const HLS_TMS = "GoogleMapsCompatible_Level12";
export const hlsUrl = (s: HlsSensor, date: string) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${HLS_LAYER[s]}/default/${date}/${HLS_TMS}/{z}/{y}/{x}.png`;

const Z = 12;
const MIN_BYTES = 20_000; // empty / no-pass tiles are a few hundred bytes
const MAX_NODATA = 0.25; // share of transparent pixels around the field
const MAX_CLOUD = 0.3; // share of bright, white pixels around the field
const MIN_CONTRAST = 11; // luminance std-dev; hazy scenes sit around 4-8

function tileOf(lat: number, lon: number) {
  const n = 2 ** Z;
  const fx = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const x = Math.floor(fx), y = Math.floor(fy);
  return { x, y, px: Math.round((fx - x) * 256), py: Math.round((fy - y) * 256) };
}

async function inspect(url: string, px: number, py: number, signal: AbortSignal): Promise<{ cloudPct: number; contrast: number } | null> {
  // low priority: this is background scouting and must never queue ahead of the visible map tiles
  const res = await fetch(url, { signal, mode: "cors", priority: "low" } as RequestInit);
  if (!res.ok) return null;
  const blob = await res.blob();
  if (blob.size < MIN_BYTES) return null;
  const bmp = await createImageBitmap(blob);
  const R = 22; // ~650 m window at 30 m/px: the field and its immediate surroundings
  const x0 = Math.max(0, px - R), y0 = Math.max(0, py - R);
  const w = Math.min(256, px + R) - x0, h = Math.min(256, py + R) - y0;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(bmp, x0, y0, w, h, 0, 0, w, h);
  bmp.close();
  const d = g.getImageData(0, 0, w, h).data;
  let none = 0, cloud = 0, sum = 0, sum2 = 0;
  const total = w * h;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 16) {
      none++;
      continue;
    }
    if (d[i] > 175 && d[i + 1] > 175 && d[i + 2] > 175) cloud++;
    const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    sum += y;
    sum2 += y * y;
  }
  const n = Math.max(1, total - none);
  if (none / total > MAX_NODATA) return null;
  const cloudShare = cloud / n;
  // haze and thin cloud flatten the field pattern: low luminance spread = not worth showing
  const contrast = Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2));
  if (cloudShare > MAX_CLOUD || contrast < MIN_CONTRAST) return null;
  return { cloudPct: Math.round(cloudShare * 100), contrast: Math.round(contrast) };
}

const memo = new Map<string, HlsScene[]>();

/**
 * One clear scene per month for the last `months` months (oldest first), so the timeline
 * walks through a whole season: ploughing, green-up, harvest, bare winter.
 * Inside each month we try days nearest the 15th first and stop at the first clear pass.
 */
export async function findHlsScenes(lat: number, lon: number, opts: { months?: number; signal: AbortSignal; onProgress?: (found: HlsScene[]) => void }): Promise<HlsScene[]> {
  const { months = 12, signal, onProgress } = opts;
  const key = `${lat.toFixed(4)},${lon.toFixed(4)},${months}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const { x, y, px, py } = tileOf(lat, lon);
  const latest = Date.now() - 2 * 864e5;
  const found: HlsScene[] = [];
  const emit = () => onProgress?.([...found].sort((a, b) => a.date.localeCompare(b.date)));

  const scanMonth = async (back: number) => {
    const now = new Date(latest);
    const y0 = now.getUTCFullYear(), m0 = now.getUTCMonth() - back;
    const order = [15, 14, 16, 13, 17, 12, 18, 11, 19, 10, 20, 9, 21, 8, 22, 7, 23, 6, 24, 5, 25, 4, 26, 3, 27, 2, 28];
    const days = order.map((d) => new Date(Date.UTC(y0, m0, d))).filter((d) => d.getTime() <= latest).map((d) => d.toISOString().slice(0, 10));
    for (let i = 0; i < days.length; i += 2) {
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      const tries = days.slice(i, i + 2).flatMap((date) => (["S30", "L30"] as const).map((sensor) => ({ date, sensor })));
      const out = await Promise.all(
        tries.map((j) =>
          inspect(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${HLS_LAYER[j.sensor]}/default/${j.date}/${HLS_TMS}/${Z}/${y}/${x}.png`, px, py, signal)
            .then((q) => (q == null ? null : { ...j, ...q }))
            .catch((e) => {
              if ((e as Error).name === "AbortError") throw e;
              return null;
            }),
        ),
      );
      const best = out.filter((o): o is HlsScene => !!o).sort((a, b) => b.contrast - a.contrast || a.cloudPct - b.cloudPct)[0];
      if (best) {
        found.push(best);
        emit();
        return;
      }
    }
  };

  // two months at a time (≤ 8 requests in flight) leaves the network to the map the user is looking at
  const queue = Array.from({ length: months }, (_, i) => i);
  await new Promise((r) => setTimeout(r, 900));
  await Promise.all(
    Array.from({ length: 2 }, async () => {
      while (queue.length) await scanMonth(queue.shift()!);
    }),
  );
  const res = [...found].sort((a, b) => a.date.localeCompare(b.date));
  memo.set(key, res);
  return res;
}
