"use client";

import { EconomicsCard } from "./Extras";
import { IncomeDetail, incomeShort, NormsDetail } from "./Economics";
import { SoilEffects } from "./Insights";
import { Fold, reasonFromData } from "./Sections";
import { ChartColumn, Coins, Droplet, FlaskConical, Minus, Scale, TrendingDown, TrendingUp } from "lucide-react";

import { clsx } from "clsx";
import { AnimatePresence, m } from "motion/react";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleX, Compass, FileQuestion, ListChecks, RotateCcw, ShieldAlert, Sprout, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import type { AnalyzeResponse, Strategy } from "@/types/api";
import { grossM3, initialWeights, METRIC_KEYS, scoreStrategy, type MetricKey, type Weights } from "@/lib/scoring";
import { cropColor, cropIcon, cropName, dayMonth, monthShort, num } from "@/lib/format";
import { useT, type Key } from "@/i18n";
import { useResultUi } from "@/store/resultUiStore";
import { MiniBars, Radar } from "../charts";
import { RobustnessBadge, UnknownValue } from "./Unknown";
import { Card, ScoreBar, Segmented, Slider, SourceBadge, spring } from "../ui";
import { CropDot, G } from "@/components/Glyph";

export const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];
const METRIC_ICON: Record<MetricKey, React.ReactNode> = { water: <G e="💧" />, income: <G e="💰" />, soil: <G e="🌱" />, salinity: <G e="🧂" />, climateRisk: <G e="🌡️" />, labor: <G e="⚡" /> };

export function useRanked(data: AnalyzeResponse) {
  const ui = useResultUi();
  const strategies = ui.whatIf.strategies ?? data.strategies;
  const weights = ui.weights ?? initialWeights([]);
  return useMemo(() => {
    const scored = strategies.map((s, i) => ({ s, i, score: scoreStrategy(s.metrics, weights), gross: grossM3(data.water, s.id, ui.method) || s.waterM3PerHa }));
    const cur = scored.filter((x) => x.s.isCurrent);
    const rest = scored.filter((x) => !x.s.isCurrent).sort((a, b) => b.score - a.score);
    return { list: [...cur, ...rest], best: rest[0] ?? scored[0] };
  }, [strategies, weights, data.water, ui.method]);
}

export function StrategiesTab({ data }: { data: AnalyzeResponse }) {
  const { t } = useT();
  const ui = useResultUi();
  const { list, best } = useRanked(data);
  const [view, setView] = useState<"table" | "radar">("table");
  const selected = list.find((x) => x.s.id === ui.selected);
  const nearestAll = list.filter((x) => !x.s.isCurrent).every((x) => x.s.isNearest);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      {nearestAll && (
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--warn-border)] bg-[var(--warn-bg)] px-3.5 py-2.5 text-[13.5px] text-[var(--warn-fg)]">
          <AlertTriangle size={15} /> {t("st.nearest")}
        </div>
      )}
      <p className="px-1 text-[13px] text-[var(--fg-3)]">{t("f.pickHint")}</p>
      <div className="snap-x-cards no-scrollbar -mx-3 flex gap-2.5 overflow-x-auto px-3 pb-1 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        {list.map((x) => (
          <m.div key={x.s.id} layout transition={{ type: "spring", bounce: 0.15, duration: 0.55 }} className="w-[78vw] max-w-[300px] shrink-0 md:w-auto md:max-w-none">
            <StrategyCard st={x.s} score={x.score} gross={x.gross} color={SERIES[x.i]} isBest={x === best} open={ui.selected === x.s.id} onToggle={() => ui.set({ selected: ui.selected === x.s.id ? null : x.s.id })} />
          </m.div>
        ))}
      </div>

      <AnimatePresence initial={false}>
        {selected && (
          <m.div key={selected.s.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ type: "spring", bounce: 0, duration: 0.5 }} className="overflow-hidden">
            <StrategyDetail data={data} st={selected.s} color={SERIES[selected.i]} />
          </m.div>
        )}
      </AnimatePresence>

      <Fold icon={<ChartColumn size={18} />} title={t("f.compare")} hint={list.map((x) => `${x.s.id}: ${x.score}`).join(" · ")}>
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <Segmented size="sm" value={view} onChange={setView} options={[{ value: "table", label: t("st.table") }, { value: "radar", label: t("st.radar") }]} />
        </div>
        {view === "table" ? <ComparisonTable list={list} /> : <Radar axes={METRIC_KEYS.map((k) => t(`mt.${k}` as Key))} series={list.map((x) => ({ id: x.s.id, label: `${x.s.id} · ${x.s.name}`, color: SERIES[x.i], values: METRIC_KEYS.map((k) => x.s.metrics[k] ?? 0) }))} />}
      </Card>
      </Fold>
      <Fold icon={<Scale size={18} />} title={t("f.weights")} hint={t("f.weightsHint")}>
        <WeightSliders />
      </Fold>
      <Fold icon={<Coins size={18} />} title={t("f.profit")}>
        <EconomicsCard data={data} strategies={list.map((x) => x.s)} />
      </Fold>
    </div>
  );
}

