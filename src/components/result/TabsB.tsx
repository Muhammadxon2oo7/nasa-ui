"use client";

import { clsx } from "clsx";
import { m } from "motion/react";
import { ArrowDown, ArrowUp, Loader2, Pause, Play, Satellite } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzeResponse, IrrigationMethod } from "@/types/api";
import { whatIf as whatIfApi } from "@/api/client";
import { grossM3, initialWeights, scoreStrategy } from "@/lib/scoring";
import { dayMonth, monthShort, num, yearMonth } from "@/lib/format";
import type { MapApi } from "../map/FieldMap";
import { findHlsScenes, hlsUrl, HLS_SENSOR_NAME, type HlsScene } from "@/lib/hls";
import { useT, type Key } from "@/i18n";
import { useResultUi } from "@/store/resultUiStore";
import { XYChart } from "../charts";
import { Button, Card, CardTitle, EmptyState, Segmented, Slider, SourceBadge, spring } from "../ui";
import { SERIES } from "./StrategiesTab";
import { ActualVsNeedCard, NormComparisonRow, WaterSupplyCard } from "./Extras";
import { Fold } from "./Sections";
import { WaterNormsCard } from "./Economics";
import { ChartLine, Mountain, Receipt } from "lucide-react";
import { G } from "@/components/Glyph";

const FieldMap = dynamic(() => import("../map/FieldMap"), { ssr: false, loading: () => <div className="shimmer h-full w-full bg-[var(--surface-2)]" /> });

/* ------------------------------------------------------------------ 💧 water */

