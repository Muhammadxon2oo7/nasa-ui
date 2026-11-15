"use client";

import { clsx } from "clsx";
import { AnimatePresence, m } from "motion/react";
import { CalendarDays, CalendarPlus, ChevronDown, Pencil, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AnalyzeResponse, CalendarEvent, CropId, EconomicsInput, FeedbackEntry, Level } from "@/types/api";
import { CROPS } from "@/data/crops";
import { cropName, dayMonth, monthShort, num } from "@/lib/format";
import { loadEcon, profitOf, saveEcon } from "@/lib/economics";
import { toIcs } from "@/lib/ics";
import { useT, type Key } from "@/i18n";
import { useMode } from "@/store/platformStore";
import { XYChart } from "../charts";
import { Button, Card, CardTitle, ScoreBar, SourceBadge, spring } from "../ui";
import { UnknownValue } from "./Unknown";
import { CalendarRibbon } from "../twin/CalendarRibbon";

const LVL_COLOR: Record<Level | "early", string> = { low: "var(--level-high)", medium: "var(--level-low)", high: "var(--water)", early: "var(--fg-3)" };
const LVL_FG: Record<Level | "early", string> = { low: "var(--level-high-fg)", medium: "var(--level-low-fg)", high: "var(--fg)", early: "var(--fg-3)" };
const isoDM = (iso: string, lang: "uz" | "en") => dayMonth(iso.slice(5, 10), lang);
const safeGet = <T,>(k: string, fb: T): T => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "null") ?? fb;
  } catch {
    return fb;
  }
};
const safeSet = (k: string, v: unknown) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

/* ------------------------------------------------------------------ B1: this week */

