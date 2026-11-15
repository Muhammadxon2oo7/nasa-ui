"use client";

import { clsx } from "clsx";
import { m } from "motion/react";
import { ChevronRight, Compass, FileQuestion, ListChecks, ShieldAlert, Sprout } from "lucide-react";
import dynamic from "next/dynamic";
import type { AnalyzeResponse, LivestockData, MaybeNumber, Recommendation } from "@/types/api";
import { isUnknown } from "@/types/api";
import { monthShort, num } from "@/lib/format";
import { useT, type Key } from "@/i18n";
import { useMode } from "@/store/platformStore";
import { XYChart } from "../charts";
import { Button, Card, CardTitle, EmptyState, SourceBadge, spring } from "../ui";
import { UnknownValue } from "./Unknown";
import { G } from "@/components/Glyph";

const FieldMap = dynamic(() => import("../map/FieldMap"), { ssr: false, loading: () => <div className="shimmer h-full w-full bg-[var(--surface-2)]" /> });

const LVL_COLOR = { low: "var(--level-high)", medium: "var(--level-medium)", high: "var(--level-low)" } as const; // low pasture = bad = red

export function MaybeNum({ v, unit, digits = 0 }: { v: MaybeNumber | undefined; unit?: string; digits?: number }) {
  if (v == null) return <span>-</span>;
  if (isUnknown(v)) return <UnknownValue reason={v.reason} />;
  return (
    <span className="tnum">
      {num(v, digits)}
      {unit && <span className="ml-1 text-[0.6em] font-medium text-[var(--fg-3)]">{unit}</span>}
    </span>
  );
}

function NoModule() {
  const { lang } = useT();
  return <EmptyState icon={<G e="🐄" />} title={lang === "uz" ? "Chorvachilik moduli hisoblanmagan" : "Livestock module not computed"} />;
}

/* ------------------------------------------------------------------ pasture */