export function WaterTab({ data, onTryDry }: { data: AnalyzeResponse; onTryDry?: () => void }) {
  const { t, lang } = useT();
  const ui = useResultUi();
  const list = ui.whatIf.strategies ?? data.strategies;
  const [sid, setSid] = useState(data.summary.bestStrategyId);
  const ws = data.water.byStrategy[sid] ?? data.water.byStrategy[list[0].id];
  const gross = grossM3(data.water, sid, ui.method);
  const k = gross / Math.max(1, ws.grossM3PerHa);
  const cur = grossM3(data.water, list.find((s) => s.isCurrent)?.id ?? "A", ui.method);
  const limit = data.water.limitM3PerHa;
  const drip = grossM3(data.water, sid, "drip");
  const months = ws.monthly.map((m) => monthShort(m.month, lang));
  const eff = data.water.efficiency[ui.method];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<IrrigationMethod> value={ui.method} onChange={(v) => ui.set({ method: v })} options={(["furrow", "drip", "sprinkler"] as const).map((v) => ({ value: v, label: t(`m.${v}` as Key) }))} ariaLabel="method" />
        <span className="text-[12.5px] text-[var(--fg-3)] tnum">η = {eff}</span>
      </div>
      <Card>
        {/* water tanks: fill = yearly need, dashed line = your limit */}
        <div className="mb-4 grid grid-cols-4 gap-2" role="radiogroup" aria-label="strategy">
          {list.map((s, i) => {
            const g = grossM3(data.water, s.id, ui.method);
            const top = Math.max(...list.map((x) => grossM3(data.water, x.id, ui.method)), limit ?? 0, 1) * 1.08;
            const over = limit != null && g > limit;
            return (
              <button key={s.id} type="button" role="radio" aria-checked={sid === s.id} onClick={() => setSid(s.id)} className={clsx("press flex flex-col items-center gap-1.5 rounded-2xl p-2", sid === s.id ? "bg-[var(--surface-2)] ring-2 ring-[var(--accent)]" : "hover:bg-[var(--surface-2)]/70")}>
                <span className="relative h-24 w-full max-w-[72px] overflow-hidden rounded-[14px] border-2 border-[var(--separator)] bg-[var(--surface-2)]">
                  <m.span initial={{ height: 0 }} animate={{ height: `${(g / top) * 100}%` }} transition={{ type: "spring", bounce: 0.15, duration: 0.9, delay: i * 0.05 }} className="absolute inset-x-0 bottom-0" style={{ background: over ? "linear-gradient(#ef5350,#c62828)" : "linear-gradient(#64b5f6,#1565c0)" }} />
                  {limit != null && <span className="absolute inset-x-0 border-t-2 border-dashed border-[var(--fg-2)]" style={{ bottom: `${(limit / top) * 100}%` }} />}
                </span>
                <span className="flex items-center gap-1 text-[13px] font-bold">
                  <i className="h-2 w-2 rounded-full" style={{ background: SERIES[i] }} /> {s.id} {s.isCurrent ? "·" : ""}
                </span>
                <span className="text-[12px] text-[var(--fg-2)] tnum">{num(g)}</span>
              </button>
            );
          })}
        </div>
        <div className="text-[13px] text-[var(--fg-3)]">{t("w.strategy", { s: sid })} · {list.find((s) => s.id === sid)?.name}</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
          <m.span key={gross} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="text-[34px] font-semibold tracking-[-0.03em] tnum">
            {num(gross)}
          </m.span>
          <span className="text-[14px] text-[var(--fg-3)]">{t("r.perYear")}</span>
          <span className="text-[13.5px] text-[var(--fg-2)] tnum">
            ({t("w.range")}: {num(Math.round((ws.lowM3PerHa * k) / 100) * 100)} - {num(Math.round((ws.highM3PerHa * k) / 100) * 100)})
          </span>
        </div>
        <dl className="mt-3 grid gap-1.5 text-[14px] sm:grid-cols-3">
          <div className="rounded-2xl bg-[var(--surface-2)] px-3 py-2">
            <dt className="text-[12px] text-[var(--fg-3)]">{t("w.whole", { a: num(data.field.areaHa, 1) })}</dt>
            <dd className="font-semibold tnum">≈ {num(Math.round((gross * data.field.areaHa) / 100) * 100)} m³</dd>
          </div>
          <div className="rounded-2xl bg-[var(--surface-2)] px-3 py-2">
            <dt className="text-[12px] text-[var(--fg-3)]">{t("w.vsCurrent")}</dt>
            <dd className="font-semibold tnum">{gross - cur > 0 ? "+" : ""}{num(gross - cur)} {t("m3ha")}</dd>
          </div>
          {limit != null && (
            <div className="rounded-2xl bg-[var(--surface-2)] px-3 py-2">
              <dt className="text-[12px] text-[var(--fg-3)]">{t("w.limit")}: {num(limit)}</dt>
              <dd className={clsx("font-semibold", gross <= limit ? "text-[var(--accent)]" : "text-[var(--danger-fg)]")}>{gross <= limit ? `${t("w.fits")}` : `${t("w.over")} ${num(gross - limit)}`}</dd>
            </div>
          )}
        </dl>
      </Card>
      {ws.schedule && ws.schedule.length > 0 && (
        <Card>
          <CardTitle>{t("w.schedule")}</CardTitle>
          <div className="flex flex-wrap gap-2">
            {ws.schedule.map((s) => (
              <span key={s.month} className="rounded-2xl bg-[var(--water-soft)] px-3 py-2 text-[13.5px]">
                <b>{monthShort(s.month, lang)}</b>: {t("w.times", { n: s.times })}, ~{num(Math.round((s.m3PerHa * k) / 100) * 100)} {t("m3ha")}
              </span>
            ))}
          </div>
        </Card>
      )}
      {ui.method !== "drip" && gross - drip > 300 && <p className="rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-[14px]">{t("w.tip", { n: num(gross - drip) })}</p>}
      <WaterNormsCard data={data} />
      <Fold icon={<Receipt size={18} />} title={t("f.actual")} hint={data.actualWater ? `${data.actualWater.year}: ${num(data.actualWater.consumedM3PerHa)} / ${(data.actualWater.needM3PerHa != null ? num(data.actualWater.needM3PerHa) : "?")} ${t("m3ha")}` : undefined}>
        <ActualVsNeedCard data={data} />
        {!data.strategies.some((x) => x.waterNorms?.length) && <NormComparisonRow data={data} />}
      </Fold>
      <Fold icon={<Mountain size={18} />} title={t("f.supply")} hint={data.waterSupply ? data.waterSupply.basinName : undefined}>
        <WaterSupplyCard data={data} onTryDry={onTryDry} />
      </Fold>
      <Fold icon={<ChartLine size={18} />} title={t("f.balance")}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle info="etc" source="FAO-56 · NASA POWER + ERA5">{t("w.balance")} ({t("mm")})</CardTitle>
          <XYChart
            ariaLabel={t("w.balance")}
            labels={months}
            unit=" mm"
            layers={[
              { type: "bars", id: "peff", label: t("w.peff"), values: ws.monthly.map((m) => m.peffMm), color: "var(--s3)", stack: "s" },
              { type: "bars", id: "irr", label: t("w.irr"), values: ws.monthly.map((m) => m.irrigationMm), color: "var(--water)", stack: "s" },
              { type: "line", id: "etc", label: t("w.etc"), values: ws.monthly.map((m) => m.etcMm), color: "var(--s2)", dots: true },
            ]}
          />
        </Card>
        <Card>
          <CardTitle info="et0" source="FAO-56 Penman-Monteith">{t("w.et0")}</CardTitle>
          {data.water.et0Daily ? (
            <XYChart ariaLabel="ET0" labels={data.water.et0Daily.map((d) => dayMonth(new Date(Date.UTC(2021, 0, d.doy)).toISOString().slice(5, 10), lang))} unit=" mm" digits={1} legend={false} tickEvery={61} layers={[{ type: "line", id: "et0", label: "ET0", values: data.water.et0Daily.map((d) => d.mm), color: "var(--s4)" }]} />
          ) : (
            <EmptyState title="ET0" />
          )}
        </Card>
      </div>
      </Fold>
      <p className="text-[12.5px] text-[var(--fg-3)]">{t("w.uncertainty")}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ ☁️ forecast */

type OM = { daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_sum: number[]; wind_speed_10m_max: number[]; weather_code: number[] } };
const wIcon = (c: number) => (c >= 71 && c <= 77 ? <G e="❄️" /> : c >= 95 ? <G e="⛈️" /> : c >= 51 ? <G e="🌧️" /> : c >= 45 ? <G e="🌫️" /> : c >= 2 ? <G e="⛅" /> : <G e="☀️" />);

export function ForecastTab({ data }: { data: AnalyzeResponse }) {
  const { t } = useT();
  const [sub, setSub] = useState<"week" | "season" | "whatif">("week");
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <Segmented value={sub} onChange={setSub} options={[{ value: "week", label: t("f.week") }, { value: "season", label: t("f.season") }, { value: "whatif", label: t("f.whatif") }]} />
      {sub === "week" && <Week data={data} />}
      {sub === "season" && <Season data={data} />}
      {sub === "whatif" && <WhatIf data={data} />}
    </div>
  );
}