function EventRow({ e, lang }: { e: CalendarEvent; lang: "uz" | "en" }) {
  return (
    <li className="flex gap-3 rounded-2xl bg-[var(--surface-2)] px-3 py-2.5">
      <span className="w-[86px] shrink-0 text-[12.5px] font-semibold text-[var(--fg-3)] tnum">
        {isoDM(e.date, lang)}
        {e.endDate && e.endDate !== e.date && <span className="block font-normal">- {isoDM(e.endDate, lang)}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <b className={clsx("block text-[14.5px] leading-snug font-semibold", e.severity === "high" && "text-[var(--danger-fg)]")}>{e.title}</b>
        {e.detail && <span className="block text-[13px] text-[var(--fg-2)]">{e.detail}</span>}
        <span className="text-[12px] text-[var(--fg-3)]">{e.source}</span>
      </span>
    </li>
  );
}

export function ThisWeekCard({ data, onOpen }: { data: AnalyzeResponse; onOpen?: () => void }) {
  const { t, lang } = useT();
  const c = data.calendar;
  if (!c) return null;
  const end = new Date(new Date(c.today).getTime() + 6 * 864e5).toISOString().slice(0, 10);
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle className="mb-0 flex-1">
          <CalendarDays size={17} className="mr-1.5 inline -translate-y-px text-[var(--fg-3)]" />{t("cal.thisWeek")} <span className="font-normal text-[var(--fg-3)]">· {isoDM(c.today, lang)} - {isoDM(end, lang)}</span>
        </CardTitle>
        {onOpen && (
          <button type="button" onClick={onOpen} className="press text-[13.5px] font-semibold text-[var(--accent)]">
            {t("tab.calendar")} →
          </button>
        )}
      </div>
      {c.thisWeek.length ? (
        <ul className="grid gap-1.5">
          {c.thisWeek.slice(0, 4).map((e) => (
            <EventRow key={e.id} e={e} lang={lang} />
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-[var(--fg-2)]">{t("cal.nothing")}</p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ B1: calendar tab (+N2, N8) */

export function CalendarTab({ data }: { data: AnalyzeResponse }) {
  const { t, lang } = useT();
  const c = data.calendar;
  const download = () => {
    if (!c) return;
    const blob = new Blob([toIcs([...c.thisWeek, ...c.next90Days.filter((e) => !c.thisWeek.some((w) => w.id === e.id))], `TerraVision · ${data.field.region ?? data.fieldId}`)], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fieldshift-${data.fieldId}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  if (!c) return <Card><UnknownValue reason={data.extrasUnknown?.calendar ?? "-"} /></Card>;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <ThisWeekCard data={data} />
      <CalendarRibbon data={data} />
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" onClick={download}>
          <CalendarPlus size={14} /> {t("cal.ics")}
        </Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <LeachingPlanCard data={data} />
        <SowingCard data={data} />
      </div>
    </div>
  );
}

function LeachingPlanCard({ data }: { data: AnalyzeResponse }) {
  const { t, lang } = useT();
  const l = data.calendar?.leaching;
  const [open, setOpen] = useState(false);
  if (!l) return <Card><CardTitle>🧂 {t("cal.leach")}</CardTitle><UnknownValue reason={data.extrasUnknown?.leaching ?? "-"} /></Card>;
  const DEK = (k: string) => {
    const [mo, d] = k.split("-").map(Number);
    return `${monthShort(mo, lang)} ${d}`;
  };
  const maxPct = Math.max(30, ...l.frozenRisk.map((f) => f.pct));
  return (
    <Card className="flex flex-col gap-2">
      <CardTitle source="FAO-29 · ERA5-Land">🧂 {t("cal.leach")}</CardTitle>
      <p className={clsx("text-[14.5px]", l.recommended ? "font-semibold" : "text-[var(--fg-2)]")}>{l.recommended ? l.reason : `${t("cal.notNeeded")}. ${l.reason}`}</p>
      {l.recommended && (
        <>
          <div className="rounded-2xl bg-[var(--water-soft)] px-3 py-2">
            <div className="text-[12.5px] text-[var(--fg-3)]">{t("cal.total")}</div>
            <div className="text-[22px] font-semibold tnum">
              {l.totalLowM3PerHa === l.totalHighM3PerHa ? num(l.totalLowM3PerHa) : `${num(l.totalLowM3PerHa)} - ${num(l.totalHighM3PerHa)}`} <span className="text-[13px] font-normal text-[var(--fg-3)]">{t("m3ha")}</span>
            </div>
            <div className="text-[12.5px] text-[var(--fg-2)]">{t("cal.cont", { n: num(l.continuousM3PerHa) })}</div>
          </div>
          <ol className="grid gap-1">
            {l.stages.map((s, i) => (
              <li key={s.date} className="flex justify-between text-[14px]">
                <span>{t("cal.stage", { n: i + 1 })} · {isoDM(s.date, lang)}</span>
                <b className="tnum">~{num(s.m3PerHa)} {t("m3ha")}</b>
              </li>
            ))}
          </ol>
        </>
      )}
      {l.frozenRisk.length > 0 && (
        <div>
          <div className="mt-1 mb-1 text-[12.5px] text-[var(--fg-3)]">🧊 {t("cal.frozen")}</div>
          <div className="flex h-16 items-end gap-[2px]" role="img" aria-label={t("cal.frozen")}>
            {l.frozenRisk.map((f) => (
              <div key={f.dekad} className="group relative flex-1" title={`${DEK(f.dekad)}: ${f.pct}%`}>
                <div className="rounded-t-[4px]" style={{ height: `${Math.max(2, (f.pct / maxPct) * 56)}px`, background: f.pct >= 25 ? "var(--s1)" : "color-mix(in oklab, var(--s1) 45%, transparent)" }} />
              </div>
            ))}
          </div>
          <div className="mt-0.5 flex justify-between text-[12px] text-[var(--fg-3)]">
            <span>{DEK(l.frozenRisk[0].dekad)}</span>
            <span>{DEK(l.frozenRisk[l.frozenRisk.length - 1].dekad)}</span>
          </div>
        </div>
      )}
      {l.warnings.map((w) => (
        <p key={w} className="text-[13px] text-[var(--warn-fg,var(--fg-2))]">{w}</p>
      ))}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="press mt-1 flex items-center gap-1 self-start text-[13.5px] font-semibold text-[var(--fg-2)]">
        <ChevronDown size={15} className={clsx("transition-transform", open && "rotate-180")} /> {t("cal.leachHow")}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
            <p className="rounded-2xl bg-[var(--surface-2)] px-3 py-2 font-mono text-[12.5px] leading-relaxed">
              Dlw = k · Ds · ECi / ECf<br />
              k = {l.inputs.k} ({lang === "uz" ? "navbatlab" : "intermittent"}; {lang === "uz" ? "doimiy" : "continuous"} 0.3) · Ds = {l.inputs.depthM} m<br />
              ECi = {l.inputs.eci} dS/m ({l.inputs.eciSource === "lab" ? (lang === "uz" ? "laboratoriya" : "lab") : lang === "uz" ? "sun'iy yo'ldosh bahosi ±25%" : "satellite estimate ±25%"}) · ECf = {l.inputs.ecf} dS/m ({cropName(l.inputs.nextCrop, lang)})
            </p>
          </m.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function SowingCard({ data }: { data: AnalyzeResponse }) {
  const { t, lang } = useT();
  const s = data.calendar?.soilTempSowing;
  return (
    <Card className="flex flex-col gap-2">
      <CardTitle source="ERA5-Land · Open-Meteo">🌱 {t("cal.sowing")}</CardTitle>
      {s?.length ? (
        <ul className="grid gap-2">
          {s.map((x) => (
            <li key={x.crop} className="rounded-2xl bg-[var(--surface-2)] px-3 py-2">
              <b className="text-[15px]">
                {CROPS[x.crop]?.icon} {t("cal.sowLine", { crop: cropName(x.crop, lang), from: dayMonth(x.windowFrom, lang), to: dayMonth(x.windowTo, lang) })}
              </b>
              <span className="block text-[13px] text-[var(--fg-2)]">{t("cal.sowWhy", { t: x.thresholdC })} · {t("cal.typical", { d: dayMonth(x.typicalDate, lang) })}</span>
              {x.forecastReachInDays != null && <span className="mt-0.5 block text-[13px] font-semibold text-[var(--accent)]">{t("cal.reach", { n: x.forecastReachInDays, t: x.thresholdC })}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <UnknownValue reason={lang === "uz" ? "Rejada bahorgi ekin yo'q yoki tuproq harorati olinmadi" : "No spring crop in the plan or no soil temperature"} />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ N1: water-supply signal */

function Pill({ l }: { l: Level | "early" }) {
  const { t } = useT();
  return (
    <span className="rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ color: LVL_FG[l], background: `color-mix(in oklab, ${LVL_COLOR[l]} 14%, transparent)` }}>
      {t(`ws.lvl.${l}` as Key)}
    </span>
  );
}

export function WaterSupplyCard({ data, onTryDry }: { data: AnalyzeResponse; onTryDry?: () => void }) {
  const { t } = useT();
  const mode = useMode((s) => s.mode);
  const w = data.waterSupply;
  if (!w) return data.extrasUnknown?.waterSupply ? <Card className="flex items-center gap-2 text-[14px]">🏔️ <UnknownValue reason={data.extrasUnknown.waterSupply} /></Card> : null;
  const pct = (p: number) => `${p > 0 ? "+" : ""}${p}`;
  const flows = w.history.filter((h) => h.summerFlow != null).map((h) => h.summerFlow as number);
  const fMed = flows.length ? [...flows].sort((a, b) => a - b)[Math.floor(flows.length / 2)] : 1;
  const weak = w.correlation == null || Math.abs(w.correlation) < 0.4;
  return (
    <Card className="flex flex-col gap-2">
      <CardTitle source="MODIS MOD10A2 · GloFAS">🏔️ {t("ws.title", { b: w.basinName })}</CardTitle>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl bg-[var(--surface-2)] px-3 py-2">
          <div className="flex items-center gap-2 text-[12.5px] text-[var(--fg-3)]">
            {t("ws.last", { s: w.lastSeason.season })} <Pill l={w.lastSeason.level} />
          </div>
          <div className="text-[14.5px]">❄️ {t("ws.snow", { p: pct(w.lastSeason.snowAnomalyPct) })}</div>
          {w.lastSeason.summerFlowPct != null && <div className="text-[13.5px] text-[var(--fg-2)]">🌊 {t("ws.flow", { f: w.flowName, p: pct(w.lastSeason.summerFlowPct) })}</div>}
        </div>
        <div className="rounded-2xl bg-[var(--surface-2)] px-3 py-2">
          <div className="flex items-center gap-2 text-[12.5px] text-[var(--fg-3)]">
            {t("ws.cur", { s: w.currentSeason.season })} <Pill l={w.currentSeason.level} />
          </div>
          <div className="text-[14.5px]">{w.currentSeason.level === "early" ? `⚪ ${t("ws.early")}` : `❄️ ${t("ws.snow", { p: pct(w.currentSeason.snowAnomalyPct ?? 0) })}`}</div>
        </div>
      </div>
      {mode === "expert" || !weak ? (
        <div>
          <div className="mt-1 text-[12.5px] text-[var(--fg-3)]">{t("ws.chart")}</div>
          <XYChart
            ariaLabel={t("ws.chart")}
            height={190}
            labels={w.history.map((h) => String(h.year))}
            tickEvery={5}
            layers={[
              { type: "bars", id: "snow", label: t("ws.snowSeries"), values: w.history.map((h) => h.marchSnow), color: "var(--s1)" },
              { type: "line", id: "flow", label: t("ws.flowSeries"), values: w.history.map((h) => (h.summerFlow == null ? null : Math.round((h.summerFlow / fMed) * 100))), color: "var(--s2)", dots: true },
            ]}
          />
        </div>
      ) : null}
      {w.correlation != null && <p className="text-[13px] text-[var(--fg-2)] tnum">{t("ws.r", { r: w.correlation, y: w.correlationYears ?? "" })}{weak ? `. ${t("ws.weak")}` : ""}</p>}
      {w.lastSeason.level === "low" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px]">{t("ws.lowTip")}</span>
          {onTryDry && (
            <Button size="sm" variant="secondary" onClick={onTryDry}>
              {t("ws.tryDry")}
            </Button>
          )}
        </div>
      )}
      <p className="text-[12.5px] text-[var(--fg-3)]">{t("ws.disclaimer")}</p>
    </Card>
  );
}

export function WaterSupplyBadge({ data }: { data: AnalyzeResponse }) {
  const { t } = useT();
  const w = data.waterSupply;
  if (!w) return null;
  const l = w.currentSeason.level !== "early" ? w.currentSeason.level : w.lastSeason.level;
  return (
    <span className="mt-1 block text-[12px] font-semibold" style={{ color: LVL_FG[l] }}>
      {t("ws.badge", { l: t(`ws.lvl.${l}` as Key).toLowerCase() })}
    </span>
  );
}

/* ------------------------------------------------------------------ A1 (+N5) and A2 */

export function ActualVsNeedCard({ data }: { data: AnalyzeResponse }) {
  const { t, lang } = useT();
  const a = data.actualWater;
  const key = `fs:applied:${data.fieldId}`;
  const [applied, setApplied] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    const v = safeGet<number | null>(key, null);
    setApplied(v); // eslint-disable-line react-hooks/set-state-in-effect -- read once from localStorage after mount
    setDraft(v ? String(v) : "");
  }, [key]);
  if (!a) return data.extrasUnknown?.actualWater ? <Card className="text-[14px]">💧 {t("aw.title", { y: "" })} <UnknownValue reason={data.extrasUnknown.actualWater} /></Card> : null;
  const gap = Math.round((1 - a.consumedM3PerHa / Math.max(1, a.needM3PerHa)) * 100);
  const eff = applied ? Math.round((a.consumedM3PerHa / applied) * 100) : null;
  const excess = applied ? Math.round((applied - a.consumedM3PerHa * 1.1) / 100) * 100 : null; // 10 % allowance for leaching
  const save = () => {
    const v = Math.round(Number(draft.replace(/\s/g, "")));
    const ok = Number.isFinite(v) && v >= 500 && v <= 40000 ? v : null;
    setApplied(ok);
    safeSet(key, ok);
  };
  return (
    <Card className="flex flex-col gap-2">
      <CardTitle source="Sentinel-2 · NASA POWER · ERA5">💧 {t("aw.title", { y: a.year })}</CardTitle>
      <p className="text-[13px] text-[var(--fg-3)]">{a.crops.map((c) => cropName(c, lang)).join(" + ")}</p>
      <dl className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl bg-[var(--surface-2)] px-3 py-2">
          <dt className="text-[12px] text-[var(--fg-3)]">{t("aw.need")}</dt>
          <dd className="text-[20px] font-semibold tnum">{num(a.needM3PerHa)}</dd>
        </div>
        <div className="rounded-2xl bg-[var(--surface-2)] px-3 py-2">
          <dt className="text-[12px] text-[var(--fg-3)]">{t("aw.consumed")}</dt>
          <dd className="text-[20px] font-semibold tnum">{num(a.consumedM3PerHa)}</dd>
          <dd className="text-[12px] text-[var(--fg-3)] tnum">{num(a.consumedLow)} - {num(a.consumedHigh)}</dd>
        </div>
        <div className="rounded-2xl bg-[var(--surface-2)] px-3 py-2">
          <dt className="text-[12px] text-[var(--fg-3)]">{t("aw.applied")}</dt>
          <dd className="flex items-center gap-1.5">
            <input inputMode="numeric" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="11 000" aria-label={t("aw.appliedHint")} className="h-9 w-full min-w-0 rounded-xl bg-[var(--surface)] px-2.5 text-[16px] font-semibold tnum" />
          </dd>
          {eff != null && <dd className="text-[12px] text-[var(--fg-2)]">{t("aw.efficiency", { p: eff })}</dd>}
        </div>
      </dl>
      <p className="text-[12px] text-[var(--fg-3)]">{t("m3ha")} · {t("aw.appliedHint")}</p>
      {excess != null && excess > 500 ? <p className="rounded-2xl bg-[var(--accent-soft)] px-3 py-2 text-[14px]">{t("aw.excess", { n: num(excess) })}</p> : applied ? <p className="text-[14px]">{t("aw.ok")}</p> : null}
      {gap >= 20 && <p className="text-[13.5px] text-[var(--fg-2)]">{t("aw.gap", { p: gap })}</p>}
      <XYChart
        ariaLabel={t("aw.chart")}
        height={200}
        unit=" mm"
        labels={a.monthly.map((x) => monthShort(x.month, lang))}
        layers={[
          { type: "bars", id: "use", label: t("aw.consumed"), values: a.monthly.map((x) => x.consumedMm), color: "var(--water)" },
          { type: "line", id: "need", label: t("aw.need"), values: a.monthly.map((x) => x.needMm), color: "var(--s2)", dots: true },
        ]}
      />
      <div>
        <div className="text-[12.5px] font-semibold text-[var(--fg-3)]">{t("aw.checks")}</div>
        <ul className="mt-1 flex flex-wrap gap-1.5 text-[12.5px]">
          {a.checks.map((c) => (
            <li key={c.source} className="flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2.5 py-1">
              <b>{c.source === "wapor" ? "WaPOR" : c.source === "modis" ? "MODIS ET" : "ECOSTRESS"}</b>
              {c.m3PerHa != null ? <span className="tnum">{num(c.m3PerHa)} {t("m3ha")}</span> : <UnknownValue reason={c.note ?? "-"} />}
            </li>
          ))}
        </ul>
        {a.checks.find((c) => c.source === "modis" && c.m3PerHa != null)?.note && <p className="mt-1 text-[12px] text-[var(--fg-3)]">{a.checks.find((c) => c.source === "modis")!.note}</p>}
      </div>
      <p className="text-[12px] text-[var(--fg-3)]">{t("aw.note")} · {a.method}</p>
    </Card>
  );
}

export function NormComparisonRow({ data }: { data: AnalyzeResponse }) {
  const { t } = useT();
  const n = data.norms;
  return (
    <Card className="flex flex-wrap items-center gap-2 py-3 text-[14px]">
      <span className="text-[var(--fg-2)]">📏 {t("norms.title")}:</span>
      {n ? (
        <b className="tnum">
          {num(n.normM3PerHa)} {t("m3ha")} · FAO-56 {num(n.fao56M3PerHa)} · {n.diffPct > 0 ? "+" : ""}
          {n.diffPct}% {Math.abs(n.diffPct) <= 25 ? "✅" : "⚠️"}
        </b>
      ) : (
        <UnknownValue reason={data.extrasUnknown?.norms ?? "-"} />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ N9: FAO GAEZ */

export function GaezSuitabilityRow({ data }: { data: AnalyzeResponse }) {
  const { t, lang } = useT();
  const g = data.gaez;
  if (!g) return data.extrasUnknown?.gaez ? <Card className="text-[14px]">🌍 {t("gaez.title")} <UnknownValue reason={data.extrasUnknown.gaez} /></Card> : null;
  const rows = [...g.crops].sort((a, b) => (b.suitability ?? 0) - (a.suitability ?? 0));
  return (
    <Card>
      <CardTitle source="FAO GAEZ v4 · 9 km">🌍 {t("gaez.title")}</CardTitle>
      <ul className="grid gap-1.5">
        {rows.map((c) => (
          <li key={c.crop} className="grid grid-cols-[minmax(0,1fr)_88px_auto] items-center gap-2 text-[14px]">
            <span className="truncate">
              {CROPS[c.crop]?.icon} {cropName(c.crop, lang)} <span className="text-[12px] text-[var(--fg-3)]">· {t(`gaez.${c.regime}` as Key)}</span>
            </span>
            <ScoreBar value={c.suitability ?? 0} color={(c.suitability ?? 0) >= 70 ? "var(--accent-fill)" : (c.suitability ?? 0) >= 40 ? "var(--level-medium)" : "var(--level-high)"} />
            <span className="w-[120px] text-right text-[13px] text-[var(--fg-2)] tnum">
              {c.suitability}/100{c.attainableKgPerHa && c.crop !== "alfalfa" ? ` · ${num(c.attainableKgPerHa / 1000, 1)} t${c.crop === "cotton" ? ` ${t("gaez.lint")}` : ""}` : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-[var(--fg-3)]">{g.note}</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ B2: economics */

export function EconomicsCard({ data, strategies }: { data: AnalyzeResponse; strategies: AnalyzeResponse["strategies"] }) {
  const { t, lang } = useT();
  const [inp, setInp] = useState<EconomicsInput>({ crops: {} });
  const [open, setOpen] = useState(false);
  useEffect(() => setInp(loadEcon()), []); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage after mount
  const crops = useMemo(() => [...new Set(strategies.flatMap((s) => s.seasons.map((x) => x.crop)))].filter((c) => c !== "fallow") as CropId[], [strategies]);
  const res = strategies.map((s) => ({ s, p: profitOf(s, data, inp) }));
  const mln = (v: number | null) => (v == null ? "-" : `${v >= 0 ? "" : "−"}${num(Math.abs(v) / 1e6, 1)}`);
  const anyMissing = res.some((r) => r.p.missing.length);
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle className="mb-0 flex-1">💰 {t("econ.title")}</CardTitle>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Pencil size={14} /> {t("econ.edit")}
        </Button>
      </div>
      <ul className="grid gap-1.5">
        {res.map(({ s, p }) => (
          <li key={s.id} className="flex flex-wrap items-baseline gap-x-2 rounded-2xl bg-[var(--surface-2)] px-3 py-2 text-[14px]">
            <b className="w-6">{s.id}</b>
            <span className="min-w-0 flex-1 truncate text-[var(--fg-2)]">{s.name}</span>
            {p.profit == null ? (
              <UnknownValue reason={t("econ.missing", { c: p.missing.map((c) => cropName(c, lang)).join(", ") })} />
            ) : (
              <span className="tnum">
                <b className="text-[16px]">~{mln(p.profit)}</b> {t("econ.mln")}
                {p.profitDry != null && <span className="ml-1.5 text-[12.5px] text-[var(--fg-3)]">({t("econ.dry", { v: mln(p.profitDry) })})</span>}
              </span>
            )}
          </li>
        ))}
      </ul>
      {anyMissing && <p className="text-[13px] text-[var(--fg-3)]">{t("econ.need")}</p>}
      {[...new Map(res.flatMap((r) => r.p.capped).map((c) => [c.crop, c])).values()].map((c) => (
        <p key={c.crop} className="text-[12.5px] text-[var(--fg-3)]">{t("econ.capped", { c: cropName(c.crop, lang), n: c.t })}</p>
      ))}
      <p className="text-[12px] text-[var(--fg-3)]">{t("econ.warn")} {t("econ.method")}</p>
      <AnimatePresence>{open && <CostsDialog crops={crops} value={inp} onClose={() => setOpen(false)} onSave={(v) => (setInp(v), saveEcon(v), setOpen(false))} />}</AnimatePresence>
    </Card>
  );
}

function CostsDialog({ crops, value, onClose, onSave }: { crops: CropId[]; value: EconomicsInput; onClose: () => void; onSave: (v: EconomicsInput) => void }) {
  const { t, lang } = useT();
  const [v, setV] = useState<EconomicsInput>(value);
  const set = (c: CropId, k: "yieldTPerHa" | "priceUzsPerKg" | "costUzsPerHa", s: string) => {
    const n = s.trim() === "" ? undefined : Number(s.replace(/\s/g, "").replace(",", "."));
    setV((o) => ({ crops: { ...o.crops, [c]: { ...o.crops[c], [k]: Number.isFinite(n) ? n : undefined } } }));
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [onClose]);
  return (
    <>
      <m.div className="fixed inset-0 z-50 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <m.div role="dialog" aria-modal aria-label={t("econ.edit")} initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.98 }} transition={spring} className="lg lg-strong fixed inset-x-3 bottom-3 z-50 mx-auto max-h-[85dvh] max-w-2xl overflow-y-auto rounded-[28px] p-4 sm:top-[10dvh] sm:bottom-auto">
        <div className="mb-2 flex items-center">
          <h2 className="flex-1 text-[18px] font-semibold">{t("econ.edit")}</h2>
          <button type="button" onClick={onClose} className="press rounded-full p-2" aria-label={t("close")}>
            <X size={18} />
          </button>
        </div>
        <div className="grid grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))] gap-x-2 gap-y-1.5 text-[13px]">
          <span />
          <span className="text-[var(--fg-3)]">{t("econ.yield")}</span>
          <span className="text-[var(--fg-3)]">{t("econ.price")}</span>
          <span className="text-[var(--fg-3)]">{t("econ.cost")}</span>
          {crops.map((c) => (
            <div key={c} className="contents">
              <span className="self-center truncate text-[14px] font-medium">
                {CROPS[c]?.icon} {cropName(c, lang)}
              </span>
              {(["yieldTPerHa", "priceUzsPerKg", "costUzsPerHa"] as const).map((k) => (
                <input key={k} inputMode="decimal" defaultValue={v.crops[c]?.[k] ?? ""} onChange={(e) => set(c, k, e.target.value)} aria-label={`${cropName(c, lang)} ${k}`} className="h-10 min-w-0 rounded-xl bg-[var(--surface-2)] px-2 text-[16px] tnum" />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("close")}
          </Button>
          <Button onClick={() => onSave(v)}>{t("save")}</Button>
        </div>
      </m.div>
    </>
  );
}

/* ------------------------------------------------------------------ C3: feedback (UI only, local) */

export function FeedbackPrompt({ data }: { data: AnalyzeResponse }) {
  const { t } = useT();
  const key = `fs:feedback:${data.fieldId}`;
  const [fb, setFb] = useState<FeedbackEntry | null>(null);
  const [rating, setRating] = useState(0);
  const [yieldT, setYieldT] = useState("");
  const [consent, setConsent] = useState(false);
  useEffect(() => setFb(safeGet<FeedbackEntry | null>(key, null)), [key]); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage after mount
  const save = () => {
    const e: FeedbackEntry = { fieldId: data.fieldId, at: new Date().toISOString(), rating: rating || undefined, yieldTPerHa: Number(yieldT) || undefined };
    if (consent) safeSet(key, e);
    setFb(e);
  };
  if (fb)
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--surface)] px-4 py-3 text-[13.5px] text-[var(--fg-2)] shadow-[var(--shadow-card)]">
        <span className="flex-1">💚 {t("fb.saved")}</span>
        <button type="button" className="press font-semibold text-[var(--fg-3)] underline" onClick={() => (safeSet(key, null), setFb(null), setRating(0))}>
          {t("fb.delete")}
        </button>
      </div>
    );
  return (
    <Card className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[14.5px] font-semibold">{t("fb.title")}</span>
        <div className="flex gap-0.5" role="radiogroup" aria-label={t("fb.title")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n}`} onClick={() => setRating(n)} className={clsx("press flex h-10 w-9 items-center justify-center text-[22px] leading-none transition-[transform,opacity]", n <= rating ? "scale-105" : "opacity-35 grayscale")}>
              ⭐
            </button>
          ))}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {rating > 0 && (
          <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="grid gap-2 overflow-hidden">
            <label className="text-[13px] text-[var(--fg-2)]">
              {t("fb.yield")}
              <input inputMode="decimal" value={yieldT} onChange={(e) => setYieldT(e.target.value)} className="mt-1 ml-2 h-10 w-28 rounded-xl bg-[var(--surface-2)] px-3 text-[16px] tnum" />
            </label>
            <label className="flex items-start gap-2 text-[13px] text-[var(--fg-2)]">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[var(--accent-fill)]" />
              {t("fb.consent")}
            </label>
            <Button size="sm" className="self-start" onClick={save}>
              {t("fb.send")}
            </Button>
          </m.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

export { SourceBadge };
