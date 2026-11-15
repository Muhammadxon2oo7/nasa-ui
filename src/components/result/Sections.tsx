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
export function AnswerCard({ data, best, bestScore, water, onMore }: { data: AnalyzeResponse; best: Strategy; bestScore: number; water: number; onMore: () => void }) {
  const { t, lang } = useT();
  const L = (uz: string, en: string) => (lang === "uz" ? uz : en);
  const cur = data.strategies.find((s) => s.isCurrent);
  const keep = cur && cur.id === best.id;
  const diff = cur && !keep ? Math.round((water - cur.waterM3PerHa) / 100) * 100 : 0;
  const why = best.explanation.why?.trim() || data.summary.text;
  const trend = (data.soil.salinityTrendPct ?? 0) > 5 && data.soil.salinityLevel !== "low";
  return (
    <m.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="relative flex flex-col overflow-hidden rounded-[26px] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] ring-1 ring-[var(--gold)]/40 sm:p-6">
      <div className="mt-1.5 flex flex-wrap items-end gap-x-4 gap-y-2">
        <h2 className="w-full min-w-0 shrink-0 text-[clamp(21px,2.6vw,27px)] leading-tight font-semibold tracking-[-0.025em] text-balance">{best.name}</h2>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--gold)_16%,transparent)] px-2.5 py-1 text-[12.5px] font-semibold text-[var(--fg)]">
            <Trophy size={13} className="text-[var(--gold)]" /> {keep ? L("Hozirgisi eng yaxshi", "Current is best") : L("Tavsiya", "Recommended")}
          </span>
          <span className="text-[30px] font-semibold tracking-[-0.03em] text-[var(--accent)] tnum">{bestScore}</span>
          <span className="text-[13px] text-[var(--fg-3)]">/100</span>
          {best.robustness && <RobustnessBadge score={best.robustness.score} worst={best.robustness.worstScore} />}
        </div>
      </div>
      <p className="mt-2 max-w-[70ch] text-[14.5px] leading-relaxed text-[var(--fg-2)] line-clamp-2">{why}</p>
      <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
        <div className="rounded-2xl bg-[var(--surface-2)] px-3.5 py-2.5">
          <dt className="flex items-center gap-1.5 text-[12.5px] text-[var(--fg-3)]"><Droplet size={13} /> {L("Suv, yiliga", "Water per year")}</dt>
          <dd className="text-[19px] font-semibold tnum">
            {num(water)} <span className="text-[12.5px] font-medium text-[var(--fg-3)]">{t("m3ha")}</span>
          </dd>
          {diff < -300 && <dd className="text-[12.5px] font-semibold text-[var(--accent)] tnum">{L(`hozirgidan ${num(-diff)} kam`, `${num(-diff)} less than now`)}</dd>}
          {diff > 300 && <dd className="text-[12.5px] text-[var(--fg-3)] tnum">{L(`hozirgidan ${num(diff)} ko'p`, `${num(diff)} more than now`)}</dd>}
          <WaterSupplyBadge data={data} />
        </div>
        <div className="rounded-2xl bg-[var(--surface-2)] px-3.5 py-2.5">
          <dt className="flex items-center gap-1.5 text-[12.5px] text-[var(--fg-3)]"><FlaskConical size={13} /> {L("Sho'rlanish", "Salinity")}</dt>
          <dd className="mt-1 flex items-center gap-1.5">
            <LevelBadge level={data.summary.salinity} /> {trend && <span className="text-[12.5px] text-[var(--fg-2)]">↑ {L("ortmoqda", "rising")}</span>}
          </dd>
        </div>
        <div className="rounded-2xl bg-[var(--surface-2)] px-3.5 py-2.5">
          <dt className="flex items-center gap-1.5 text-[12.5px] text-[var(--fg-3)]"><AlertTriangle size={13} /> {L("Asosiy xavf", "Main risk")}</dt>
          <dd className="text-[17px] font-semibold">{data.summary.mainRisk}</dd>
        </div>
      </dl>
      <button type="button" onClick={onMore} className="press mt-auto inline-flex self-start pt-4 items-center gap-1.5 text-[14.5px] font-semibold text-[var(--accent)]">
        {L("Nega aynan shu? Boshqa variantlar", "Why this? Other options")} <ArrowRight size={16} />
      </button>
    </m.article>
  );
}