function Week({ data }: { data: AnalyzeResponse }) {
  const { t, lang } = useT();
  const [om, setOm] = useState<OM | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    const [lat, lon] = data.field.centroid;
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code&wind_speed_unit=ms&timezone=auto`)
      .then((r) => r.json())
      .then(setOm)
      .catch(() => setErr(true));
  }, [data.field.centroid]);
  if (err) return <EmptyState title={t("f.noForecast")} />;
  if (!om) return <div className="shimmer h-40 rounded-[22px] bg-[var(--surface-2)]" />;
  const d = om.daily;
  const wd = (s: string) => new Date(s + "T00:00:00").toLocaleDateString(lang === "uz" ? "uz-UZ" : "en-US", { weekday: "short" });
  const alerts: string[] = [];
  d.time.forEach((day, i) => {
    if (d.temperature_2m_min[i] <= -2) alerts.push(`${t("f.frostAlert", { d: wd(day), t: Math.round(d.temperature_2m_min[i]) })}`);
    if (d.wind_speed_10m_max[i] >= 12) alerts.push(`${t("f.windAlert", { d: wd(day), w: Math.round(d.wind_speed_10m_max[i]) })}`);
  });
  const dry = d.time.filter((_, i) => d.precipitation_sum[i] < 0.5).slice(0, 2).map(wd);
  return (
    <Card>
      <CardTitle source="Open-Meteo (CC BY 4.0)">{t("f.week")}</CardTitle>
      <div className="mb-3 grid gap-1.5">
        {alerts.length ? alerts.map((a) => <p key={a} className="rounded-2xl bg-[var(--warn-bg)] px-3.5 py-2 text-[14px] text-[var(--warn-fg)]">{a}</p>) : <p className="text-[14px] text-[var(--fg-2)]">{t("f.noAlerts")}</p>}
      </div>
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
        {d.time.map((day, i) => (
          <m.div key={day} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.03 }} className="flex min-w-[78px] flex-1 flex-col items-center gap-1 rounded-2xl bg-[var(--surface-2)] px-2 py-3">
            <span className="text-[12.5px] font-semibold">{wd(day)}</span>
            <span className="text-[24px]" aria-hidden>{wIcon(d.weather_code[i])}</span>
            <span className="text-[13.5px] font-semibold tnum">{Math.round(d.temperature_2m_max[i])}° / {Math.round(d.temperature_2m_min[i])}°</span>
            <span className="text-[12px] text-[var(--fg-3)] tnum">{d.precipitation_sum[i].toFixed(1)} mm</span>
          </m.div>
        ))}
      </div>
      {dry.length >= 2 && <p className="mt-3 text-[14px] text-[var(--fg-2)]"><G e="🚜" /> {t("f.goodDays", { d: dry.join("-") })}</p>}
    </Card>
  );
}

function Season({ data }: { data: AnalyzeResponse }) {
  const { t, lang } = useT();
  const s = data.seasonal;
  if (!s) return <EmptyState title={t("f.noForecast")} />;
  const labels = s.months.map((m) => yearMonth(m.month, lang));
  const ids = Object.keys(s.robustness);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <Card>
        <CardTitle info="seas5" source="ECMWF SEAS5 · ERA5 · NASA POWER">{t("f.seasonTitle", { n: s.members })}</CardTitle>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[420px] text-center text-[13.5px]">
            <thead>
              <tr className="text-[12px] text-[var(--fg-3)]">
                <th />
                {labels.map((l) => (
                  <th key={l} className="py-1.5 font-medium">{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[var(--hairline)]">
                <td className="py-2 text-left text-[12.5px] text-[var(--fg-3)]"><G e="🌡️" /> {t("f.warmer")}</td>
                {s.months.map((m) => (
                  <td key={m.month} className={clsx("py-2 font-semibold tnum", m.probWarmer >= 0.6 && "text-[var(--level-high-fg)]", m.probWarmer <= 0.4 && "text-[var(--s1)]")}>
                    {m.probWarmer >= 0.6 ? <G e="🔥" /> : m.probWarmer <= 0.4 ? <G e="❄️" /> : "≈"} {Math.round(m.probWarmer * 100)}%
                  </td>
                ))}
              </tr>
              <tr className="border-t border-[var(--hairline)]">
                <td className="py-2 text-left text-[12.5px] text-[var(--fg-3)]"><G e="🌧️" /> {t("f.wetter")}</td>
                {s.months.map((m) => (
                  <td key={m.month} className="py-2 font-semibold tnum">
                    {m.probWetter >= 0.6 ? "↑" : m.probWetter <= 0.4 ? "↓" : "≈"} {Math.round(m.probWetter * 100)}%
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle>{t("f.tempFan")}</CardTitle>
          <XYChart
            ariaLabel={t("f.tempFan")}
            labels={labels}
            unit="°C"
            digits={1}
            layers={[
              { type: "band", id: "p1090", label: "P10-P90", lo: s.months.map((m) => m.tempP10), hi: s.months.map((m) => m.tempP90), color: "var(--s2)", opacity: 0.14 },
              ...(s.months.every((m) => m.tempP25 != null && m.tempP75 != null) ? [{ type: "band" as const, id: "p2575", label: "P25-P75", lo: s.months.map((m) => m.tempP25 ?? null), hi: s.months.map((m) => m.tempP75 ?? null), color: "var(--s2)", opacity: 0.28 }] : []),
              { type: "line", id: "p50", label: "P50", values: s.months.map((m) => m.tempP50), color: "var(--s2)" },
              { type: "line", id: "norm", label: lang === "uz" ? "Norma" : "Normal", values: s.months.map((m) => m.tempNormal), color: "var(--fg-3)", dash: true },
            ]}
          />
        </Card>
        <Card>
          <CardTitle>{t("f.precipFan")}</CardTitle>
          <XYChart
            ariaLabel={t("f.precipFan")}
            labels={labels}
            unit=" mm"
            layers={[
              { type: "band", id: "p1090", label: "P10-P90", lo: s.months.map((m) => m.precipP10), hi: s.months.map((m) => m.precipP90), color: "var(--water)", opacity: 0.2 },
              { type: "line", id: "p50", label: "P50", values: s.months.map((m) => m.precipP50), color: "var(--water)" },
              { type: "line", id: "norm", label: lang === "uz" ? "Norma" : "Normal", values: s.months.map((m) => m.precipNormal), color: "var(--fg-3)", dash: true },
            ]}
          />
        </Card>
      </div>
      <Card>
        <CardTitle>{t("f.robust", { n: s.members })}</CardTitle>
        <div className="grid gap-2">
          {ids
            .map((id) => ({ id, v: s.robustness[id], i: data.strategies.findIndex((x) => x.id === id) }))
            .sort((a, b) => b.v - a.v)
            .map((r) => (
              <div key={r.id} className="grid grid-cols-[28px_1fr_56px] items-center gap-2 text-[14px]">
                <b>{r.id}</b>
                <div className="h-3 overflow-hidden rounded-full bg-[var(--surface-3)]">
                  <m.div initial={{ scaleX: 0 }} animate={{ scaleX: r.v }} transition={{ type: "spring", bounce: 0, duration: 0.8 }} className="h-full origin-left rounded-full" style={{ background: SERIES[r.i] }} />
                </div>
                <span className="text-right font-semibold tnum">{Math.round(r.v * 100)}%</span>
              </div>
            ))}
        </div>
        <p className="mt-3 text-[12.5px] text-[var(--fg-3)]">{t("f.prob", { c: t(`lvl.${s.confidence}` as Key).toLowerCase() })}</p>
      </Card>
    </div>
  );
}

function WhatIf({ data }: { data: AnalyzeResponse }) {
  const { t } = useT();
  const ui = useResultUi();
  const [dT, setDT] = useState(ui.whatIf.dT);
  const [dP, setDP] = useState(ui.whatIf.dP);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!dT && !dP) {
      ui.set({ whatIf: { dT: 0, dP: 0, strategies: null, loading: false } });
      return;
    }
    const ctrl = new AbortController();
    timer.current = setTimeout(() => {
      ui.set({ whatIf: { ...ui.whatIf, dT, dP, loading: true } });
      const id = data.fieldId;
      whatIfApi(id, dT, dP, ctrl.signal)
        .then((r) => ui.set({ whatIf: { dT, dP, strategies: r.strategies, loading: false } }))
        .catch(() => ui.set({ whatIf: { dT, dP, strategies: ui.whatIf.strategies, loading: false } }));
    }, 300); // debounce (plan §3.3.7)
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dT, dP]);
  const w = ui.weights ?? initialWeights([]);
  const base = useMemo(() => data.strategies.map((s) => ({ id: s.id, name: s.name, score: scoreStrategy(s.metrics, w) })), [data.strategies, w]);
  const now = (ui.whatIf.strategies ?? data.strategies).map((s) => ({ id: s.id, score: scoreStrategy(s.metrics, w), rules: s.rules, water: s.waterM3PerHa }));
  const baseRank = [...base].sort((a, b) => b.score - a.score).map((x) => x.id);
  const rows = [...now].sort((a, b) => b.score - a.score);
  return (
    <Card>
      <div className="grid gap-x-8 sm:grid-cols-2">
        <Slider id="dT" label={`${t("f.temp")}`} value={dT} min={0} max={3} step={0.5} onChange={setDT} format={(v) => `+${v.toFixed(1)}°C`} />
        <Slider id="dP" label={`${t("f.rain")}`} value={dP} min={-40} max={20} step={5} onChange={setDP} format={(v) => `${v > 0 ? "+" : ""}${v}%`} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px]">
        <span className="text-[var(--fg-3)]">{t("f.presets")}:</span>
        <Button size="sm" variant="secondary" onClick={() => { setDT(1); setDP(-30); }}><G e="🏜️" /> {t("f.drought")}</Button>
        <Button size="sm" variant="secondary" onClick={() => { setDT(0); setDP(-30); }}><G e="🏔️" /> {t("ws.lvl.low") === "PAST" ? "Kam suvli yil" : "Low-water year"}</Button>
        <Button size="sm" variant="secondary" onClick={() => { setDT(2.5); setDP(0); }}><G e="🔥" /> {t("f.hot")}</Button>
        <Button size="sm" variant="secondary" onClick={() => { setDT(0); setDP(0); }}>↺ {t("f.normal")}</Button>
      </div>
      <div className={clsx("mt-4 grid gap-1.5 transition-opacity", ui.whatIf.loading && "opacity-50")}>
        <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-[var(--fg-3)]">
          {t("f.result")} {ui.whatIf.loading && <Loader2 size={14} className="animate-spin" />}
        </div>
        {rows.map((r, i) => {
          const b = base.find((x) => x.id === r.id)!;
          const d = r.score - b.score;
          const moved = baseRank.indexOf(r.id) - i;
          const fail = r.rules.find((x) => x.status === "fail" || (x.id === "R3" && x.detail && /oshadi|Exceeds/.test(x.detail)));
          return (
            <m.div layout key={r.id} transition={spring} className="flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--surface-2)] px-3 py-2 text-[14px]">
              <b className="w-5 tnum">{i + 1}.</b>
              <b>{r.id}</b>
              <span className="tnum">{b.score} → {r.score}</span>
              <span className={clsx("flex items-center text-[13px] font-semibold tnum", d < 0 ? "text-[var(--danger-fg)]" : d > 0 ? "text-[var(--accent)]" : "text-[var(--fg-3)]")}>
                {d < 0 ? <ArrowDown size={13} /> : d > 0 ? <ArrowUp size={13} /> : null}
                {d !== 0 ? Math.abs(d) : "="}
              </span>
              {moved > 0 && <span className="text-[12.5px] text-[var(--accent)]"><G e="⬆" /></span>}
              {fail?.detail && <span className="text-[12.5px] text-[var(--danger-fg)]">{fail.detail}</span>}
              <span className="ml-auto text-[12.5px] text-[var(--fg-3)] tnum"><G e="💧" /> {num(r.water)}</span>
            </m.div>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ 🗺️ map layers */

const GIBS = (layer: string, tms: string, date: string, ext: "png" | "jpg" = "png") => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${date}/${tms}/{z}/{y}/{x}.${ext}`;
type LayerId = "field30" | "ndvi" | "smap" | "grace" | "rain" | "lst" | "frost" | "snow" | "truecolor" | "relief";
type Cadence = "scenes" | "monthly" | "yearly" | "static";
const GIBS_LAYER: Record<Exclude<LayerId, "field30">, { layer: string; tms: string; z: number; ext?: "jpg"; attr: string }> = {
  truecolor: { layer: "MODIS_Terra_CorrectedReflectance_TrueColor", tms: "GoogleMapsCompatible_Level9", z: 9, ext: "jpg", attr: "NASA GIBS · MODIS Terra" },
  ndvi: { layer: "MODIS_Terra_NDVI_8Day", tms: "GoogleMapsCompatible_Level9", z: 9, attr: "NASA GIBS · MODIS" },
  snow: { layer: "MODIS_Terra_NDSI_Snow_Cover", tms: "GoogleMapsCompatible_Level8", z: 8, attr: "NASA GIBS · MODIS NDSI" },
  lst: { layer: "MODIS_Terra_Land_Surface_Temp_Day", tms: "GoogleMapsCompatible_Level7", z: 7, attr: "NASA GIBS · MODIS LST" },
  smap: { layer: "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture", tms: "GoogleMapsCompatible_Level6", z: 6, attr: "NASA GIBS · SMAP L4" },
  grace: { layer: "GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI", tms: "GoogleMapsCompatible_Level6", z: 6, attr: "NASA GIBS · GRACE / GRACE-FO (JPL Mascon)" },
  frost: { layer: "SMAP_L3_Passive_Enhanced_Day_Freeze_Thaw", tms: "GoogleMapsCompatible_Level6", z: 6, attr: "NASA GIBS · SMAP L3 Freeze/Thaw" },
  rain: { layer: "IMERG_Precipitation_Rate", tms: "GoogleMapsCompatible_Level6", z: 6, attr: "NASA GIBS · GPM IMERG" },
  relief: { layer: "SRTM_Color_Index", tms: "GoogleMapsCompatible_Level12", z: 12, attr: "NASA GIBS · SRTM" },
};

/** July of each year (summer storage), using the dates GRACE actually has; GRACE ended mid-2017, GRACE-FO began mid-2018. */
const GRACE_DATES = ["2003-07-01", "2004-07-01", "2005-07-01", "2006-07-01", "2007-07-01", "2008-07-01", "2009-07-01", "2010-07-01", "2011-07-05", "2012-07-01", "2013-07-01", "2014-08-01", "2015-08-01", "2016-07-01", "2018-07-01", "2019-07-01", "2020-07-01", "2021-07-01", "2022-07-01"];

/** Legends use the exact stops of the GIBS colormaps (gibs.earthdata.nasa.gov/colormaps/v1.3), with local labels. */
type Legend = { stops: string[]; labels: [string, string, string]; unit?: string } | { swatches: [string, string][] };
const LEGEND: Partial<Record<LayerId, { uz: Legend; en: Legend }>> = (() => {
  const ndvi = ["#f1ecec", "#c8b5a5", "#9a6e59", "#64a601", "#1d7501", "#001801"];
  const smap = ["#ffa200", "#cae400", "#00b46a", "#0071ff", "#00008c"];
  const grace = ["#0033ff", "#6684ff", "#ccd5ff", "#ffffff", "#ffd5cc", "#ff8466", "#ff3300"];
  const rain = ["#0b7a4f", "#5fbf1f", "#f2e600", "#ff8000", "#e00000", "#3a0000"];
  const lst = ["#c900ff", "#0100ff", "#04fff7", "#c5ff00", "#ff9700", "#ff0100"];
  const snow = ["#f0f080", "#f0d280", "#f0b480", "#f0b493", "#f09693", "#ff0000"];
  const relief = ["#007527", "#03af4c", "#c0dd0b", "#ca9b0f", "#ab7373", "#ffffff"];
  return {
    ndvi: { uz: { stops: ndvi, labels: ["0 · bo'sh yer", "0.3", "1 · zich o'simlik"] }, en: { stops: ndvi, labels: ["0 · bare", "0.3", "1 · dense"] } },
    smap: { uz: { stops: smap, labels: ["quruq", "0.35", "ho'l ≥0.7"], unit: "m³/m³" }, en: { stops: smap, labels: ["dry", "0.35", "wet ≥0.7"], unit: "m³/m³" } },
    grace: { uz: { stops: grace, labels: ["−30 · kamaygan", "0", "+30 · ko'paygan"], unit: "sm suv, 2004-2009 o'rtachasiga nisbatan" }, en: { stops: grace, labels: ["−30 · loss", "0", "+30 · gain"], unit: "cm of water vs the 2004-2009 mean" } },
    rain: { uz: { stops: rain, labels: ["0.1", "2", "≥53"], unit: "mm/soat" }, en: { stops: rain, labels: ["0.1", "2", "≥53"], unit: "mm/h" } },
    lst: { uz: { stops: lst, labels: ["−73°", "+17°", "+77°C"] }, en: { stops: lst, labels: ["−73°", "+17°", "+77°C"] } },
    snow: { uz: { stops: snow, labels: ["kam", "", "to'liq qor"] }, en: { stops: snow, labels: ["low", "", "full snow"] } },
    relief: { uz: { stops: relief, labels: ["past", "", "baland"] }, en: { stops: relief, labels: ["low", "", "high"] } },
    frost: { uz: { swatches: [["#644f2d", "Erigan"], ["#6586ff", "Muzlagan"]] }, en: { swatches: [["#644f2d", "Thawed"], ["#6586ff", "Frozen"]] } },
  };
})();

const LAYER_INFO: Record<LayerId, { uz: [string, string, string]; en: [string, string, string]; res: string; cadence: Cadence }> = {
  field30: { uz: ["Dala 30 m", "Landsat 8/9 va Sentinel-2 ning birlashtirilgan (HLS) suratlari: oxirgi 12 oyning har biridan eng toza kun. Bulutli kunlar avtomatik chiqarib tashlandi.", "Dala qachon haydalgan, qachon ko'kargan va qachon bo'sh turganini o'z ko'zingiz bilan ko'rasiz"], en: ["Field at 30 m", "Harmonized Landsat 8/9 + Sentinel-2 (HLS) imagery: the clearest day of each of the last 12 months. Cloudy passes are filtered out automatically.", "See for yourself when the field was ploughed, green, or left bare"], res: "NASA HLS v2 · 30 m · har 2-3 kunda yangi surat", cadence: "scenes" },
  truecolor: { uz: ["Hudud surati", "Kosmosdan oddiy ko'z bilan ko'rinish: bulut, qor, sug'oriladigan massivlar.", "Dala va qo'shni yerlarning umumiy holati"], en: ["Regional view", "What the eye sees from orbit: clouds, snow, irrigated massifs.", "Overall state of the field and its neighbours"], res: "MODIS Terra · 250 m · kunlik", cadence: "monthly" },
  ndvi: { uz: ["O'simlik (NDVI)", "Yashil = faol o'sayotgan o'simlik, jigarrang = bo'sh yoki qurigan yer.", "Dala qachon bo'sh turishi va ekin qachon stressga tushishini ko'rsatadi"], en: ["Vegetation (NDVI)", "Green = actively growing plants, brown = bare or dry land.", "Shows when the field stands bare and when crops are stressed"], res: "MODIS · 250 m · 8 kunlik", cadence: "monthly" },
  smap: { uz: ["Tuproq namligi", "Tuproqning 0-100 sm qatlamidagi suv (SMAP L4 modeli).", "Qurg'oqchilik stressi va sug'orish ehtiyoji, chuqur ildizli ekinlar tanlovi"], en: ["Soil moisture", "Water in the top 0-100 cm of soil (SMAP L4 model).", "Drought stress, irrigation need, deep-rooted crop choice"], res: "SMAP L4 · 9 km · kunlik", cadence: "monthly" },
  grace: { uz: ["Suv zaxirasi", "Yer osti va yer usti suvining umumiy miqdori, gravitatsiya orqali o'lchanadi (GRACE). Diqqat: ko'k = suv kamaygan, qizil = ko'paygan.", "Uzoq muddatli suv tanqisligi: kam suv talab qiladigan rotatsiya kerakligining eng kuchli dalili"], en: ["Water storage", "Total ground and surface water, measured through gravity (GRACE). Note: blue = water lost, red = gained.", "Long-term water decline: the strongest case for a lower-water rotation"], res: "GRACE / GRACE-FO · ~300 km · oylik, 2003-2022", cadence: "yearly" },
  rain: { uz: ["Yog'in", "Kosmosdan o'lchangan yog'in jadalligi (GPM IMERG).", "Yog'in ishonchliligi, kuchli jala va eroziya xavfi"], en: ["Precipitation", "Rain rate measured from space (GPM IMERG).", "Rain reliability, storms and erosion risk"], res: "GPM IMERG · 0.1° · kunlik", cadence: "monthly" },
  lst: { uz: ["Yuza harorati", "Kunduzgi tuproq va o'simlik yuzasi harorati.", "Issiqlik stressi o'choqlari, issiqqa chidamli ekin kerakligi"], en: ["Surface temperature", "Daytime temperature of soil and canopy.", "Heat-stress hotspots, need for heat-tolerant crops"], res: "MODIS · 1 km · kunlik", cadence: "monthly" },
  frost: { uz: ["Muzlash", "Tuproq yuzasi muzlagan yoki erigan holati (SMAP).", "Kuzgi ekish va erta bahorgi ekin uchun sovuq xavfi"], en: ["Freeze / thaw", "Whether the soil surface is frozen or thawed (SMAP).", "Frost risk for autumn sowing and early spring crops"], res: "SMAP L3 · 9 km · kunlik", cadence: "monthly" },
  snow: { uz: ["Qor", "Tog'lardagi qor: yozgi sug'orish suvining manbai.", "Kelasi yozda suv yetarlimi degan savolga erta signal"], en: ["Snow cover", "Mountain snow: the source of summer irrigation water.", "An early signal of next summer's water supply"], res: "MODIS NDSI · 500 m · kunlik", cadence: "monthly" },
  relief: { uz: ["Relyef", "Balandlik va qiyalik (SRTM).", "Qiyalik eroziya va suv oqimini belgilaydi"], en: ["Terrain", "Elevation and slope (SRTM).", "Slope drives erosion and run-off"], res: "SRTM · 30 m", cadence: "static" },
};
const LAYERS: LayerId[] = ["field30", "ndvi", "smap", "grace", "rain", "lst", "frost", "snow", "truecolor", "relief"];

function LegendBar({ id }: { id: LayerId }) {
  const { lang } = useT();
  const l = LEGEND[id]?.[lang === "en" ? "en" : "uz"];
  if (!l) return null;
  if ("swatches" in l)
    return (
      <div className="flex items-center gap-3 text-[12px] font-medium">
        {l.swatches.map(([c, t]) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <i className="h-3 w-3 rounded-[4px]" style={{ background: c }} /> {t}
          </span>
        ))}
      </div>
    );
  return (
    <div className="min-w-0">
      <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${l.stops.join(",")})` }} />
      <div className="mt-1 flex justify-between gap-2 text-[11.5px] font-medium text-[var(--fg-2)] tnum">
        <span>{l.labels[0]}</span>
        <span>{l.labels[1]}</span>
        <span>{l.labels[2]}</span>
      </div>
      {l.unit && <div className="text-[11px] text-[var(--fg-3)]">{l.unit}</div>}
    </div>
  );
}

/** "From space": NASA layers over the field - 30 m HLS scenes, regional GIBS layers by month, GRACE by year. */
export function MapTab({ data }: { data: AnalyzeResponse }) {
  const { t, lang } = useT();
  const [layer, setLayer] = useState<LayerId>("field30");
  const [opacityBy, setOpacityBy] = useState<Partial<Record<LayerId, number>>>({});
  const opacity = opacityBy[layer] ?? (layer === "field30" ? 100 : 75);
  const setOpacity = (v: number) => setOpacityBy((o) => ({ ...o, [layer]: v }));
  const info = LAYER_INFO[layer];
  const [la, lo] = data.field.centroid;

  // timeline: the 15th of each of the last 36 months (latest = 10 days ago)
  const [months] = useState(() => {
    const now = new Date(Date.now() - 10 * 864e5);
    return Array.from({ length: 36 }, (_, i) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (35 - i), 15));
      return i === 35 ? now.toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
    });
  });
  // HLS scenes are found in the browser: the field's tile is read pixel by pixel, cloudy passes dropped
  const [scenes, setScenes] = useState<HlsScene[] | null>(null);
  const [scanErr, setScanErr] = useState(false);
  useEffect(() => {
    const ac = new AbortController();
    findHlsScenes(la, lo, { signal: ac.signal, onProgress: (f) => f.length && setScenes(f) })
      .then((r) => setScenes(r))
      .catch((e) => (e as Error).name !== "AbortError" && setScanErr(true));
    return () => ac.abort();
  }, [la, lo]);

  const steps = info.cadence === "scenes" ? (scenes ?? []).map((s) => s.date) : info.cadence === "yearly" ? GRACE_DATES : info.cadence === "monthly" ? months : [];
  const [pos, setPos] = useState<Record<Cadence, number>>({ scenes: -1, monthly: 35, yearly: GRACE_DATES.length - 1, static: 0 });
  const idx = Math.min(steps.length - 1, pos[info.cadence] < 0 ? steps.length - 1 : pos[info.cadence]);
  const setIdx = (i: number) => setPos((p) => ({ ...p, [info.cadence]: i }));
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing || steps.length < 2) return;
    const id = setInterval(() => setPos((p) => ({ ...p, [info.cadence]: ((p[info.cadence] < 0 ? steps.length - 1 : p[info.cadence]) + 1) % steps.length })), info.cadence === "scenes" ? 1400 : 1100);
    return () => clearInterval(id);
  }, [playing, steps.length, info.cadence]);
  const date = steps[idx];
  const scene = info.cadence === "scenes" && scenes ? scenes[idx] : undefined;

  const overlay = useMemo(() => {
    if (layer === "field30") return scene ? { url: hlsUrl(scene.sensor, scene.date), opacity: opacity / 100, maxNativeZoom: 12, attribution: `NASA HLS · ${HLS_SENSOR_NAME[scene.sensor]}`, className: "tiles-pixelated" } : null;
    const g = GIBS_LAYER[layer];
    return { url: GIBS(g.layer, g.tms, info.cadence === "static" ? "default" : date, g.ext), opacity: opacity / 100, maxNativeZoom: g.z, attribution: g.attr };
  }, [layer, opacity, date, scene, info.cadence]);

  // 30 m imagery reads at field scale; regional layers (250 m - 300 km) at zoom ~11, GRACE wider still
  const api = useRef<MapApi | null>(null);
  const zoomFor = (l: LayerId) => (l === "field30" || l === "relief" ? 14 : l === "grace" ? 6 : 11);
  const pick = (l: LayerId) => {
    setPlaying(false);
    if (zoomFor(l) !== zoomFor(layer)) api.current?.fit(zoomFor(l));
    setLayer(l);
  };

  const worldview = `https://worldview.earthdata.nasa.gov/?v=${lo - 0.6},${la - 0.4},${lo + 0.6},${la + 0.4}&l=${layer === "relief" || layer === "field30" ? "" : `${GIBS_LAYER[layer].layer},`}MODIS_Terra_CorrectedReflectance_TrueColor,Reference_Labels_15m&t=${date ?? months[35]}`;
  const L3 = lang === "en" ? info.en : info.uz;
  const fmt = (d: string) =>
    info.cadence === "yearly" ? d.slice(0, 4) : info.cadence === "scenes" ? `${+d.slice(8, 10)} ${monthShort(+d.slice(5, 7), lang)}` : `${monthShort(+d.slice(5, 7), lang)} ${d.slice(0, 4)}`;
  const scanning = layer === "field30" && !scenes && !scanErr;
  const noScenes = layer === "field30" && (scanErr || (scenes && scenes.length === 0));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="relative isolate h-[min(72dvh,640px)] min-h-[420px] overflow-hidden rounded-[24px] shadow-[var(--shadow-card)]">
        <FieldMap value={data.field.polygon} basemap="sat" readOnly overlay={overlay} apiRef={api} fitMaxZoom={14} />
        {/* layer chips */}
        <div className="no-scrollbar absolute inset-x-3 top-3 z-[600] overflow-x-auto [mask-image:linear-gradient(90deg,#000_calc(100%-28px),transparent)]">
          <div className="lg mr-7 flex w-max gap-0.5 rounded-full p-1" role="radiogroup" aria-label={t("map.layers")}>
            {LAYERS.map((id) => (
              <button key={id} type="button" role="radio" aria-checked={layer === id} onClick={() => pick(id)} className={clsx("press min-h-9 rounded-full px-3 text-[13px] font-semibold whitespace-nowrap transition-colors", layer === id ? "bg-[var(--fg)] text-[var(--bg)]" : "text-[var(--fg)]")}>
                {(lang === "en" ? LAYER_INFO[id].en : LAYER_INFO[id].uz)[0]}
              </button>
            ))}
          </div>
        </div>
        {/* scan status for the 30 m layer */}
        {(scanning || noScenes) && (
          <div className="lg absolute top-16 left-3 z-[600] flex max-w-[calc(100%-24px)] items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium" role="status">
            {scanning ? <Loader2 size={15} className="animate-spin" /> : <Satellite size={15} />}
            {scanning
              ? lang === "en" ? "Looking for cloud-free Landsat and Sentinel-2 passes…" : "Bulutsiz Landsat va Sentinel-2 suratlari qidirilmoqda…"
              : lang === "en" ? "No clear 30 m pass in the last 12 months - try the regional layers" : "Oxirgi 12 oyda bulutsiz 30 m surat topilmadi - hudud qatlamlarini ko'ring"}
          </div>
        )}
        {/* timeline */}
        {info.cadence !== "static" && steps.length > 0 && (
          <div className="lg absolute inset-x-3 bottom-3 z-[600] flex items-center gap-3 rounded-[18px] p-2.5">
            <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"} className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-fill)] text-white">
              {playing ? <Pause size={17} /> : <Play size={17} className="translate-x-[1px]" />}
            </button>
            <div className="min-w-0 flex-1">
              <input type="range" min={0} max={steps.length - 1} value={idx} onChange={(e) => (setIdx(+e.target.value), setPlaying(false))} aria-label={t("map.date")} aria-valuetext={date} className="w-full accent-[var(--accent-fill)]" />
              <div className="flex justify-between gap-2 text-[12px] font-medium text-[var(--fg-2)] tnum">
                <span>{fmt(steps[0])}</span>
                <b className="truncate text-[var(--fg)]">
                  {fmt(date)}
                  {scene && <span className="font-medium text-[var(--fg-2)]"> · {HLS_SENSOR_NAME[scene.sensor]}</span>}
                </b>
                <span>{fmt(steps[steps.length - 1])}</span>
              </div>
            </div>
          </div>
        )}
      </div>
      <Card className="flex flex-col gap-3">
        <div>
          <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{L3[0]}</h3>
          <p className="mt-1 text-[14px] text-[var(--fg-2)]">{L3[1]}</p>
        </div>
        <LegendBar id={layer} />
        <div className="rounded-2xl bg-[var(--surface-2)] px-3 py-2.5">
          <div className="text-[12px] font-semibold text-[var(--fg-3)]">{lang === "en" ? "Why it matters for rotation" : "Rotatsiya uchun nega muhim"}</div>
          <p className="text-[14px]">{L3[2]}</p>
        </div>
        {scene && (
          <div className="text-[12.5px] text-[var(--fg-2)] tnum">
            {lang === "en" ? `${scenes?.length} months with a clear pass · cloud near the field ~${scene.cloudPct}%` : `${scenes?.length} oy uchun toza surat topildi · dala atrofida bulut ~${scene.cloudPct}%`}
          </div>
        )}
        <Slider id="op" label={t("map.opacity")} value={opacity} min={10} max={100} step={5} onChange={setOpacity} format={(v) => `${v}%`} />
        <div className="text-[12.5px] text-[var(--fg-3)]">{info.res}</div>
        <p className="text-[12.5px] text-[var(--fg-3)]">
          {layer === "field30"
            ? lang === "en" ? "Each square is one 30 m pixel (about a football pitch). Rows are not visible; field-wide change is." : "Har bir kvadrat - bitta 30 m piksel (taxminan futbol maydoni). Egat ko'rinmaydi, lekin butun dala o'zgarishi aniq ko'rinadi."
            : lang === "en" ? "Regional layers are area averages (250 m - 300 km). They show the conditions around the field, not inside it." : "Hudud qatlamlari maydon o'rtachasi (250 m - 300 km). Ular dala ichini emas, uning atrofidagi sharoitni ko'rsatadi."}
        </p>
        <a href={worldview} target="_blank" rel="noreferrer" className="press mt-auto inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3 py-2 text-[13.5px] font-semibold">
          <Satellite size={15} /> {t("map.worldview")} ↗
        </a>
        <SourceBadge source={layer === "field30" ? "NASA HLS v2 (GIBS)" : "NASA GIBS (WMTS)"} />
      </Card>
    </div>
  );
}
