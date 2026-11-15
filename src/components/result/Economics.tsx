"use client";

import { clsx } from "clsx";
import { AlertTriangle, CheckCircle2, ExternalLink, Info } from "lucide-react";
import type { AnalyzeResponse, Strategy, StrategyIncome, WaterNorm } from "@/types/api";
import { cropName, num } from "@/lib/format";
import { useT } from "@/i18n";
import { Card, CardTitle } from "../ui";

const CONF: Record<NonNullable<StrategyIncome["confidence"]>, { uz: string; en: string; tone: string }> = {
  high: { uz: "ishonch yuqori", en: "high confidence", tone: "bg-[var(--accent-soft)] text-[var(--accent)]" },
  medium: { uz: "ishonch o'rta", en: "medium confidence", tone: "bg-[var(--surface-2)] text-[var(--fg-2)]" },
  low: { uz: "ishonch past", en: "low confidence", tone: "bg-[var(--warn-bg)] text-[var(--warn-fg)]" },
  proxy: { uz: "taxminiy manba", en: "proxy source", tone: "bg-[var(--warn-bg)] text-[var(--warn-fg)]" },
};

/** Compact "≈ $2 290/ha" for strategy cards. */
export function incomeShort(inc: StrategyIncome | undefined) {
  return inc?.usdPerHa == null ? null : `≈ $${num(inc.usdPerHa)}`;
}

/** B2: estimated gross revenue with its range, confidence and the yield × price behind it. */
export function IncomeDetail({ income, profit }: { income?: StrategyIncome; profit?: Strategy["profit"] }) {
  const { lang } = useT();
  const L = (uz: string, en: string) => (lang === "en" ? en : uz);
  if (!income) return null;
  if (income.usdPerHa == null)
    return (
      <p className="text-[13.5px] text-[var(--fg-2)]">
        {L("Hisoblanmadi", "Not computed")}: {income.reason ?? (income.missing?.length ? `${L("hosil yoki narx yo'q", "no yield or price for")} ${income.missing.map((c) => cropName(c, lang)).join(", ")}` : "-")}
      </p>
    );
  const lo = income.lowUsdPerHa ?? income.usdPerHa, hi = income.highUsdPerHa ?? income.usdPerHa;
  const span = Math.max(1, hi * 1.1);
  const c = income.confidence ? CONF[income.confidence] : null;
  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <b className="text-[22px] font-semibold tracking-[-0.02em] tnum">≈ ${num(income.usdPerHa)}</b>
        <span className="text-[13px] text-[var(--fg-3)]">/{L("ga yiliga", "ha per year")}</span>
        {income.uzsPerHa != null && <span className="text-[13px] text-[var(--fg-2)] tnum">· {num(income.uzsPerHa / 1e6, 1)} {L("mln so'm", "mln UZS")}</span>}
        {c && <span className={clsx("rounded-full px-2 py-0.5 text-[11.5px] font-semibold", c.tone)}>{lang === "en" ? c.en : c.uz}</span>}
      </div>
      {/* range: the line spans low-high yield years, the dot is the expected value */}
      <div className="relative h-2 rounded-full bg-[var(--surface-3,var(--hairline))]" aria-hidden>
        <div className="absolute inset-y-0 rounded-full bg-[var(--accent-fill)]/35" style={{ left: `${(lo / span) * 100}%`, width: `${((hi - lo) / span) * 100}%` }} />
        <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface)] bg-[var(--accent-fill)]" style={{ left: `${(income.usdPerHa / span) * 100}%` }} />
      </div>
      <div className="flex justify-between text-[12px] text-[var(--fg-3)] tnum">
        <span>{L("yomon yil", "poor year")} ${num(lo)}</span>
        <span>{L("yaxshi yil", "good year")} ${num(hi)}</span>
      </div>
      {!!income.byCrop?.length && (
        <ul className="grid gap-1 border-t border-[var(--separator)] pt-2 text-[13px]">
          {income.byCrop.map((b) => (
            <li key={b.crop} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2">
              <span className="font-medium">{cropName(b.crop, lang)}</span>
              <span className="text-[var(--fg-2)] tnum">
                {num(b.yieldTHa, 1)} {L("t/ga", "t/ha")} × ${b.priceUsdKg.toFixed(2)}/kg
              </span>
              <span className="col-span-2 text-[11.5px] leading-snug text-[var(--fg-3)]">
                {b.yieldSource} · {b.priceSource}
              </span>
            </li>
          ))}
        </ul>
      )}
      {profit?.profitUsdPerHa != null && (
        <div className="flex flex-wrap items-baseline gap-x-2 rounded-xl bg-[var(--surface)] px-2.5 py-2 text-[13px]">
          <span className="text-[var(--fg-3)]">{L("Sof foyda (standart xarajatlar)", "Net profit (default costs)")}</span>
          <b className="tnum">≈ ${num(profit.profitUsdPerHa)}</b>
          {profit.costUsdPerHa != null && <span className="text-[var(--fg-3)] tnum">· {L("xarajat", "costs")} ${num(profit.costUsdPerHa)}</span>}
        </div>
      )}
      {income.isGross !== false && <p className="text-[12px] text-[var(--fg-3)]">{L("Yalpi tushum: urug', o'g'it, suv va mehnat xarajatlari ayirilmagan. Sof foydani o'z narxlaringiz bilan pastda hisoblang.", "Gross revenue: seed, fertiliser, water and labour costs are not subtracted. Work out net profit with your own prices below.")}</p>}
    </div>
  );
}

