"use client";

import { clsx } from "clsx";
import { m } from "motion/react";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzeResponse, IrrigationMethod } from "@/types/api";
import { whatIf as whatIfApi } from "@/api/client";
import { grossM3, initialWeights, scoreStrategy } from "@/lib/scoring";
import { dayMonth, monthShort, num, yearMonth } from "@/lib/format";
import { useT, type Key } from "@/i18n";
import { useResultUi } from "@/store/resultUiStore";
import { XYChart } from "../charts";
import { Button, Card, CardTitle, EmptyState, Segmented, Slider, SourceBadge, spring } from "../ui";
import { SERIES } from "./StrategiesTab";
import { ActualVsNeedCard, NormComparisonRow, WaterSupplyCard } from "./Extras";
import { Fold } from "./Sections";
import { ChartLine, Mountain, Receipt } from "lucide-react";

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
      <Fold icon={<Receipt size={18} />} title={t("f.actual")} hint={data.actualWater ? `${data.actualWater.year}: ${num(data.actualWater.consumedM3PerHa)} / ${num(data.actualWater.needM3PerHa)} ${t("m3ha")}` : undefined}>
        <ActualVsNeedCard data={data} />
        <NormComparisonRow data={data} />
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
const wIcon = (c: number) => (c >= 71 && c <= 77 ? "❄️" : c >= 95 ? "⛈️" : c >= 51 ? "🌧️" : c >= 45 ? "🌫️" : c >= 2 ? "⛅" : "☀️");

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
    if (d.temperature_2m_min[i] <= -2) alerts.push(`🔴 ${t("f.frostAlert", { d: wd(day), t: Math.round(d.temperature_2m_min[i]) })}`);
    if (d.wind_speed_10m_max[i] >= 12) alerts.push(`🟠 ${t("f.windAlert", { d: wd(day), w: Math.round(d.wind_speed_10m_max[i]) })}`);
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
      {dry.length >= 2 && <p className="mt-3 text-[14px] text-[var(--fg-2)]">🚜 {t("f.goodDays", { d: dry.join("-") })}</p>}
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
                <td className="py-2 text-left text-[12.5px] text-[var(--fg-3)]">🌡️ {t("f.warmer")}</td>
                {s.months.map((m) => (
                  <td key={m.month} className={clsx("py-2 font-semibold tnum", m.probWarmer >= 0.6 && "text-[var(--level-high-fg)]", m.probWarmer <= 0.4 && "text-[var(--s1)]")}>
                    {m.probWarmer >= 0.6 ? "🔥" : m.probWarmer <= 0.4 ? "❄️" : "≈"} {Math.round(m.probWarmer * 100)}%
                  </td>
                ))}
              </tr>
              <tr className="border-t border-[var(--hairline)]">
                <td className="py-2 text-left text-[12.5px] text-[var(--fg-3)]">🌧️ {t("f.wetter")}</td>
                {s.months.map((m) => (
                  <td key={m.month} className="py-2 font-semibold tnum">
                    {m.probWetter >= 0.6 ? "💧↑" : m.probWetter <= 0.4 ? "↓" : "≈"} {Math.round(m.probWetter * 100)}%
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
        <Slider id="dT" label={`🌡️ ${t("f.temp")}`} value={dT} min={0} max={3} step={0.5} onChange={setDT} format={(v) => `+${v.toFixed(1)}°C`} />
        <Slider id="dP" label={`🌧️ ${t("f.rain")}`} value={dP} min={-40} max={20} step={5} onChange={setDP} format={(v) => `${v > 0 ? "+" : ""}${v}%`} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px]">
        <span className="text-[var(--fg-3)]">{t("f.presets")}:</span>
        <Button size="sm" variant="secondary" onClick={() => { setDT(1); setDP(-30); }}>🏜️ {t("f.drought")}</Button>
        <Button size="sm" variant="secondary" onClick={() => { setDT(0); setDP(-30); }}>🏔️ {t("ws.lvl.low") === "PAST" ? "Kam suvli yil" : "Low-water year"}</Button>
        <Button size="sm" variant="secondary" onClick={() => { setDT(2.5); setDP(0); }}>🔥 {t("f.hot")}</Button>
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
              {moved > 0 && <span className="text-[12.5px] text-[var(--accent)]">⬆</span>}
              {fail?.detail && <span className="text-[12.5px] text-[var(--danger-fg)]">{fail.detail}</span>}
              <span className="ml-auto text-[12.5px] text-[var(--fg-3)] tnum">💧 {num(r.water)}</span>
            </m.div>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ 🗺️ map layers */

const GIBS = (layer: string, tms: string, date: string, ext: "png" | "jpg" = "png") => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${date}/${tms}/{z}/{y}/{x}.${ext}`;
type GibsId = "none" | "truecolor" | "ndvi" | "snow" | "lst" | "smap" | "rain" | "relief";
const GIBS_LAYER: Record<Exclude<GibsId, "none">, { layer: string; tms: string; z: number; ext?: "jpg"; attr: string; fixed?: boolean }> = {
  truecolor: { layer: "MODIS_Terra_CorrectedReflectance_TrueColor", tms: "GoogleMapsCompatible_Level9", z: 9, ext: "jpg", attr: "NASA GIBS · MODIS Terra" },
  ndvi: { layer: "MODIS_Terra_NDVI_8Day", tms: "GoogleMapsCompatible_Level9", z: 9, attr: "NASA GIBS · MODIS" },
  snow: { layer: "MODIS_Terra_NDSI_Snow_Cover", tms: "GoogleMapsCompatible_Level8", z: 8, attr: "NASA GIBS · MODIS NDSI" },
  lst: { layer: "MODIS_Terra_Land_Surface_Temp_Day", tms: "GoogleMapsCompatible_Level7", z: 7, attr: "NASA GIBS · MODIS LST" },
  smap: { layer: "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture", tms: "GoogleMapsCompatible_Level6", z: 6, attr: "NASA GIBS · SMAP L4" },
  rain: { layer: "IMERG_Precipitation_Rate", tms: "GoogleMapsCompatible_Level6", z: 6, attr: "NASA GIBS · GPM IMERG" },
  relief: { layer: "SRTM_Color_Index", tms: "GoogleMapsCompatible_Level8", z: 8, attr: "NASA GIBS · SRTM", fixed: true },
};

export function MapTab({ data }: { data: AnalyzeResponse }) {
  const { t } = useT();
  const [layer, setLayer] = useState<GibsId>("ndvi");
  const [opacity, setOpacity] = useState(70);
  const [date, setDate] = useState(() => new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10));
  const overlay = useMemo(() => {
    if (layer === "none") return null;
    const g = GIBS_LAYER[layer];
    return { url: GIBS(g.layer, g.tms, g.fixed ? "default" : date, g.ext), opacity: opacity / 100, maxNativeZoom: g.z, attribution: g.attr };
  }, [layer, opacity, date]);
  // N12: open the same place, date and layer in NASA Worldview (for slides)
  const [la, lo] = data.field.centroid;
  const worldview = `https://worldview.earthdata.nasa.gov/?v=${lo - 0.6},${la - 0.4},${lo + 0.6},${la + 0.4}&l=${layer === "none" || layer === "relief" ? "" : `${GIBS_LAYER[layer].layer},`}MODIS_Terra_CorrectedReflectance_TrueColor,Reference_Labels_15m&t=${date}`;
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
      <div className="h-[60dvh] min-h-[380px] overflow-hidden rounded-[24px] shadow-[var(--shadow-card)]">
        <FieldMap value={data.field.polygon} basemap="sat" readOnly overlay={overlay} />
      </div>
      <Card>
        <CardTitle>{t("map.layers")}</CardTitle>
        <div className="grid gap-1">
          {([["none", "map.sat"], ["truecolor", "map.truecolor"], ["ndvi", "map.ndvi"], ["snow", "map.snow"], ["lst", "map.lst"], ["smap", "map.smap"], ["rain", "map.rain"], ["relief", "map.relief"]] as const).map(([id, k]) => (
            <label key={id} className={clsx("flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[14px]", layer === id && "bg-[var(--accent-soft)]")}>
              <input type="radio" name="layer" className="accent-[var(--accent-fill)]" checked={layer === id} onChange={() => setLayer(id)} />
              {t(k as Key)}
            </label>
          ))}
        </div>
        <div className="mt-3">
          <Slider id="op" label={t("map.opacity")} value={opacity} min={10} max={100} step={5} onChange={setOpacity} format={(v) => `${v}%`} />
        </div>
        <label htmlFor="mapdate" className="mt-2 block text-[13.5px] text-[var(--fg-2)]">
          {t("map.date")}
          <input id="mapdate" type="date" value={date} max={new Date().toISOString().slice(0, 10)} min="2016-01-01" onChange={(e) => setDate(e.target.value)} className="mt-1 h-10 w-full rounded-xl bg-[var(--surface-2)] px-3 text-[14px]" />
        </label>
        <a href={worldview} target="_blank" rel="noreferrer" className="press mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3 py-2 text-[13.5px] font-semibold">
          🛰️ {t("map.worldview")} ↗
        </a>
        <SourceBadge source="NASA GIBS (WMTS)" className="mt-3" />
      </Card>
    </div>
  );
}
