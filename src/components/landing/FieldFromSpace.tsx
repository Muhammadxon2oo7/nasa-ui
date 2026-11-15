"use client";

import { m } from "motion/react";
import { useEffect, useState } from "react";
import type { AnalyzeResponse } from "@/types/api";
import { DEMO_FIELDS } from "@/data/demoFields";
import { useT } from "@/i18n";
import { SourceBadge } from "../ui";

const Z = 16;
const tileXY = (lat: number, lon: number) => {
  const n = 2 ** Z;
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return [x, y] as const;
};

export function ndviColor(v: number | null) {
  if (v == null) return "var(--surface-3)";
  const stops: [number, number[]][] = [[0, [161, 136, 127]], [0.2, [215, 204, 200]], [0.4, [197, 225, 165]], [0.6, [124, 179, 66]], [0.8, [46, 125, 50]]];
  const t = Math.max(0, Math.min(0.8, v));
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [a, ca] = stops[i - 1], [b, cb] = stops[i];
      const k = (t - a) / (b - a);
      return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * k)).join(" ")})`;
    }
  }
  return "rgb(46 125 50)";
}

/** Real Esri imagery of the Fergana demo field + its Sentinel-2 NDVI history as a calendar strip. */
export function FieldFromSpace() {
  const { lang } = useT();
  const f = DEMO_FIELDS[2];
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  useEffect(() => {
    fetch(`/demo/${f.id}.json`).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
  }, [f.id]);
  const [cx, cy] = tileXY(f.center[0], f.center[1]);
  const tx = Math.floor(cx), ty = Math.floor(cy);
  const ring = f.polygon.coordinates[0].map(([lon, lat]) => {
    const [x, y] = tileXY(lat, lon);
    return [(x - tx + 1) * 256, (y - ty + 1) * 256];
  });
  const years = data ? [...new Set(data.history.ndvi.map((n) => n.date.slice(0, 4)))].slice(-6) : [];
  return (
    <m.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", bounce: 0.12, duration: 0.8, delay: 0.1 }} className="lg relative overflow-hidden rounded-[32px] p-2.5">
      <div className="relative aspect-square overflow-hidden rounded-[24px] bg-[var(--surface-3)]">
        <div className="absolute" style={{ width: 768, height: 768, left: "50%", top: "50%", transform: `translate(${-((cx - tx + 1) * 256)}px, ${-((cy - ty + 1) * 256)}px)` }}>
          {[-1, 0, 1].flatMap((dy) =>
            [-1, 0, 1].map((dx) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={`${dx}${dy}`} alt="" src={`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${ty + dy}/${tx + dx}`} width={256} height={256} className="absolute" style={{ left: (dx + 1) * 256, top: (dy + 1) * 256 }} loading="eager" />
            )),
          )}
          <svg width={768} height={768} className="absolute inset-0">
            <polygon points={ring.map((p) => p.join(",")).join(" ")} fill="rgb(102 187 106 / 0.18)" stroke="#9CFF9F" strokeWidth={3} strokeLinejoin="round" />
          </svg>
        </div>
        <div className="lg absolute top-3 left-3 rounded-full px-3 py-1.5 text-[12px] font-semibold">
          📍 {f.region[lang]} · {data ? `${data.field.areaHa} ${lang === "uz" ? "ga" : "ha"}` : "…"}
        </div>
      </div>
      <div className="px-2 pt-3 pb-1.5">
        <div className="mb-1.5 flex items-center justify-between text-[11.5px] text-[var(--fg-3)]">
          <span>{lang === "uz" ? "NDVI, har oy" : "NDVI, monthly"}</span>
          <SourceBadge source="Sentinel-2 L2A" />
        </div>
        <div className="space-y-1">
          {years.map((y) => (
            <div key={y} className="flex items-center gap-1.5">
              <span className="w-8 text-[10.5px] text-[var(--fg-3)] tnum">{y}</span>
              <div className="grid flex-1 grid-cols-12 gap-[2px]">
                {Array.from({ length: 12 }, (_, i) => {
                  const v = data!.history.ndvi.find((n) => n.date === `${y}-${String(i + 1).padStart(2, "0")}`)?.value ?? null;
                  return <i key={i} className="h-3 rounded-[3px]" style={{ background: ndviColor(v) }} title={v == null ? "–" : v.toFixed(2)} />;
                })}
              </div>
            </div>
          ))}
          {!data && <div className="shimmer h-16 rounded-xl bg-[var(--surface-2)]" />}
        </div>
      </div>
    </m.div>
  );
}