const STATUS = {
  within: { icon: CheckCircle2, tone: "text-[var(--level-low-fg)] bg-[var(--accent-soft)]", uz: "me'yor ichida", en: "within the norm" },
  above: { icon: AlertTriangle, tone: "text-[var(--warn-fg)] bg-[var(--warn-bg)]", uz: "me'yordan yuqori", en: "above the norm" },
  below: { icon: Info, tone: "text-[var(--fg-2)] bg-[var(--surface-2)]", uz: "me'yordan past", en: "below the norm" },
} as const;

/** One crop: the official range as a band, each published value as a tick, our number as the marker. */
function NormScale({ n }: { n: WaterNorm }) {
  const { lang } = useT();
  const [a, b] = n.normRangeM3PerHa;
  const pts = n.points ?? [];
  const max = Math.max(n.calculatedM3PerHa, b, ...pts.map((p) => p.value)) * 1.12;
  const x = (v: number) => `${(v / max) * 100}%`;
  const st = STATUS[n.status];
  const Icon = st.icon;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-[15px]">{cropName(n.crop, lang)}</b>
        <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold", st.tone)}>
          <Icon size={13} /> {n.status === "within" ? (lang === "en" ? st.en : st.uz) : `${lang === "en" ? st.en : st.uz} ${n.diffPct > 0 ? "+" : ""}${n.diffPct}%`}
        </span>
        <span className="ml-auto text-[12px] text-[var(--fg-3)]">{n.basis === "net" ? (lang === "en" ? "net, without canal losses" : "netto, kanal isroflarisiz") : lang === "en" ? "gross" : "brutto"}</span>
      </div>
      <div className="relative mt-5 mb-1 h-2.5 rounded-full bg-[var(--surface-2)]" role="img" aria-label={`${num(n.calculatedM3PerHa)} m³/ha vs ${num(a)}-${num(b)}`}>
        <div className="absolute inset-y-0 rounded-full bg-[var(--accent-fill)]/25" style={{ left: x(a), width: `calc(${x(b)} - ${x(a)})` }} />
        {pts.map((p, i) => (
          <i key={i} title={`${num(p.value)} m³/ga · ${p.label} · ${p.source}`} className="absolute top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-full bg-[var(--fg-3)]" style={{ left: x(p.value) }} />
        ))}
        <div className="absolute -top-6 -translate-x-1/2 text-[12px] font-semibold whitespace-nowrap tnum" style={{ left: x(n.calculatedM3PerHa) }}>
          {num(n.calculatedM3PerHa)}
        </div>
        <div className={clsx("absolute top-1/2 h-4.5 w-4.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[var(--surface)] shadow-sm", n.status === "above" ? "bg-[var(--level-medium)]" : "bg-[var(--accent-fill)]")} style={{ left: x(n.calculatedM3PerHa) }} />
      </div>
      <div className="relative h-4 text-[11.5px] text-[var(--fg-3)] tnum">
        <span className="absolute -translate-x-1/2" style={{ left: x(a) }}>{num(a)}</span>
        <span className="absolute -translate-x-1/2" style={{ left: x(b) }}>{num(b)}</span>
      </div>
      {n.note && <p className="mt-1.5 text-[12.5px] text-[var(--fg-2)]">{n.note}</p>}
      <ul className="mt-1.5 grid gap-0.5 text-[12px] text-[var(--fg-3)]">
        {pts.map((p, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-1.5">
            <span className="tnum font-medium text-[var(--fg-2)]">{num(p.value)}</span>
            <span>· {p.label} ·</span>
            {p.url ? (
              <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline decoration-[var(--hairline-strong)] underline-offset-2 hover:text-[var(--fg)]">
                {p.source} <ExternalLink size={11} />
              </a>
            ) : (
              <span>{p.source}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NormsDetail({ norms }: { norms?: WaterNorm[] }) {
  if (!norms?.length) return null;
  return (
    <div className="grid gap-5">
      {norms.map((n) => (
        <NormScale key={n.crop} n={n} />
      ))}
    </div>
  );
}

/** A2 card for the water tab: the recommended rotation checked against official regional norms. */
export function WaterNormsCard({ data }: { data: AnalyzeResponse }) {
  const { lang } = useT();
  const pick: Strategy | undefined = data.strategies.find((s) => s.id === data.summary.bestStrategyId && s.waterNorms?.length) ?? data.strategies.find((s) => s.waterNorms?.length);
  if (!pick) return null;
  return (
    <Card>
      <CardTitle source={lang === "en" ? "ADB · TIIAME · regional studies" : "ADB · TIIAME · hududiy tadqiqotlar"}>{lang === "en" ? "Checked against official irrigation norms" : "Rasmiy sug'orish me'yorlari bilan tekshiruv"}</CardTitle>
      <p className="-mt-1 mb-4 text-[13.5px] text-[var(--fg-2)]">
        {lang === "en" ? `Strategy ${pick.id} · ${pick.name}. The band is the published range for this zone; ticks are individual sources; the dot is our FAO-56 calculation.` : `${pick.id} strategiya · ${pick.name}. Yo'lak - shu zona uchun e'lon qilingan oraliq; chiziqchalar - alohida manbalar; nuqta - bizning FAO-56 hisobimiz.`}
      </p>
      <NormsDetail norms={pick.waterNorms} />
    </Card>
  );
}