export function PastureTab({ data }: { data: AnalyzeResponse }) {
  const { t, lang } = useT();
  const ls = data.livestock;
  if (!ls) return <NoModule />;
  const p = ls.pasture;
  const months = Array.from({ length: 12 }, (_, i) => monthShort(i + 1, lang));
  const a = p.anomalyPct, pc = p.percentile;
  const peaks = p.yearlyPeak;
  const n = peaks.length;
  const xs = peaks.map((q) => q.year), ys = peaks.map((q) => q.ndvi);
  const mx = xs.reduce((s, v) => s + v, 0) / Math.max(1, n), my = ys.reduce((s, v) => s + v, 0) / Math.max(1, n);
  const b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / Math.max(1e-9, xs.reduce((s, x) => s + (x - mx) ** 2, 0));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[34px]" aria-hidden><G e="🌿" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-[var(--fg-3)]">{t("ls.status")}</div>
            <div className="text-[24px] font-semibold tracking-[-0.02em] uppercase" style={{ color: LVL_COLOR[p.statusLevel] }}>
              {t(`ls.lvl.${p.statusLevel}` as Key)}
            </div>
            <div className="text-[14px] text-[var(--fg-2)]">
              {isUnknown(a) || isUnknown(pc) ? <UnknownValue reason={isUnknown(a) ? a.reason : (pc as { reason: string }).reason} /> : t("ls.anomaly", { a: `${(a as number) > 0 ? "+" : ""}${a}`, p: pc as number })}
            </div>
          </div>
          <SourceBadge source={`MODIS NDVI · 2005-${p.year - 1}`} />
        </div>
        <p className="mt-2 text-[12px] text-[var(--fg-3)]">{t("ls.statsArea", { a: p.areaHa })}</p>
      </Card>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle info="ndvi">{t("ls.normChart", { y: p.year })}</CardTitle>
          <XYChart
            ariaLabel="NDVI norm"
            labels={months}
            yMin={0}
            yMax={0.8}
            digits={2}
            layers={[
              { type: "band", id: "n", label: "P10-P90", lo: p.ndviNorm.map((x) => x.p10), hi: p.ndviNorm.map((x) => x.p90), color: "var(--accent-fill)", opacity: 0.16 },
              { type: "line", id: "m", label: lang === "uz" ? "Median" : "Median", values: p.ndviNorm.map((x) => x.p50), color: "var(--fg-3)", dash: true },
              { type: "line", id: "y", label: String(p.year), values: p.ndviThisYear.map((x) => x.value), color: "var(--accent-fill)", dots: true, width: 2.5 },
            ]}
          />
        </Card>
        <Card>
          <CardTitle source="MODIS NDVI">{t("ls.peakChart")}</CardTitle>
          <XYChart ariaLabel="peak" labels={xs.map(String)} digits={2} yMin={0} legend={false} layers={[{ type: "bars", id: "pk", label: "NDVI", values: ys, color: "var(--s3)" }, { type: "line", id: "tr", label: "trend", values: xs.map((x) => my + b * (x - mx)), color: "var(--fg-2)", dash: true }]} />
        </Card>
      </div>
      <p className="rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-[14px]">{p.droughtYears.length ? t("ls.drought", { y: p.droughtYears.slice(-3).join(", ") }) : t("ls.noDrought")}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ capacity + advice */

export function CapacityTab({ data, onCrop }: { data: AnalyzeResponse; onCrop: () => void }) {
  const { t } = useT();
  const ls = data.livestock;
  if (!ls) return <NoModule />;
  const c = ls.capacity;
  const area = data.field.areaHa;
  const lo = typeof c.lowAuPerHa === "number" ? c.lowAuPerHa : null, hi = typeof c.highAuPerHa === "number" ? c.highAuPerHa : null;
  const tone = { ok: "text-[var(--accent)]", warn: "text-[var(--level-medium-fg)]", over: "text-[var(--danger-fg)]", unknown: "text-[var(--fg-3)]" }[c.status];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <Card>
        <CardTitle source="MODIS MOD17A3HGF NPP">{t("ls.cap")}</CardTitle>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl bg-[var(--surface-2)] p-3">
            <div className="text-[12px] text-[var(--fg-3)]">{t("ls.cap")}</div>
            <div className="text-[24px] font-semibold tracking-[-0.02em]">
              {lo != null && hi != null ? <span className="tnum">{num(lo, 2)} - {num(hi, 2)}</span> : <MaybeNum v={c.lowAuPerHa} />}
            </div>
            <div className="text-[12px] text-[var(--fg-3)]">{t("ls.capUnit")}</div>
          </div>
          <div className="rounded-2xl bg-[var(--surface-2)] p-3">
            <div className="text-[12px] text-[var(--fg-3)]">{t("ls.yourPasture", { a: num(area, 1) })}</div>
            <div className="text-[24px] font-semibold tracking-[-0.02em] tnum">{lo != null && hi != null ? `~${Math.round(lo * area)} - ${Math.round(hi * area)}` : <G e="❓" />}</div>
            <div className="text-[12px] text-[var(--fg-3)]">{t("ls.capUnit").split("/")[0]}</div>
          </div>
          <div className="rounded-2xl bg-[var(--surface-2)] p-3">
            <div className="text-[12px] text-[var(--fg-3)]">{t("ls.yourHerd")}</div>
            <div className="text-[24px] font-semibold tracking-[-0.02em] tnum">{num(c.herdAu, 1)}</div>
            <div className={clsx("text-[13px] font-semibold", tone)}>{c.status === "over" ? "" : c.status === "ok" ? "" : ""}{t(`ls.st.${c.status}` as Key)}</div>
          </div>
        </div>
        <details className="disclosure mt-3 rounded-2xl bg-[var(--surface-2)]">
          <summary className="flex cursor-pointer items-center gap-1.5 px-3.5 py-2.5 text-[14px] font-semibold">
            <ChevronRight size={15} className="chev text-[var(--fg-3)]" /> {t("ls.how")}
          </summary>
          <div className="px-3.5 pb-3">
            <code className="block text-[12.5px] break-words text-[var(--fg-2)]">NPP × 2.2 × 0.45 × (0.3-0.5) ÷ (11.5 kg × {c.grazingDays} {t("days")})</code>
            <table className="mt-2 w-full text-[13px]">
              <tbody>
                {c.assumptions.map((x) => (
                  <tr key={x.name} className="border-t border-[var(--hairline)]">
                    <td className="py-1.5 pr-2">{x.name}</td>
                    <td className="py-1.5 pr-2 font-semibold tnum">{x.value} {x.unit}</td>
                    <td className="py-1.5 text-[var(--fg-3)]">{x.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[12.5px] text-[var(--warn-fg)]">{t("ls.howNote")}</p>
          </div>
        </details>
      </Card>
      <h3 className="mt-1 text-[16px] font-semibold">{t("ls.recs")}</h3>
      <div className="grid gap-2.5">
        {ls.recommendations.map((r, i) => (
          <RecCard key={r.id} r={r} i={i} onCrop={r.id === "forage" ? onCrop : undefined} />
        ))}
      </div>
    </div>
  );
}

function RecCard({ r, i, onCrop }: { r: Recommendation; i: number; onCrop?: () => void }) {
  const { t } = useT();
  return (
    <m.details initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.04 }} className="disclosure rounded-[20px] bg-[var(--surface)] shadow-[var(--shadow-card)]" open={i === 0}>
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3.5 text-[15px] font-semibold">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[13px] text-[var(--accent)]">{i + 1}</span>
        <span className="flex-1">{r.title}</span>
        <ChevronRight size={16} className="chev text-[var(--fg-3)]" />
      </summary>
      <div className="grid gap-2 px-4 pb-4 md:grid-cols-2">
        <Part icon={<Compass size={14} />} title={t("st.why")}>{r.why}</Part>
        <Part icon={<ListChecks size={14} />} title={t("st.evidence")}>
          <ul className="grid gap-1">{r.evidence.map((e) => <li key={e.text} className="flex flex-wrap items-center justify-between gap-1">• {e.text} <SourceBadge source={e.source} /></li>)}</ul>
        </Part>
        <Part icon={<Sprout size={14} />} title={t("st.benefits")}><ul>{r.benefits.map((b) => <li key={b}>{b}</li>)}</ul></Part>
        <Part icon={<FileQuestion size={14} />} title={t("st.gaps")}><ul>{r.gaps.map((b) => <li key={b}><G e="❓" /> {b}</li>)}</ul></Part>
        <Part icon={<ShieldAlert size={14} />} title={t("st.risks")} warn><ul>{r.risks.map((b) => <li key={b}>{b}</li>)}</ul></Part>
        {onCrop && (
          <div className="flex items-center">
            <Button size="sm" variant="secondary" onClick={onCrop}><G e="🌾" /> {t("ls.toCrop")} →</Button>
          </div>
        )}
      </div>
    </m.details>
  );
}

function Part({ icon, title, children, warn }: { icon: React.ReactNode; title: string; children: React.ReactNode; warn?: boolean }) {
  return (
    <div className={clsx("rounded-2xl p-3 text-[13.5px] leading-relaxed", warn ? "bg-[var(--warn-bg)] text-[var(--warn-fg)]" : "bg-[var(--surface-2)] text-[var(--fg-2)]")}>
      <div className={clsx("mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold", warn ? "" : "text-[var(--fg)]")}>{icon} {title}</div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ heat stress */

export function HeatTab({ data }: { data: AnalyzeResponse }) {
  const { t, lang } = useT();
  const mode = useMode((s) => s.mode);
  const ls = data.livestock;
  if (!ls) return <NoModule />;
  const h = ls.heat;
  const months = h.monthly.map((x) => monthShort(x.month, lang));
  const cards = [
    { icon: <G e="🌡️" />, label: t("ls.stressDays"), value: `${h.stressDaysPerYear} ${t("days")}`, sub: "THI ≥ 72" },
    { icon: <G e="🔥" />, label: t("ls.severeDays"), value: `${h.severeDaysPerYear} ${t("days")}`, sub: "THI max ≥ 79" },
    { icon: <G e="📈" />, label: t("ls.trend"), value: `${h.trendDaysPerDecade > 0 ? "+" : ""}${h.trendDaysPerDecade}`, sub: t("ls.perDecade") },
  ];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="grid grid-cols-3 gap-2.5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-[20px] bg-[var(--surface)] p-3.5 shadow-[var(--shadow-card)]">
            <div className="text-[12px] font-medium text-[var(--fg-3)]">{c.icon} {c.label}</div>
            <div className="mt-1 text-[22px] font-semibold tracking-[-0.02em] tnum">{c.value}</div>
            <div className="text-[12px] text-[var(--fg-3)]">{c.sub}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle info="frost" source="NASA POWER 2005-2025">{t("ls.thiMonthly")}</CardTitle>
          <XYChart
            ariaLabel="THI monthly"
            labels={months}
            yMin={30}
            yMax={95}
            digits={1}
            layers={[
              { type: "line", id: "mean", label: lang === "uz" ? "O'rtacha" : "Mean", values: h.monthly.map((x) => x.thiMean), color: "var(--s1)" },
              { type: "line", id: "max", label: lang === "uz" ? "Maksimum" : "Maximum", values: h.monthly.map((x) => x.thiMax), color: "var(--s2)" },
              { type: "hline", id: "t72", label: "72", value: h.thresholds.mild, color: "var(--level-medium)", dash: true },
              { type: "hline", id: "t79", label: "79", value: h.thresholds.moderate, color: "var(--level-high)", dash: true },
              ...(mode === "expert" ? [{ type: "hline" as const, id: "t89", label: "89", value: h.thresholds.severe, color: "var(--fg-3)", dash: true }] : []),
            ]}
          />
        </Card>
        <Card>
          <CardTitle source="Open-Meteo">{t("ls.thiForecast")}</CardTitle>
          {h.forecast7d.length ? (
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
              {h.forecast7d.map((f) => (
                <div key={f.date} className="flex min-w-[70px] flex-1 flex-col items-center gap-1 rounded-2xl bg-[var(--surface-2)] px-2 py-3">
                  <span className="text-[12px] font-semibold">{new Date(f.date + "T00:00:00").toLocaleDateString(lang === "uz" ? "uz-UZ" : "en-US", { weekday: "short" })}</span>
                  <span className="text-[20px] font-semibold tnum" style={{ color: { low: "var(--level-low)", medium: "var(--level-medium)", high: "var(--level-high)" }[f.level] }}>{Math.round(f.thiMax)}</span>
                  <span className="text-[12px] text-[var(--fg-3)]">{t(`lvl.${f.level}` as Key)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title={t("f.noForecast")} />
          )}
          {mode === "expert" && (
            <XYChart ariaLabel="stress days by year" labels={h.yearly.map((y) => String(y.year))} legend={false} height={150} layers={[{ type: "bars", id: "d", label: "THI ≥ 72", values: h.yearly.map((y) => y.days), color: "var(--level-medium)" }]} />
          )}
        </Card>
      </div>
      <p className="rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-[14px]">{t("ls.heatTip")}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ water sources */

export function WaterSourcesTab({ data }: { data: AnalyzeResponse }) {
  const { t, lang } = useT();
  const ls: LivestockData | undefined = data.livestock;
  if (!ls?.waterSources) return <NoModule />;
  const w = ls.waterSources;
  const [lat, lon] = data.field.centroid;
  const markers = [
    ...(w.nearestPermanentLatLon ? [{ lat: w.nearestPermanentLatLon[0], lon: w.nearestPermanentLatLon[1], label: t("ls.waterPerm"), color: "#0277BD" }] : []),
    ...(w.nearestSeasonalLatLon ? [{ lat: w.nearestSeasonalLatLon[0], lon: w.nearestSeasonalLatLon[1], label: t("ls.waterSeas"), color: "#4FC3F7" }] : []),
  ];
  const lines = markers.map((mk) => [[lat, lon], [mk.lat, mk.lon]] as [number, number][]);
  const dir = (p?: [number, number]) => {
    if (!p) return "";
    const ang = (Math.atan2((p[1] - lon) * Math.cos((lat * Math.PI) / 180), p[0] - lat) * 180) / Math.PI;
    const names = lang === "uz" ? ["shimolda", "shimoli-sharqda", "sharqda", "janubi-sharqda", "janubda", "janubi-g'arbda", "g'arbda", "shimoli-g'arbda"] : ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
    return names[Math.round(((ang + 360) % 360) / 45) % 8];
  };
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
      <div className="h-[55dvh] min-h-[360px] overflow-hidden rounded-[24px] shadow-[var(--shadow-card)]">
        <FieldMap value={data.field.polygon} basemap="sat" readOnly extra={{ markers, lines }} fitExtra={markers.length > 0} />
      </div>
      <div className="grid content-start gap-2.5">
        <Card>
          <div className="text-[12.5px] text-[var(--fg-3)]"><G e="💧" /> {t("ls.waterPerm")}</div>
          <div className="mt-1 text-[26px] font-semibold tracking-[-0.02em]"><MaybeNum v={w.nearestPermanentKm} unit="km" digits={1} /> <span className="text-[14px] text-[var(--fg-3)]">{dir(w.nearestPermanentLatLon)}</span></div>
        </Card>
        <Card>
          <div className="text-[12.5px] text-[var(--fg-3)]"><G e="🌊" /> {t("ls.waterSeas")}</div>
          <div className="mt-1 text-[26px] font-semibold tracking-[-0.02em]"><MaybeNum v={w.nearestSeasonalKm} unit="km" digits={1} /> <span className="text-[14px] text-[var(--fg-3)]">{dir(w.nearestSeasonalLatLon)}</span></div>
        </Card>
        <SourceBadge source="JRC Global Surface Water 1984-2020" />
      </div>
    </div>
  );
}
