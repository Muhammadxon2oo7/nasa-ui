"use client";

import { clsx } from "clsx";
import { AnimatePresence, m } from "motion/react";
import { AlertTriangle, ArrowRight, ChevronDown, Droplet, FlaskConical, Trophy } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { AnalyzeResponse, Strategy } from "@/types/api";
import { num } from "@/lib/format";
import { useT } from "@/i18n";
import { useMode } from "@/store/platformStore";
import { LevelBadge, spring } from "../ui";
import { RobustnessBadge } from "./Unknown";
import { WaterSupplyBadge } from "./Extras";

/**
 * Progressive disclosure: the answer first, details on demand.
 * Simple mode → closed unless `open`; expert mode → always starts open. Children mount only when opened.
 */
export function Fold({ icon, title, hint, open: initial = false, children }: { icon?: ReactNode; title: string; hint?: ReactNode; open?: boolean; children: ReactNode }) {
  const expert = useMode((s) => s.mode) === "expert";
  const [open, setOpen] = useState(initial || expert);
  return (
    <section className="rounded-[22px] bg-[var(--surface)] shadow-[var(--shadow-card)]">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="press flex w-full items-center gap-3 rounded-[22px] px-4 py-3.5 text-left">
        {icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--fg-2)]" aria-hidden>{icon}</span>}
        <span className="min-w-0 flex-1">
          <b className="block text-[15.5px] tracking-[-0.01em]">{title}</b>
          {hint && !open && <span className="block truncate text-[13px] text-[var(--fg-3)]">{hint}</span>}
        </span>
        <ChevronDown size={18} className={clsx("shrink-0 text-[var(--fg-3)] transition-transform duration-300", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
            <div className="fold-body grid grid-cols-[minmax(0,1fr)] gap-3 px-2 pb-2 sm:px-3 sm:pb-3">{children}</div>
          </m.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** The one-glance answer: what to grow, what it costs in water, what to watch out for, and why. */
/**
 * A reason a farmer can check: the recommended plan against what they grow today, in numbers.
 * Used when the engine's own sentence only repeats the plan's name.
 */
export function reasonFromData(best: Strategy, cur: Strategy | undefined, water: number, lang: "uz" | "en"): string | null {
  const L = (uz: string, en: string) => (lang === "uz" ? uz : en);
  const parts: string[] = [];
  if (cur && cur.id !== best.id) {
    const d = Math.round((cur.waterM3PerHa - water) / 100) * 100;
    if (d >= 300) parts.push(L(`hozirgi rotatsiyadan yiliga ~${num(d)} m³/ga kam suv talab qiladi`, `needs ~${num(d)} m³/ha less water a year than your current rotation`));
    const bi = best.income?.usdPerHa, ci = cur.income?.usdPerHa;
    if (bi != null && ci != null && Math.abs(bi - ci) >= 100)
      parts.push(bi > ci ? L(`taxminiy tushumi ~$${num(bi - ci)}/ga yuqori`, `about $${num(bi - ci)}/ha more gross revenue`) : L(`tushumi ~$${num(ci - bi)}/ga past, lekin suv va tuproq uchun foydaliroq`, `about $${num(ci - bi)}/ha less revenue, but easier on water and soil`));
  }
  if (best.saltFit === "ok") parts.push(L("barcha ekinlari dalangiz sho'rligiga chidamli", "every crop tolerates your field's salinity"));
  if (best.robustness && best.robustness.worstScore >= 60) parts.push(L(`qurg'oqchil yoki issiq yilda ham ${best.robustness.worstScore} ball oladi`, `still scores ${best.robustness.worstScore} in a dry or hot year`));
  if (!parts.length) return null;
  const s = parts.slice(0, 3).join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

const CURRENT_PREFIX = /^(Hozirgi|Current):\s*/i;

export function AnswerCard({ data, best, bestScore, water, onMore, currentScore }: { data: AnalyzeResponse; best: Strategy; bestScore: number; water: number; onMore: () => void; currentScore?: number }) {
  const { t, lang } = useT();
  const L = (uz: string, en: string) => (lang === "uz" ? uz : en);
  const cur = data.strategies.find((s) => s.isCurrent);
  const keep = cur && cur.id === best.id;
  const diff = cur && !keep ? Math.round((water - cur.waterM3PerHa) / 100) * 100 : 0;
  const own = best.explanation.why?.trim() ?? "";
  const echoes = !own || own.startsWith(best.name) || own.length < 40;
  const why = (echoes ? reasonFromData(best, cur, water, lang === "en" ? "en" : "uz") : own) || own || data.summary.text;
  const trend = (data.soil.salinityTrendPct ?? 0) > 5 && data.soil.salinityLevel !== "low";
  return (
    <m.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="relative flex flex-col overflow-hidden rounded-[26px] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] ring-1 ring-[var(--gold)]/40 sm:p-6">
      <div className="mt-1.5 flex flex-wrap items-end gap-x-4 gap-y-2">
        <h2 className="w-full min-w-0 shrink-0 text-[clamp(21px,2.6vw,27px)] leading-tight font-semibold tracking-[-0.025em] text-balance">{best.name}</h2>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--gold)_16%,transparent)] px-2.5 py-1 text-[12.5px] font-semibold text-[var(--fg)]">
            <Trophy size={13} className="text-[var(--gold)]" /> {data.preliminary ? L("Dastlabki baho", "First estimate") : keep ? L("Hozirgisi eng yaxshi", "Current is best") : L("Tavsiya", "Recommended")}
          </span>
          <span className="text-[30px] font-semibold tracking-[-0.03em] text-[var(--accent)] tnum">{bestScore}</span>
          <span className="text-[13px] text-[var(--fg-3)]" title={t("score.help" as never)}>{t("score.unit" as never)}</span>
          {best.robustness && <RobustnessBadge score={best.robustness.score} worst={best.robustness.worstScore} />}
        </div>
      </div>
      {cur && !keep && currentScore != null && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-[var(--fg-3)]">
          <span>{L("Hozirgi", "Today")}:</span>
          <span className="font-medium text-[var(--fg-2)]">{cur.name.replace(CURRENT_PREFIX, "")}</span>
          <span className="tnum">· {currentScore} {t("score.unit" as never)}</span>
        </p>
      )}
      <p className="mt-2 max-w-[70ch] text-[14.5px] leading-relaxed text-[var(--fg-2)] line-clamp-3">
        {data.preliminary
          ? L("Faqat iqlim bo'yicha baho. Sho'rlanish va dala tarixi qo'shilgach tavsiya o'zgarishi mumkin.", "Based on climate only. The pick can change once salinity and field history are in.")
          : why}
      </p>
      <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
        <div className="rounded-2xl bg-[var(--surface-2)] px-3.5 py-2.5">
          <dt className="flex items-center gap-1.5 text-[12.5px] text-[var(--fg-3)]"><Droplet size={13} /> {L("Suv, yiliga", "Water per year")}</dt>
          <dd className="text-[19px] font-semibold tnum">
            {num(water)} <span className="text-[12.5px] font-medium text-[var(--fg-3)]">{t("m3ha")}</span>
          </dd>
          {diff < -300 && <dd className="text-[12.5px] font-semibold text-[var(--accent)] tnum">{L(`hozirgidan ${num(-diff)} kam`, `${num(-diff)} less than now`)}</dd>}
          {diff > 300 && <dd className="text-[12.5px] text-[var(--fg-3)] tnum">{L(`hozirgidan ${num(diff)} ko'p`, `${num(diff)} more than now`)}</dd>}
          <dd><WaterSupplyBadge data={data} /></dd>
        </div>
        <div className="rounded-2xl bg-[var(--surface-2)] px-3.5 py-2.5">
          <dt className="flex items-center gap-1.5 text-[12.5px] text-[var(--fg-3)]"><FlaskConical size={13} /> {L("Sho'rlanish", "Salinity")}</dt>
          <dd className="mt-1 flex items-center gap-1.5">
            {data.preliminary ? <span className="shimmer inline-block h-5 w-20 rounded-full bg-[var(--surface-3)]" aria-label={L("hisoblanmoqda", "computing")} /> : <LevelBadge level={data.summary.salinity} />} {trend && <span className="text-[12.5px] text-[var(--fg-2)]">↑ {L("ortmoqda", "rising")}</span>}
          </dd>
        </div>
        <div className="rounded-2xl bg-[var(--surface-2)] px-3.5 py-2.5">
          <dt className="flex items-center gap-1.5 text-[12.5px] text-[var(--fg-3)]"><AlertTriangle size={13} /> {L("Asosiy xavf", "Main risk")}</dt>
          <dd className="text-[17px] font-semibold">{data.preliminary && (!data.summary.mainRisk || data.summary.mainRisk === "-") ? <span className="shimmer inline-block h-5 w-28 rounded-full bg-[var(--surface-3)]" /> : data.summary.mainRisk}</dd>
        </div>
      </dl>
      <button type="button" onClick={onMore} className="press mt-auto inline-flex self-start pt-4 items-center gap-1.5 text-[14.5px] font-semibold text-[var(--accent)]">
        {L("Nega aynan shu? Boshqa variantlar", "Why this? Other options")} <ArrowRight size={16} />
      </button>
    </m.article>
  );
}
