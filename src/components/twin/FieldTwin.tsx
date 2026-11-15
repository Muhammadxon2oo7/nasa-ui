"use client";

import { clsx } from "clsx";
import { m } from "motion/react";
import { Droplet, FlaskConical, Pause, Play, Sprout, Star } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { AnalyzeResponse, CropId, Level, Strategy } from "@/types/api";
import { CROPS } from "@/data/crops";
import { cropName, monthShort, num } from "@/lib/format";
import { useT } from "@/i18n";
import { spring } from "../ui";
import type { SceneState } from "./Scene3D";

const Scene3D = dynamic(() => import("./Scene3D"), { ssr: false, loading: () => null });

type Mode = "crop" | "water" | "salt";
const BARE = "#8D6E63";
const SALT: Record<Level, string> = { low: "#43A047", medium: "#FB8C00", high: "#E53935" };
export const SERIES_TWIN = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];

/** Which crop stands on the field in a given month of a plan (null = bare). */
export function cropAt(s: Strategy, year: number, month: number): CropId | null {
  const t = Date.UTC(year, month - 1, 15);
  for (const x of s.seasons) {
    if (x.crop === "fallow") continue;
    // seasons carry full ISO dates ("2026-10-05"); older payloads used "mm-dd" + year
    const iso = (v: string, y: number) => (v.length > 5 ? Date.parse(`${v}T00:00:00Z`) : Date.UTC(y, +v.slice(0, 2) - 1, +v.slice(3, 5)));
    const short = x.start.length <= 5;
    const from = iso(x.start, short && x.start > x.end ? x.year - 1 : x.year);
    const to = iso(x.end, x.year);
    if (t >= from && t <= to) return x.crop;
  }
  return null;
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function FieldTwin({ data, list, bestId, autoPlay = false, className }: { data: AnalyzeResponse; list: { s: Strategy; score: number; i: number }[]; bestId: string; autoPlay?: boolean; className?: string }) {
  const { t, lang } = useT();
  const L = (uz: string, en: string) => (lang === "uz" ? uz : en);
  const [mode, setMode] = useState<Mode>("crop");
  const [sid, setSid] = useState(bestId);
  const [idx, setIdx] = useState(() => {
    const now = new Date();
    return Math.max(0, Math.min(35, now.getUTCMonth()));
  });
  const [playing, setPlaying] = useState(false);
  // landing hero: the rotation plays by itself (never under reduced motion)
  useEffect(() => {
    if (autoPlay && !matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(true); // eslint-disable-line react-hooks/set-state-in-effect -- start once after mount
  }, [autoPlay]);
  const [gl, setGl] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setGl(hasWebGL()), []); // eslint-disable-line react-hooks/set-state-in-effect -- capability check after mount

  const st = list.find((x) => x.s.id === sid)?.s ?? list[0].s;
  const years = useMemo(() => [...new Set(st.seasons.map((x) => x.year))].sort().slice(0, 3), [st]);
  const months = useMemo(() => years.flatMap((y) => Array.from({ length: 12 }, (_, i) => ({ y, m: i + 1 }))), [years]);
  const cur = months[Math.min(idx, months.length - 1)] ?? { y: years[0], m: 1 };

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % Math.max(1, months.length)), 420);
    return () => clearInterval(id);
  }, [playing, months.length]);

  const limit = data.water.limitM3PerHa ?? null;
  const state: SceneState = useMemo(() => {
    if (mode === "water") {
      const over = limit != null && st.waterM3PerHa > limit;
      return { color: over ? "#E53935" : "#1E88E5", heightM: st.waterM3PerHa / 100, ghostHeightM: limit ? limit / 100 : null, label: `${num(st.waterM3PerHa)} m³/${L("ga", "ha")}`, sub: limit ? `${L("limit", "limit")} ${num(limit)} ${over ? "⚠️" : "✅"}` : st.id };
    }
    if (mode === "salt") {
      const lv = data.soil.salinityLevel;
      return { color: SALT[lv], heightM: 6, label: `${L("Sho'rlanish", "Salinity")}: ${t(`lvl.${lv}` as never)}`, sub: data.soil.salinityTrendPct != null ? `${L("trend", "trend")} ${data.soil.salinityTrendPct > 0 ? "+" : ""}${data.soil.salinityTrendPct}%` : undefined };
    }
    const c = cropAt(st, cur.y, cur.m);
    return { color: c ? CROPS[c].color : BARE, heightM: c ? 5 : 1, label: c ? cropName(c, lang) : L("Bo'sh dala", "Bare field"), sub: `${monthShort(cur.m, lang)} ${cur.y}` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, st, cur.y, cur.m, lang, limit, data.soil]);

  const maxW = Math.max(...list.map((x) => x.s.waterM3PerHa), limit ?? 0, 1);

  return (
    <div className={clsx("relative h-[clamp(320px,52vh,500px)] overflow-hidden rounded-[26px] bg-[#0d1512] shadow-[var(--shadow-card)]", className)}>
      {gl ? <Scene3D polygon={data.field.polygon} state={state} onReady={() => setLoaded(true)} /> : null}
      {(!loaded || gl === false) && (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,#24412f,#0d1512)] text-[14px] text-white/70">
          {gl === false ? L("3D uchun WebGL kerak", "3D needs WebGL") : <span className="shimmer h-full w-full opacity-30" />}
        </div>
      )}

      {/* mode switch */}
      <div className="lg absolute top-3 left-3 flex gap-0.5 rounded-full p-1" role="tablist" aria-label="3D">
        {([["crop", <><Sprout size={14} /> {L("Ekinlar", "Crops")}</>], ["water", <><Droplet size={14} /> {L("Suv", "Water")}</>], ["salt", <><FlaskConical size={14} /> {L("Sho'r", "Salt")}</>]] as const).map(([k, lbl]) => (
          <button key={k} role="tab" aria-selected={mode === k} type="button" onClick={() => setMode(k)} className={clsx("press relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold", mode === k ? "text-[var(--fg)]" : "text-[var(--fg-2)]")}>
            {mode === k && <m.span layoutId="twin-mode" transition={spring} className="absolute inset-0 -z-10 rounded-full bg-[var(--surface)]" />}
            {lbl}
          </button>
        ))}
      </div>

      {/* strategy chips (crop + water) */}
      {mode !== "salt" && (
        <div className="lg absolute top-[58px] right-3 flex gap-1 rounded-full p-1 sm:top-3">
          {list.map((x) => (
            <button key={x.s.id} type="button" onClick={() => setSid(x.s.id)} aria-pressed={sid === x.s.id} title={x.s.name} className={clsx("press flex h-8 min-w-8 items-center justify-center gap-1 rounded-full px-2 text-[13px] font-bold", sid === x.s.id ? "bg-[var(--fg)] text-[var(--bg)]" : "text-[var(--fg)]")}>
              <i className="h-2 w-2 rounded-full" style={{ background: SERIES_TWIN[x.i] }} />
              {x.s.id}
              {x.s.id === bestId && <Star size={11} className="fill-current" aria-hidden />}
            </button>
          ))}
        </div>
      )}

      {/* bottom panel */}
      <div className="lg absolute inset-x-3 bottom-3 rounded-[20px] p-2.5">
        {mode === "crop" && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"} className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-fill)] text-white">
              {playing ? <Pause size={17} /> : <Play size={17} className="translate-x-[1px]" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex h-7 gap-[2px]" role="slider" aria-label={L("Oy", "Month")} aria-valuemin={0} aria-valuemax={months.length - 1} aria-valuenow={idx} tabIndex={0} onKeyDown={(e) => (e.key === "ArrowRight" ? setIdx((i) => Math.min(months.length - 1, i + 1)) : e.key === "ArrowLeft" ? setIdx((i) => Math.max(0, i - 1)) : null)}>
                {months.map((mm, i) => {
                  const c = cropAt(st, mm.y, mm.m);
                  return (
                    <button key={i} type="button" tabIndex={-1} onClick={() => (setIdx(i), setPlaying(false))} title={`${monthShort(mm.m, lang)} ${mm.y}: ${c ? cropName(c, lang) : L("bo'sh", "bare")}`} className={clsx("flex-1 rounded-[4px] transition-transform", i === idx ? "scale-y-[1.25] ring-2 ring-white" : "opacity-85")} style={{ background: c ? CROPS[c].color : BARE }} />
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-[11px] font-semibold text-[var(--fg-2)]">
                {years.map((y) => (
                  <span key={y}>{y}</span>
                ))}
              </div>
            </div>
          </div>
        )}
        {mode === "water" && (
          <div className="flex items-end gap-2">
            {list.map((x) => {
              const over = limit != null && x.s.waterM3PerHa > limit;
              return (
                <button key={x.s.id} type="button" onClick={() => setSid(x.s.id)} className={clsx("press flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1", sid === x.s.id && "bg-[var(--surface)]/70")}>
                  <div className="relative h-12 w-full max-w-[56px] overflow-hidden rounded-[8px] bg-[var(--surface-3)]/70">
                    <m.div initial={{ height: 0 }} animate={{ height: `${(x.s.waterM3PerHa / maxW) * 100}%` }} transition={spring} className="absolute inset-x-0 bottom-0 rounded-t-[4px]" style={{ background: over ? "#E53935" : "#1E88E5" }} />
                    {limit && <div className="absolute inset-x-0 border-t-2 border-dashed border-white/90" style={{ bottom: `${(limit / maxW) * 100}%` }} />}
                  </div>
                  <span className="text-[11.5px] font-bold tnum">
                    {x.s.id} · {num(Math.round(x.s.waterM3PerHa / 100) / 10, 1)}k
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {mode === "salt" && (
          <div className="flex items-center gap-3 px-1 text-[13px]">
            {(["low", "medium", "high"] as const).map((lv) => (
              <span key={lv} className={clsx("flex items-center gap-1.5", data.soil.salinityLevel === lv ? "font-bold" : "opacity-60")}>
                <i className="h-3 w-3 rounded-full" style={{ background: SALT[lv] }} /> {t(`lvl.${lv}` as never)}
              </span>
            ))}
            <span className="ml-auto text-[12px] text-[var(--fg-3)]">{data.soil.isEstimated ? "Sentinel-2" : L("Laboratoriya", "Lab")}</span>
          </div>
        )}
        <div className="mt-1 text-right text-[10px] text-[var(--fg-3)]">Imagery © Esri, Maxar · Terrain © Mapterhorn</div>
      </div>
    </div>
  );
}