function WeightSliders() {
  const { t } = useT();
  const ui = useResultUi();
  const w = ui.weights ?? initialWeights([]);
  const [initial] = useState(w);
  const set = (k: MetricKey, v: number) => ui.set({ weights: { ...w, [k]: v } as Weights });
  return (
    <Card>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{t("st.priorities")}</h3>
        <button type="button" onClick={() => ui.set({ weights: initial })} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">
          <RotateCcw size={13} /> {t("reset")}
        </button>
      </div>
      <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
        {METRIC_KEYS.map((k) => (
          <Slider key={k} id={`w-${k}`} label={t(`mt.${k}` as Key)} icon={<span aria-hidden>{METRIC_ICON[k]}</span>} value={w[k]} min={0} max={3} step={0.5} onChange={(v) => set(k, v)} format={(v) => v.toFixed(1)} />
        ))}
      </div>
    </Card>
  );
}

function StrategyCard({ st, score, gross, color, isBest, open, onToggle }: { st: Strategy; score: number; gross: number; color: string; isBest: boolean; open: boolean; onToggle: () => void }) {
  const { t } = useT();
  return (
    <div className={clsx("flex h-full flex-col rounded-[22px] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]", st.isCurrent && "bg-[var(--surface-2)] ring-1 ring-[var(--hairline-strong)]", isBest && "ring-2 ring-[var(--gold)]")}>
      <div className="flex items-center gap-2 text-[12px] font-semibold tracking-wide uppercase">
        <i className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        <span className="text-[var(--fg-3)]">{st.id}</span>
        {st.isCurrent && <span className="text-[var(--fg-3)]">· {t("st.current")}</span>}
        {isBest && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-[var(--gold-soft)] px-2 py-0.5 text-[var(--gold-fg)]">
            <Trophy size={12} /> {t("st.recommended")}
          </span>
        )}
      </div>
      <div className="mt-2 min-h-[44px] text-[15px] leading-snug font-semibold">{st.name}</div>
      {st.isNearest && !st.isCurrent && <div className="mt-1 text-[12px] font-medium text-[var(--warn-fg)]">{t("st.nearest").split(".")[0]}</div>}
      <div className="mt-3 flex items-baseline gap-2">
        <AnimatedNumber value={score} className="text-[30px] leading-none font-semibold tracking-[-0.03em]" />
        <span className="text-[12px] text-[var(--fg-3)]" title={t("score.help" as Key)}>{t("score.unit" as Key)}</span>
      </div>
      <ScoreBar value={score} color={color} className="mt-2" />
      {st.robustness && (
        <div className="mt-2">
          <RobustnessBadge score={st.robustness.score} worst={st.robustness.worstScore} />
        </div>
      )}
      {/* three facts a farmer asks about, each named (not glyphs) */}
      <dl className="mt-3 grid gap-1 text-[13px]">
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1.5 text-[var(--fg-3)]"><Droplet size={13} /> {t("mt.water")}</dt>
          <dd className="font-semibold tnum">{num(gross)} <span className="font-normal text-[var(--fg-3)]">{t("m3ha")}</span></dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1.5 text-[var(--fg-3)]"><FlaskConical size={13} /> {t("mt.salinity")}</dt>
          <dd className="font-semibold" style={{ color: st.saltFit === "ok" ? "var(--level-low-fg)" : st.saltFit === "warn" ? "var(--level-medium-fg)" : "var(--level-high-fg)" }}>
            {st.saltFit === "ok" ? t("fit.ok" as Key) : st.saltFit === "warn" ? t("fit.warn" as Key) : t("fit.bad" as Key)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1.5 text-[var(--fg-3)]"><Sprout size={13} /> {t("mt.soil")}</dt>
          <dd className="flex items-center gap-1 font-semibold">
            {st.metrics.soil == null ? "-" : st.metrics.soil >= 60 ? <><TrendingUp size={14} className="text-[var(--level-low-fg)]" /> {t("soil.better" as Key)}</> : st.metrics.soil <= 40 ? <><TrendingDown size={14} className="text-[var(--level-high-fg)]" /> {t("soil.worse" as Key)}</> : <><Minus size={14} className="text-[var(--fg-3)]" /> {t("soil.same" as Key)}</>}
          </dd>
        </div>
        {st.income && (
          <div className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-1.5 text-[var(--fg-3)]"><Coins size={13} /> {t("mt.income")}</dt>
            <dd className="font-semibold tnum" title={st.income.usdPerHa == null ? st.income.reason : undefined}>
              {incomeShort(st.income) ?? "-"} {st.income.usdPerHa != null && <span className="font-normal text-[var(--fg-3)]">/{t("ha" as Key)}</span>}
            </dd>
          </div>
        )}
      </dl>
      <button type="button" onClick={onToggle} aria-expanded={open} className="mt-auto flex items-center gap-1 self-start pt-3 text-[13.5px] font-semibold text-[var(--accent)]">
        {open ? t("hide") : t("details")}
        <ChevronDown size={15} className={clsx("transition-transform duration-300", open && "rotate-180")} />
      </button>
    </div>
  );
}

