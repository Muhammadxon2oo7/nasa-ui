"use client";

import { clsx } from "clsx";
import { AnimatePresence, m } from "motion/react";
import { useMemo, useState } from "react";
import type { AnalyzeResponse, CalendarEvent } from "@/types/api";
import { CROPS } from "@/data/crops";
import { cropName, monthLong, monthShort, num } from "@/lib/format";
import { useT } from "@/i18n";
import { spring } from "../ui";
import { cropAt } from "./FieldTwin";

type Item = { icon: string; title: string; detail?: string; strong?: boolean };
const ICON: Record<CalendarEvent["type"], string> = { sow: "🌱", irrigate: "💧", leach: "🧂", harvest: "🌾", weather: "⚠️", livestock: "🐄", pest: "🐛", soil_sample: "🔍", feed: "🧪", prepare: "🧹" };
const BARE = "#8D6E63";

/** B1 as a picture: 12 months, what stands on the field, what work falls in each month. Tap a month for details. */
export function CalendarRibbon({ data }: { data: AnalyzeResponse }) {
  const { lang } = useT();
  const L = (uz: string, en: string) => (lang === "uz" ? uz : en);
  const best = data.strategies.find((s) => s.id === data.summary.bestStrategyId) ?? data.strategies[0];
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
    });
  }, []);
  const cal = data.calendar;
  const sched = data.water.byStrategy[best.id]?.schedule ?? [];
  const itemsOf = (y: number, mo: number): Item[] => {
    const out: Item[] = [];
    const key = `${y}-${String(mo).padStart(2, "0")}`;
    const seen = new Set<string>();
    for (const e of [...(cal?.thisWeek ?? []), ...(cal?.next90Days ?? [])]) {
      if (seen.has(e.id) || !(e.date.startsWith(key) || (e.endDate && e.date < key && e.endDate >= key))) continue;
      seen.add(e.id);
      if (e.type === "irrigate" || e.type === "sow" || e.type === "harvest") continue; // derived below for every month
      out.push({ icon: ICON[e.type], title: e.title.replace(/^\p{Extended_Pictographic}️?\s*/u, ""), detail: e.detail, strong: e.severity === "high" || e.type === "leach" });
    }
    for (const x of best.seasons) {
      if (x.crop === "fallow") continue;
      if (x.start.startsWith(key)) out.push({ icon: "🌱", title: L(`${cropName(x.crop, lang)} ekish`, `Sow ${cropName(x.crop, lang)}`), strong: true });
      if (x.end.startsWith(key)) out.push({ icon: "🌾", title: L(`${cropName(x.crop, lang)} o'rimi`, `${cropName(x.crop, lang)} harvest`) });
    }
    const s = sched.find((q) => q.month === mo);
    if (s && cropAt(best, y, mo)) out.push({ icon: "💧", title: L(`${s.times} marta sug'orish`, `Irrigate ${s.times}×`), detail: `~${num(s.m3PerHa)} m³/${L("ga", "ha")}` });
    return out;
  };
  const [sel, setSel] = useState(0);
  const cur = months[sel];
  const items = itemsOf(cur.y, cur.m);
  const c = cropAt(best, cur.y, cur.m);

  return (
    <section className="rounded-[22px] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] sm:p-5" aria-label={L("Yillik reja", "Year plan")}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-[16px] font-semibold">🗓️ {L("Yil davomida dalangiz", "Your field through the year")}</h3>
        <span className="truncate text-[12.5px] text-[var(--fg-3)]">{best.id} · {best.name}</span>
      </div>
      <div className="no-scrollbar -mx-1 overflow-x-auto px-1 pb-1">
        <div className="grid min-w-[620px] grid-cols-12 gap-1.5">
          {months.map((mm, i) => {
            const crop = cropAt(best, mm.y, mm.m);
            const its = itemsOf(mm.y, mm.m);
            return (
              <button key={i} type="button" onClick={() => setSel(i)} aria-pressed={sel === i} className={clsx("press flex flex-col items-center gap-1 rounded-2xl px-0.5 pt-1.5 pb-2 transition-colors", sel === i ? "bg-[var(--surface-2)] ring-2 ring-[var(--accent)]" : "hover:bg-[var(--surface-2)]/70")}>
                <span className="text-[12px] font-semibold text-[var(--fg-3)]">{monthShort(mm.m, lang)}</span>
                <span className="relative h-14 w-full overflow-hidden rounded-xl" style={{ background: crop ? CROPS[crop].color : BARE, opacity: crop ? 1 : 0.55 }}>
                  <span className="absolute inset-0 flex items-center justify-center text-[20px] drop-shadow">{crop ? CROPS[crop].icon : ""}</span>
                </span>
                <span className="flex h-5 flex-wrap items-center justify-center gap-px text-[13px] leading-none">
                  {[...new Set(its.map((x) => x.icon))].slice(0, 3).map((ic) => (
                    <span key={ic}>{ic}</span>
                  ))}
                </span>
                {i === 0 || mm.m === 1 ? <span className="text-[12px] text-[var(--fg-3)] tnum">{mm.y}</span> : <span className="h-[12px]" />}
              </button>
            );
          })}
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <m.div key={sel} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={spring} className="mt-3 rounded-2xl bg-[var(--surface-2)] p-3">
          <div className="mb-2 flex items-center gap-2 text-[14.5px] font-semibold">
            {monthLong(cur.m, lang)} {cur.y}
            <span className="rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: `color-mix(in oklab, ${c ? CROPS[c].color : BARE} 30%, transparent)` }}>
              {c ? `${CROPS[c].icon} ${cropName(c, lang)}` : L("dala bo'sh", "field bare")}
            </span>
          </div>
          {items.length ? (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {items.map((it, k) => (
                <li key={k} className="flex items-start gap-2.5 rounded-xl bg-[var(--surface)] px-3 py-2">
                  <span className="text-[20px] leading-none">{it.icon}</span>
                  <span className="min-w-0">
                    <b className={clsx("block text-[14px] leading-snug", it.strong ? "font-semibold" : "font-medium")}>{it.title}</b>
                    {it.detail && <span className="block text-[12.5px] text-[var(--fg-3)]">{it.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13.5px] text-[var(--fg-3)]">{L("Bu oyda maxsus ish yo'q", "No special work this month")}</p>
          )}
        </m.div>
      </AnimatePresence>
    </section>
  );
}
