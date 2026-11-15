"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Layer =
  | { type: "line"; id: string; label: string; values: (number | null)[]; color: string; dash?: boolean; width?: number; dots?: boolean }
  | { type: "band"; id: string; label: string; lo: (number | null)[]; hi: (number | null)[]; color: string; opacity?: number }
  | { type: "bars"; id: string; label: string; values: (number | null)[]; color: string; stack?: string; signColor?: { neg: string; pos: string } }
  | { type: "hline"; id: string; label: string; value: number; color: string; dash?: boolean };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(220, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function nice(v: number) {
  if (v === 0) return 0;
  const s = Math.sign(v);
  const a = Math.abs(v);
  const p = 10 ** Math.floor(Math.log10(a));
  const n = a / p;
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => n <= x) ?? 10;
  return s * step * p;
}

/**
 * One y-axis chart (no dual axes). Thin 2px lines, rounded bars with a 2px gap, recessive grid,
 * crosshair + tooltip on hover/touch. Text uses theme tokens, never series colors.
 */
export function XYChart({
  labels,
  layers,
  height = 240,
  unit = "",
  digits = 0,
  yMin,
  yMax,
  legend = true,
  ariaLabel,
  tickEvery,
  zeroLine,
}: {
  labels: string[];
  layers: Layer[];
  height?: number;
  unit?: string;
  digits?: number;
  yMin?: number;
  yMax?: number;
  legend?: boolean;
  ariaLabel: string;
  tickEvery?: number;
  zeroLine?: boolean;
}) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const padL = 40, padR = 10, padT = 10, padB = 24;
  const hasBars = layers.some((l) => l.type === "bars");

  const { lo, hi } = useMemo(() => {
    const vals: number[] = [];
    const stacks = new Map<string, number[]>();
    for (const l of layers) {
      if (l.type === "line") l.values.forEach((v) => v != null && Number.isFinite(v) && vals.push(v));
      if (l.type === "band") [...l.lo, ...l.hi].forEach((v) => v != null && Number.isFinite(v) && vals.push(v));
      if (l.type === "hline") vals.push(l.value);
      if (l.type === "bars") {
        if (l.stack) {
          const acc = stacks.get(l.stack) ?? new Array(n).fill(0);
          l.values.forEach((v, i) => (acc[i] += v ?? 0));
          stacks.set(l.stack, acc);
        } else l.values.forEach((v) => v != null && vals.push(v));
      }
    }
    for (const a of stacks.values()) vals.push(...a);
    if (hasBars) vals.push(0);
    const mn = yMin ?? Math.min(...vals);
    const mx = yMax ?? Math.max(...vals);
    return { lo: yMin ?? (mn < 0 ? nice(mn) : Math.min(0, mn) === 0 && hasBars ? 0 : Math.floor(mn)), hi: yMax ?? nice(mx === mn ? mx + 1 : mx) };
  }, [layers, n, yMin, yMax, hasBars]);

  const iw = w - padL - padR;
  const ih = height - padT - padB;
  const slot = iw / Math.max(1, n);
  const x = (i: number) => (hasBars ? padL + slot * (i + 0.5) : padL + (i / Math.max(1, n - 1)) * iw);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * ih;
  const ticks = [lo, lo + (hi - lo) / 2, hi];
  const every = tickEvery ?? Math.max(1, Math.ceil(n / Math.max(3, Math.floor(iw / 52))));

  const path = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const area = (a: (number | null)[], b: (number | null)[]) => {
    const pts: string[] = [];
    a.forEach((v, i) => v != null && b[i] != null && pts.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`));
    const back: string[] = [];
    b.forEach((v, i) => v != null && a[i] != null && back.unshift(`${x(i).toFixed(1)},${y(v).toFixed(1)}`));
    return pts.length ? `M${pts.join("L")}L${back.join("L")}Z` : "";
  };

  const barLayers = layers.filter((l): l is Extract<Layer, { type: "bars" }> => l.type === "bars");
  const groups = [...new Set(barLayers.map((b) => b.stack ?? b.id))];
  const bw = Math.max(2, Math.min(28, (slot - 4) / Math.max(1, groups.length) - 2));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = hasBars ? Math.floor((px - padL) / slot) : Math.round(((px - padL) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const fmt = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "–" : `${v.toFixed(digits)}${unit}`);

  return (
    <div ref={ref} className="relative w-full select-none">
      <svg width={w} height={height} className="block touch-pan-y" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={ariaLabel}>
        {ticks.map((tv) => (
          <g key={tv}>
            <line x1={padL} x2={w - padR} y1={y(tv)} y2={y(tv)} stroke="var(--hairline)" />
            <text x={padL - 6} y={y(tv) + 3.5} textAnchor="end" className="fill-[var(--fg-3)] text-[10.5px] tnum">
              {Math.abs(tv) >= 1000 ? `${(tv / 1000).toFixed(tv % 1000 ? 1 : 0)}k` : tv.toFixed(Math.abs(hi - lo) < 3 ? 1 : 0)}
            </text>
          </g>
        ))}
        {zeroLine && lo < 0 && <line x1={padL} x2={w - padR} y1={y(0)} y2={y(0)} stroke="var(--hairline-strong)" />}
        {labels.map((l, i) =>
          i % every === 0 && x(i) < w - 18 ? (
            <text key={i} x={x(i)} y={height - 7} textAnchor={hasBars ? "middle" : i === 0 ? "start" : "middle"} className="fill-[var(--fg-3)] text-[10.5px]">
              {l}
            </text>
          ) : null,
        )}
        {layers.map((l) => {
          if (l.type === "band") return <path key={l.id} d={area(l.lo, l.hi)} fill={l.color} opacity={l.opacity ?? 0.18} />;
          if (l.type === "hline")
            return <line key={l.id} x1={padL} x2={w - padR} y1={y(l.value)} y2={y(l.value)} stroke={l.color} strokeWidth={1.5} strokeDasharray={l.dash ? "5 4" : undefined} />;
          return null;
        })}
        {groups.map((g, gi) => {
          const members = barLayers.filter((b) => (b.stack ?? b.id) === g);
          const base = new Array(n).fill(0);
          return members.map((b) => (
            <g key={b.id}>
              {b.values.map((v, i) => {
                if (v == null || !Number.isFinite(v) || v === 0) return null;
                const y0 = base[i];
                base[i] += v;
                const top = y(Math.max(y0, y0 + v)), bot = y(Math.min(y0, y0 + v));
                const xx = x(i) - (groups.length * (bw + 2)) / 2 + gi * (bw + 2) + 1;
                const color = b.signColor ? (v < 0 ? b.signColor.neg : b.signColor.pos) : b.color;
                return <rect key={i} x={xx} y={top} width={bw} height={Math.max(1, bot - top - (members.length > 1 ? 1 : 0))} rx={Math.min(4, bw / 2)} fill={color} opacity={hover == null || hover === i ? 1 : 0.6} />;
              })}
            </g>
          ));
        })}
        {layers.map((l) =>
          l.type === "line" ? (
            <g key={l.id}>
              <path d={path(l.values)} fill="none" stroke={l.color} strokeWidth={l.width ?? 2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={l.dash ? "5 4" : undefined} />
              {l.dots && l.values.map((v, i) => (v != null ? <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={l.color} stroke="var(--surface)" strokeWidth={1.5} /> : null))}
            </g>
          ) : null,
        )}
        {hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={height - padB} stroke="var(--hairline-strong)" />
            {layers.map((l) => (l.type === "line" && l.values[hover] != null ? <circle key={l.id} cx={x(hover)} cy={y(l.values[hover] as number)} r={4} fill={l.color} stroke="var(--surface)" strokeWidth={2} /> : null))}
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute top-1 z-10 min-w-[140px] rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-2.5 py-1.5 text-[11.5px] shadow-[var(--shadow-float)]" style={{ left: Math.min(w - 170, Math.max(0, x(hover) + 10)) }}>
          <div className="mb-0.5 font-semibold text-[var(--fg)]">{labels[hover]}</div>
          {layers.map((l) => {
            const v = l.type === "line" || l.type === "bars" ? l.values[hover] : l.type === "band" ? null : l.value;
            if (l.type === "band")
              return (
                <Row key={l.id} color={l.color} label={l.label} value={`${fmt(l.lo[hover])} – ${fmt(l.hi[hover])}`} />
              );
            return <Row key={l.id} color={l.color} label={l.label} value={fmt(v)} />;
          })}
        </div>
      )}
      {legend && layers.length > 1 && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-[var(--fg-2)]">
          {layers.map((l) => (
            <span key={l.id} className="flex items-center gap-1.5">
              <i className="inline-block rounded-full" style={{ background: l.color, width: l.type === "bars" || l.type === "band" ? 10 : 14, height: l.type === "bars" || l.type === "band" ? 10 : 3, opacity: l.type === "band" ? 0.5 : 1 }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[var(--fg-2)]">
      <span className="flex items-center gap-1.5">
        <i className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="font-medium tnum text-[var(--fg)]">{value}</span>
    </div>
  );
}

/** Radar for strategy comparison (≤ 4 series, legend + direct labels on axes). */
export function Radar({ axes, series, size = 300 }: { axes: string[]; series: { id: string; label: string; color: string; values: number[] }[]; size?: number }) {
  const [ref, w] = useWidth();
  const s = Math.min(size, w);
  const c = s / 2, r = s / 2 - 46;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i / axes.length) * Math.PI * 2;
    return [c + Math.cos(a) * r * (v / 100), c + Math.sin(a) * r * (v / 100)] as const;
  };
  return (
    <div ref={ref} className="w-full">
      <svg width={s} height={s} className="mx-auto block" role="img" aria-label="Radar">
        {[25, 50, 75, 100].map((g) => (
          <polygon key={g} points={axes.map((_, i) => pt(i, g).join(",")).join(" ")} fill="none" stroke="var(--hairline)" />
        ))}
        {axes.map((a, i) => {
          const [x2, y2] = pt(i, 100);
          const [lx, ly] = pt(i, 122);
          return (
            <g key={a}>
              <line x1={c} y1={c} x2={x2} y2={y2} stroke="var(--hairline)" />
              <text x={lx} y={ly + 3} textAnchor="middle" className="fill-[var(--fg-2)] text-[11px]">
                {a}
              </text>
            </g>
          );
        })}
        {series.map((sr) => (
          <polygon key={sr.id} points={sr.values.map((v, i) => pt(i, v).join(",")).join(" ")} fill={sr.color} fillOpacity={0.1} stroke={sr.color} strokeWidth={2} strokeLinejoin="round" />
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[12px] text-[var(--fg-2)]">
        {series.map((sr) => (
          <span key={sr.id} className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-full" style={{ background: sr.color }} />
            {sr.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Tiny monthly sparkline-bars used inside strategy details. */
export function MiniBars({ values, color, labels }: { values: number[]; color: string; labels: string[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-16 items-end gap-[3px]" role="img" aria-label="monthly">
      {values.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${labels[i]}: ${Math.round(v)}`}>
          <div className="w-full rounded-t-[4px]" style={{ height: `${Math.max(2, (v / max) * 48)}px`, background: color, opacity: v ? 1 : 0.25 }} />
          <span className="text-[9px] text-[var(--fg-3)]">{labels[i].slice(0, 1)}</span>
        </div>
      ))}
    </div>
  );
}