/** contentTransition(.numericText) for UI counters. */
function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  return (
    <span className={clsx("inline-flex overflow-hidden tnum", className)} aria-label={String(value)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span key={value} initial={{ y: "70%", opacity: 0, filter: "blur(3px)" }} animate={{ y: 0, opacity: 1, filter: "blur(0px)" }} exit={{ y: "-70%", opacity: 0, filter: "blur(3px)" }} transition={{ type: "spring", bounce: 0.2, duration: 0.45 }}>
          {value}
        </m.span>
      </AnimatePresence>
    </span>
  );
}

function ComparisonTable({ list }: { list: { s: Strategy; score: number; i: number }[] }) {
  const { t } = useT();
  return (
    <div className="scroll-thin -mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[520px] border-separate border-spacing-0 text-[13.5px]">
        <thead>
          <tr>
            <th className="sticky left-0 bg-[var(--surface)] py-2 pr-3 text-left font-medium text-[var(--fg-3)]" />
            {list.map((x) => (
              <th key={x.s.id} className="px-2 py-2 text-center font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-full" style={{ background: SERIES[x.i] }} />
                  {x.s.id}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRIC_KEYS.map((k) => {
            const vals = list.map((x) => x.s.metrics[k]).filter((v): v is number => v != null);
            const mx = vals.length ? Math.max(...vals) : NaN;
            return (
              <tr key={k}>
                <td className="sticky left-0 border-t border-[var(--hairline)] bg-[var(--surface)] py-2 pr-3 whitespace-nowrap">
                  {METRIC_ICON[k]} {t(`mt.${k}` as Key)}
                </td>
                {list.map((x) => (
                  <td key={x.s.id} className={clsx("border-t border-[var(--hairline)] px-2 py-2 text-center tnum", x.s.metrics[k] === mx && "font-semibold text-[var(--accent)]")}>
                    {x.s.metrics[k] == null ? <UnknownValue reason={x.s.unknownReasons?.[k] ?? t("unk.title")} /> : x.s.metrics[k]}
                  </td>
                ))}
              </tr>
            );
          })}
          {list.some((x) => x.s.robustness) && (
            <tr>
              <td className="sticky left-0 border-t border-[var(--hairline)] bg-[var(--surface)] py-2 pr-3 whitespace-nowrap" title={t("rob.title")}>
                <G e="🛡️" /> {t("rob.label")}
              </td>
              {list.map((x) => (
                <td key={x.s.id} className="border-t border-[var(--hairline)] px-2 py-2 text-center tnum">
                  {x.s.robustness ? `${x.s.robustness.score} (${x.s.robustness.worstScore})` : "-"}
                </td>
              ))}
            </tr>
          )}
          <tr>
            <td className="sticky left-0 border-t-2 border-[var(--hairline-strong)] bg-[var(--surface)] py-2 pr-3 font-semibold">★ {t("st.total")}</td>
            {list.map((x) => (
              <td key={x.s.id} className="border-t-2 border-[var(--hairline-strong)] px-2 py-2 text-center font-semibold tnum">
                {x.score}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ detail */

function RotationTimeline({ st }: { st: Strategy }) {
  const { t, lang } = useT();
  const startOf = (y: number) => Date.UTC(y, 0, 1);
  // Seasons arrive as ISO dates (internal engine) or "MM-DD" (FastAPI, where start > end means the
  // season began the previous autumn). Resolve both to absolute ranges, then every year row shows
  // whatever overlaps it, so winter wheat sown in October appears in both rows.
  const abs = st.seasons.map((x) => {
    if (/^\d{4}-/.test(x.start)) return { ...x, a: Date.parse(x.start), b: Date.parse(x.end) };
    const wraps = x.start > x.end;
    return { ...x, a: Date.parse(`${wraps ? x.year - 1 : x.year}-${x.start}`), b: Date.parse(`${x.year}-${x.end}`) };
  });
  const years = [...new Set(st.seasons.map((s) => s.year))].sort((a, b) => a - b);
  return (
    <div>
      <div className="mb-1 grid grid-cols-[44px_1fr] gap-2 text-[12px] text-[var(--fg-3)]">
        <span />
        <div className="grid grid-cols-12">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className="text-center">
              {monthShort(i + 1, lang)}
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-1.5">
        {years.map((y) => {
          const segs = abs.filter((s) => s.a < startOf(y + 1) && s.b > startOf(y));
          return (
            <div key={y} className="grid grid-cols-[44px_1fr] items-center gap-2">
              <span className="text-[12.5px] font-semibold tnum">{y}</span>
              <div className="hatch relative h-8 overflow-hidden rounded-xl bg-[var(--surface-2)]">
                {segs.map((s) => {
                  const a = Math.max(startOf(y), s.a), b = Math.min(startOf(y + 1), s.b);
                  const left = ((a - startOf(y)) / (startOf(y + 1) - startOf(y))) * 100;
                  const width = ((b - a) / (startOf(y + 1) - startOf(y))) * 100;
                  return (
                    <m.div key={s.crop + s.start + s.year} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={spring} className="absolute inset-y-1 flex origin-left items-center gap-1 overflow-hidden rounded-lg px-1.5 text-[12px] font-semibold whitespace-nowrap text-[#1B2A1E]" style={{ left: `${left}%`, width: `calc(${width}% - 2px)`, background: cropColor(s.crop) }} title={`${cropName(s.crop, lang)}: ${dayMonth(s.start, lang)} - ${dayMonth(s.end, lang)}`}>
                      <CropDot crop={s.crop} />
                      <span className="truncate">{cropName(s.crop, lang)}</span>
                    </m.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {st.sowWindow && st.sowWindow.length > 0 && (
        <p className="mt-2 text-[13px] text-[var(--fg-2)]">
          <G e="🌱" /> {t("st.sow")}: {st.sowWindow.map((w) => `${cropName(w.crop, lang)} ${dayMonth(w.from, lang)} - ${dayMonth(w.to, lang)}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

function Block({ icon, title, children, tone }: { icon: React.ReactNode; title: string; children: React.ReactNode; tone?: "warn" | "muted" }) {
  return (
    <div className={clsx("rounded-2xl p-3.5", tone === "warn" ? "bg-[var(--warn-bg)]" : "bg-[var(--surface-2)]")}>
      <div className={clsx("mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold", tone === "warn" ? "text-[var(--warn-fg)]" : "text-[var(--fg)]")}>
        {icon} {title}
      </div>
      <div className="text-[14px] leading-relaxed text-[var(--fg-2)]">{children}</div>
    </div>
  );
}

function StrategyDetail({ data, st, color }: { data: AnalyzeResponse; st: Strategy; color: string }) {
  const { t, lang } = useT();
  const e = st.explanation;
  const wm = data.water.byStrategy[st.id]?.monthly ?? [];
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <i className="h-3 w-3 rounded-full" style={{ background: color }} />
        <h3 className="text-[17px] font-semibold">
          {st.id} · {st.name}
        </h3>
      </div>
      <div className="mb-4">
        <div className="mb-2 text-[12px] font-semibold tracking-wide text-[var(--fg-3)] uppercase">{t("st.plan")}</div>
        <RotationTimeline st={st} />
      </div>
      <div className="grid gap-2.5 md:grid-cols-2">
        <Block icon={<Compass size={15} />} title={t("st.why")}>
          <p>{!e.why || e.why.startsWith(st.name) || e.why.length < 40 ? reasonFromData(st, data.strategies.find((x) => x.isCurrent), st.waterM3PerHa, lang === "en" ? "en" : "uz") ?? e.why : e.why}</p>
        </Block>
        <Block icon={<ListChecks size={15} />} title={t("st.evidence")}>
          <ul className="grid gap-1.5">
            {e.evidence.map((ev) => (
              <li key={ev.text} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                <span>• {ev.text}</span>
                <SourceBadge source={ev.source} />
              </li>
            ))}
          </ul>
        </Block>
        <Block icon={<Sprout size={15} />} title={t("st.benefits")}>
          <ul className="grid gap-1">{e.benefits.map((b) => <li key={b}>{b}</li>)}</ul>
        </Block>
        <Block icon={<FileQuestion size={15} />} title={t("st.gaps")}>
          <ul className="grid gap-1">{e.gaps.map((b) => <li key={b}>{b}</li>)}</ul>
        </Block>
        <Block icon={<ShieldAlert size={15} />} title={t("st.risks")} tone="warn">
          <ul className="grid gap-1">{e.risks.map((b) => <li key={b}>{b}</li>)}</ul>
        </Block>
        <Block icon={<Droplet size={15} />} title={`${t("st.monthlyWater")} (${t("mm")})`}>
          <MiniBars values={wm.map((m) => m.irrigationMm)} color="var(--water)" labels={wm.map((m) => monthShort(m.month, lang))} />
        </Block>
        {st.soilEffects && (
          <Block icon={<Sprout size={15} />} title={lang === "en" ? "What it does to the soil" : "Tuproqqa ta'siri"}>
            <SoilEffects st={st} />
          </Block>
        )}
        {st.income && (
          <Block icon={<Coins size={15} />} title={lang === "en" ? "Expected revenue" : "Kutilayotgan tushum"}>
            <IncomeDetail income={st.income} profit={st.profit} />
          </Block>
        )}
        {!!st.waterNorms?.length && (
          <Block icon={<Scale size={15} />} title={lang === "en" ? "Water vs official norms" : "Suv: rasmiy me'yorlar bilan"}>
            <NormsDetail norms={st.waterNorms} />
          </Block>
        )}
      </div>
      <div className="mt-3">
        <div className="mb-1.5 text-[12px] font-semibold tracking-wide text-[var(--fg-3)] uppercase">{t("st.rules")}</div>
        <div className="flex flex-wrap gap-1.5">
          {st.rules.map((r) => (
            <span key={r.id} title={r.detail} className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-medium", r.status === "pass" && "bg-[var(--accent-soft)] text-[var(--accent)]", r.status === "warn" && "bg-[var(--warn-bg)] text-[var(--warn-fg)]", r.status === "fail" && "bg-[var(--danger-bg)] text-[var(--danger-fg)]", r.status === "unknown" && "bg-[var(--surface-2)] text-[var(--fg-2)]")}>
              {r.status === "pass" ? <CheckCircle2 size={13} /> : r.status === "warn" ? <AlertTriangle size={13} /> : r.status === "unknown" ? <FileQuestion size={13} /> : <CircleX size={13} />}
              {r.label}
              {r.detail && <span className="font-normal opacity-80">: {r.detail}</span>}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-3 text-[12px] text-[var(--fg-3)]">{e.generatedBy === "llm" ? t("aiText") : t("templateText")}</p>
    </Card>
  );
}
