"use client";

import { clsx } from "clsx";
import type { ReactNode } from "react";

/**
 * The user's own field from orbit: Esri imagery exported in EPSG:4326 (so the outline maps linearly)
 * with the drawn boundary on top. `scan` adds the satellite pass used while the analysis runs.
 */
export function FieldSnapshot({ polygon, className, scan, children, ratio = 16 / 10 }: { polygon: GeoJSON.Polygon; className?: string; scan?: boolean; children?: ReactNode; ratio?: number }) {
  const ring = polygon.coordinates[0];
  const lons = ring.map((p) => p[0]), lats = ring.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const pad = Math.max(x1 - x0, y1 - y0) * 0.9;
  const W = 800, H = Math.round(W / ratio);
  const k = Math.cos(((y0 + y1) / 2) * (Math.PI / 180));
  let bx0 = x0 - pad, bx1 = x1 + pad, by0 = y0 - pad, by1 = y1 + pad;
  const wantW = ((by1 - by0) * W) / H / k;
  if (bx1 - bx0 < wantW) {
    const c = (bx0 + bx1) / 2;
    bx0 = c - wantW / 2;
    bx1 = c + wantW / 2;
  } else {
    const c = (by0 + by1) / 2, h = ((bx1 - bx0) * H * k) / W;
    by0 = c - h / 2;
    by1 = c + h / 2;
  }
  const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${bx0},${by0},${bx1},${by1}&bboxSR=4326&imageSR=4326&size=${W},${H}&format=jpg&f=image`;
  const pts = ring.map(([lo, la]) => `${((lo - bx0) / (bx1 - bx0)) * W},${((by1 - la) / (by1 - by0)) * H}`).join(" ");
  return (
    <div className={clsx("relative overflow-hidden rounded-[22px] bg-[#0d1512]", className)} style={{ aspectRatio: `${W} / ${H}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- one static export image */}
      <img src={url} alt="" width={W} height={H} className="absolute inset-0 h-full w-full object-cover" />
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
        {scan && (
          <defs>
            <pattern id="fs-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="1" />
            </pattern>
          </defs>
        )}
        {scan && <rect width={W} height={H} fill="url(#fs-grid)" />}
        <polygon points={pts} fill="rgb(67 160 71 / 0.22)" stroke="#fff" strokeWidth={3} strokeLinejoin="round" className={scan ? "fs-outline" : undefined} />
      </svg>
      {scan && <div className="fs-scan pointer-events-none absolute inset-x-0 h-24" aria-hidden />}
      <span className="absolute right-2 bottom-1 text-[11px] text-white/75 [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">Imagery © Esri, Maxar</span>
      {children}
    </div>
  );
}
