"use client";

import { clsx } from "clsx";
import { AnimatePresence, m } from "motion/react";
import { Check, FlaskConical, Pencil, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { AnalyzeResponse, CropId } from "@/types/api";
import { CROPS, SELECTABLE } from "@/data/crops";
import { cropIcon, cropName, dayMonth, monthShort, num } from "@/lib/format";
import { useT, type Key } from "@/i18n";
import { XYChart } from "../charts";
import { ndviColor } from "../landing/FieldFromSpace";
import { Button, Card, CardTitle, CropChip, EmptyState, LevelBadge, SourceBadge, spring } from "../ui";
import { GaezSuitabilityRow } from "./Extras";

/* ------------------------------------------------------------------ 📜 history */

export function HistoryTab({ data }: { data: AnalyzeResponse }) {
  const { t, lang } = useT();
  const h = data.history;
  const [sel, setSel] = useState<number | null>(null);
  const [fixed, setFixed] = useState<Record<number, CropId | "ok">>(() => {
    try {
      return JSON.parse(localStorage.getItem(`fs:confirm:${data.fieldId}`) ?? "{}");
    } catch {
      return {};
    }
  });
  const [editing, setEditing] = useState(false);
  const persist = (v: Record<number, CropId | "ok">) => {
    setFixed(v);
    try {
      localStorage.setItem(`fs:confirm:${data.fieldId}`, JSON.stringify(v));
    } catch {}
  };
  const years = h.seasons.map((s) => s.year);
  const bareYears = new Set(h.bareWindows.map((b) => b.start.slice(0, 4))).size;
  const avgBare = h.bareWindows.length ? Math.round(h.bareWindows.reduce((a, b) => a + b.days, 0) / h.bareWindows.length) : 0;

  const labels = h.ndvi.map((n) => `${monthShort(+n.date.slice(5, 7), lang)} ${n.date.slice(2, 4)}`);
  const highlight = sel != null ? h.ndvi.map((n) => (n.date.startsWith(String(sel)) ? n.value : null)) : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <Card>
        <CardTitle source="Sentinel-2 · rules">🤖 {t("h.detected")}</CardTitle>
        <p className="-mt-2 mb-3 text-[12.5px] text-[var(--fg-3)]">{t("h.model")}</p>
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {h.seasons.map((s) => {
            const conf = Math.min(...s.crops.map((c) => c.confidence));
            const f = fixed[s.year];
            return (
              <button key={s.year} type="button" onClick={() => setSel(sel === s.year ? null : s.year)} aria-pressed={sel === s.year} className={clsx("flex min-w-[96px] shrink-0 flex-col items-center gap-1 rounded-2xl px-2.5 py-2.5 transition-colors", sel === s.year ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]" : "bg-[var(--surface-2)] hover:bg-[var(--surface-3)]")}>
                <span className="text-[12.5px] font-semibold tnum">{s.year}</span>
                <span className={clsx("text-[20px] leading-none", conf < 0.6 && !f && "opacity-50")} aria-hidden>
                  {f && f !== "ok" ? cropIcon(f) : s.crops.map((c) => cropIcon(c.crop)).join("→")}
                  {conf < 0.6 && !f && "?"}
                </span>
                <span className="text-[11px] text-[var(--fg-3)] tnum">{f ? "✓" : `${Math.round(conf * 100)}%`}</span>
              </button>
            );
          })}
        </div>
        <AnimatePresence initial={false}>
          {sel != null && (
            <m.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring} className="overflow-hidden">
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--surface-2)] p-3">
                {h.seasons.find((s) => s.year === sel)!.crops.map((c) => (
                  <span key={c.start} className="flex items-center gap-1.5 text-[13.5px]">
                    <CropChip crop={c.crop} faded={c.confidence < 0.6} />
                    <span className="text-[var(--fg-3)] tnum">
                      {dayMonth(c.start, lang)} - {dayMonth(c.end, lang)} · {Math.round(c.confidence * 100)}% {c.confidence < 0.6 ? `(${t("h.lowConf")})` : ""}
                    </span>
                  </span>
                ))}
                <span className="ml-auto flex gap-1.5">
                  {fixed[sel] ? (
                    <span className="flex items-center gap-1 text-[13px] font-medium text-[var(--accent)]">
                      <Check size={14} /> {t("h.thanks")}
                    </span>
                  ) : editing ? (
                    <select autoFocus aria-label={t("h.fix")} className="h-9 rounded-xl bg-[var(--surface)] px-2 text-[14px]" defaultValue="" onChange={(e) => { persist({ ...fixed, [sel]: e.target.value as CropId }); setEditing(false); }}>
                      <option value="" disabled>-</option>
                      {SELECTABLE.map((c) => (
                        <option key={c} value={c}>{cropIcon(c)} {CROPS[c].name[lang]}</option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => persist({ ...fixed, [sel]: "ok" })}>
                        <Check size={14} /> {t("h.correct")}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                        <Pencil size={14} /> {t("h.fix")}
                      </Button>
                    </>
                  )}
                </span>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </Card>

      <Card>
        <CardTitle info="ndvi" source="Sentinel-2 L2A 2017-2026">{t("h.ndvi")}</CardTitle>
        {h.ndvi.some((n) => n.value != null) ? (
          <XYChart
            ariaLabel={t("h.ndvi")}
            labels={labels}
            yMin={0}
            yMax={0.9}
            digits={2}
            height={240}
            legend={false}
            tickEvery={12}
            layers={[
              { type: "line", id: "ndvi", label: "NDVI", values: h.ndvi.map((n) => n.value), color: "var(--accent-fill)" },
              ...(highlight ? [{ type: "line" as const, id: "sel", label: String(sel), values: highlight, color: "var(--gold)", width: 3.5 }] : []),
            ]}
          />
        ) : (
          <EmptyState title={lang === "uz" ? "Bu davr uchun aniq surat topilmadi" : "No clear imagery for this period"} />
        )}
      </Card>

      <Card>
        <CardTitle source="Sentinel-2 L2A">{t("h.calendar")}</CardTitle>
        <div className="scroll-thin overflow-x-auto">
          <div className="min-w-[440px]">
            <div className="mb-1 grid grid-cols-[44px_repeat(12,1fr)] gap-[3px] text-center text-[10.5px] text-[var(--fg-3)]">
              <span />
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i}>{monthShort(i + 1, lang)}</span>
              ))}
            </div>
            {[...years].reverse().map((y) => (
              <div key={y} className="mb-[3px] grid grid-cols-[44px_repeat(12,1fr)] gap-[3px]">
                <span className="text-[12px] font-semibold tnum">{y}</span>
                {Array.from({ length: 12 }, (_, i) => {
                  const v = h.ndvi.find((n) => n.date === `${y}-${String(i + 1).padStart(2, "0")}`)?.value ?? null;
                  return <i key={i} className="h-6 rounded-[6px]" style={{ background: ndviColor(v) }} title={`${monthShort(i + 1, lang)} ${y}: ${v == null ? "-" : v.toFixed(2)}`} />;
                })}
              </div>
            ))}
            <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--fg-3)]">
              0.0
              <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${[0, 0.2, 0.4, 0.6, 0.8].map(ndviColor).join(",")})` }} />
              0.8
            </div>
          </div>
        </div>
        <p className="mt-3 rounded-2xl bg-[var(--accent-soft)] px-3.5 py-2.5 text-[14px] text-[var(--fg)]">{bareYears ? t("h.bare", { n: years.length, k: bareYears, d: avgBare }) : t("h.noBare")}</p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ 🌡️ climate */

export function ClimateTab({ data }: { data: AnalyzeResponse }) {
  const { t, lang } = useT();
  const c = data.climate;
  const months = c.monthly.map((m) => monthShort(m.month, lang));
  const heat = c.heatDays40;
  const hx = heat.map((h) => h.year), hy = heat.map((h) => h.days);
  const trend = useMemo(() => {
    const n = hx.length, mx = hx.reduce((a, b) => a + b, 0) / n, my = hy.reduce((a, b) => a + b, 0) / n;
    const b = hx.reduce((a, x, i) => a + (x - mx) * (hy[i] - my), 0) / Math.max(1e-9, hx.reduce((a, x) => a + (x - mx) ** 2, 0));
    return hx.map((x) => Math.max(0, my + b * (x - mx)));
  }, [hx, hy]);
  const annualP = c.monthly.reduce((a, m) => a + m.precipMm, 0);
  const first5 = hy.slice(0, 5).reduce((a, b) => a + b, 0) / 5, last5 = hy.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const cards = [
    { icon: "❄️", label: t("c.lastFrost"), value: dayMonth(c.lastSpringFrost.median, lang), sub: `${t("c.latest")}: ${dayMonth(c.lastSpringFrost.latest, lang)} (${c.lastSpringFrost.latestYear})` },
    { icon: "❄️", label: t("c.firstFrost"), value: dayMonth(c.firstAutumnFrost.median, lang), sub: `${t("c.earliest")}: ${dayMonth(c.firstAutumnFrost.earliest, lang)} (${c.firstAutumnFrost.earliestYear})` },
    { icon: "☀️", label: t("c.frostFree"), value: `${c.frostFreeDays} ${t("days")}`, sub: "" },
    { icon: "🔥", label: t("c.heat"), value: `${Math.round(last5)} ${t("c.perYear")} ${last5 > first5 ? "↑" : "↓"}`, sub: `${heat[0]?.year}: ${Math.round(first5)} → ${heat.at(-1)?.year}: ${Math.round(last5)}` },
    { icon: "🌧️", label: t("c.rain"), value: `${num(annualP)} ${t("mm")}`, sub: `${c.precipTrendPct > 0 ? "↑" : "↓"} ${c.precipTrendPct > 0 ? "+" : ""}${c.precipTrendPct}%` },
  ];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
        {cards.map((k) => (
          <div key={k.label} className="rounded-[20px] bg-[var(--surface)] p-3.5 shadow-[var(--shadow-card)]">
            <div className="text-[12px] font-medium text-[var(--fg-3)]">
              {k.icon} {k.label}
            </div>
            <div className="mt-1 text-[19px] font-semibold tracking-[-0.01em] tnum">{k.value}</div>
            {k.sub && <div className="mt-0.5 text-[11.5px] text-[var(--fg-3)] tnum">{k.sub}</div>}
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle source={`NASA POWER ${data.field.periodStart}-${data.field.periodEnd}`}>{t("c.temp")}</CardTitle>
          <XYChart
            ariaLabel={t("c.temp")}
            labels={months}
            unit="°C"
            digits={1}
            layers={[
              { type: "band", id: "rng", label: "Tmax P10-P90", lo: c.monthly.map((m) => m.tmaxP10), hi: c.monthly.map((m) => m.tmaxP90), color: "var(--s2)", opacity: 0.16 },
              { type: "line", id: "tmax", label: "Tmax", values: c.monthly.map((m) => m.tmaxAvg), color: "var(--s2)" },
              { type: "line", id: "tmin", label: "Tmin", values: c.monthly.map((m) => m.tminAvg), color: "var(--s1)" },
              ...(c.lastYearMonthly ? [{ type: "line" as const, id: "ly", label: String(data.field.periodEnd), values: c.lastYearMonthly.map((m) => m.tmax), color: "var(--fg-3)", dash: true }] : []),
            ]}
          />
        </Card>
        <Card>
          <CardTitle source="NASA POWER">{t("c.heatTrend")}</CardTitle>
          <XYChart ariaLabel={t("c.heatTrend")} labels={hx.map(String)} legend={false} layers={[{ type: "bars", id: "h", label: t("c.heat"), values: hy, color: "var(--level-high)" }, { type: "line", id: "tr", label: "trend", values: trend, color: "var(--fg-2)", dash: true }]} />
        </Card>
        <Card>
          <CardTitle source="NASA POWER (PRECTOTCORR)">{t("c.precip")}</CardTitle>
          <XYChart ariaLabel={t("c.precip")} labels={months} unit=" mm" legend={false} layers={[{ type: "bars", id: "p", label: t("c.precip"), values: c.monthly.map((m) => m.precipMm), color: "var(--water)" }]} />
        </Card>
        <Card>
          <CardTitle info="frost" source="NASA POWER">{t("c.frostProb")}</CardTitle>
          <XYChart ariaLabel={t("c.frostProb")} labels={c.frostProbability.map((f) => dayMonth(f.date, lang))} unit="%" yMin={0} yMax={100} legend={false} layers={[{ type: "line", id: "fp", label: "%", values: c.frostProbability.map((f) => f.pct), color: "var(--s1)", dots: true }]} />
        </Card>
      </div>
      {c.spi3 && (
        <Card>
          <CardTitle info="spi" source="NASA POWER">{t("c.spi")}</CardTitle>
          <XYChart ariaLabel="SPI-3" labels={c.spi3.slice(-120).map((s) => `${monthShort(+s.date.slice(5, 7), lang)} ${s.date.slice(2, 4)}`)} digits={2} zeroLine legend={false} height={180} tickEvery={12} layers={[{ type: "bars", id: "spi", label: "SPI-3", values: c.spi3.slice(-120).map((s) => s.value), color: "var(--water)", signColor: { neg: "var(--level-high)", pos: "var(--water)" } }]} />
        </Card>
      )}
      <Card>
        <CardTitle info="gdd" source="NASA POWER">🌱 {t("c.gdd", { g: num(c.gddAfterWheat) })}</CardTitle>
        <div className="flex flex-wrap gap-2">
          {c.cropGddFit.map((g) => (
            <span key={g.crop} className={clsx("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13.5px] font-medium", g.fits ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--danger-bg)] text-[var(--danger-fg)]")}>
              {cropIcon(g.crop)} {cropName(g.crop, lang)} {num(g.required)} {g.fits ? "✅" : "❌"}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ 🧂 soil */

export function SoilTab({ data, onRecompute }: { data: AnalyzeResponse; onRecompute: (ece: number) => void }) {
  const { t, lang } = useT();
  const s = data.soil;
  const [dlg, setDlg] = useState(false);
  const [ece, setEce] = useState("");
  const pos = { low: 16, medium: 50, high: 84 }[s.salinityLevel];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <Card>
        <CardTitle info="ndsi" source={s.isEstimated ? "Sentinel-2 SI" : "Lab"}>{t("so.level")}</CardTitle>
        <div className="relative mt-2">
          <div className="flex h-3 overflow-hidden rounded-full">
            <i className="flex-1" style={{ background: "var(--level-low)" }} />
            <i className="flex-1" style={{ background: "var(--level-medium)" }} />
            <i className="flex-1" style={{ background: "var(--level-high)" }} />
          </div>
          <m.span initial={{ left: "0%" }} animate={{ left: `${pos}%` }} transition={{ type: "spring", bounce: 0.25, duration: 0.8 }} className="absolute -top-1.5 h-6 w-6 -translate-x-1/2 rounded-full border-[3px] border-white bg-[var(--fg)] shadow-[var(--shadow-float)]" />
          <div className="mt-2 grid grid-cols-3 text-center text-[12px] font-semibold text-[var(--fg-3)]">
            <span>{t("lvl.low")}</span>
            <span>{t("lvl.medium")}</span>
            <span>{t("lvl.high")}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <LevelBadge level={s.salinityLevel} big />
          {s.salinityTrendPct != null && <span className="text-[13.5px] text-[var(--fg-2)] tnum">trend: {s.salinityTrendPct > 0 ? "↑ +" : "↓ "}{s.salinityTrendPct}%</span>}
        </div>
        {s.isEstimated && <p className="mt-3 rounded-2xl bg-[var(--warn-bg)] px-3.5 py-2.5 text-[13.5px] text-[var(--warn-fg)]">{t("so.estimated")}</p>}
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => setDlg(true)}>
          <FlaskConical size={14} /> {t("so.enterLab")}
        </Button>
      </Card>

      <AnimatePresence>
        {dlg && (
          <>
            <m.div className="fixed inset-0 z-50 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDlg(false)} />
            <m.div role="dialog" aria-label={t("so.labTitle")} initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.97 }} transition={{ type: "spring", bounce: 0.15, duration: 0.5 }} className="lg lg-strong fixed inset-x-3 bottom-3 z-50 mx-auto max-w-sm rounded-[28px] p-5 sm:top-1/3 sm:bottom-auto">
              <div className="mb-3 flex items-center justify-between">
                <b className="text-[16px]">{t("so.labTitle")}</b>
                <button type="button" onClick={() => setDlg(false)} aria-label={t("close")} className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface)]/70">
                  <X size={16} />
                </button>
              </div>
              <label htmlFor="lab-ece" className="flex items-center gap-2 text-[14px]">
                ECe
                <input id="lab-ece" autoFocus inputMode="decimal" value={ece} onChange={(e) => setEce(e.target.value.replace(",", "."))} className="h-11 flex-1 rounded-2xl bg-[var(--surface)] px-3 text-[16px] tnum outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" placeholder="4.5" />
                dS/m
              </label>
              <Button className="mt-4 w-full" disabled={!(Number(ece) >= 0 && Number(ece) <= 30 && ece !== "")} onClick={() => { setDlg(false); onRecompute(Number(ece)); }}>
                {t("so.recompute")}
              </Button>
            </m.div>
          </>
        )}
      </AnimatePresence>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle info="ndsi" source="Sentinel-2 L2A">{t("so.trend")}</CardTitle>
          {s.salinityTrend.length ? (
            <XYChart ariaLabel={t("so.trend")} labels={s.salinityTrend.map((x) => String(x.year))} digits={3} legend={false} layers={[{ type: "line", id: "si", label: "SI", values: s.salinityTrend.map((x) => x.ndsi), color: "var(--soil)", dots: true }]} />
          ) : (
            <EmptyState title={lang === "uz" ? "Yalang'och tuproq oylari topilmadi" : "No bare-soil months found"} />
          )}
        </Card>
        <Card>
          <CardTitle source="SoilGrids 250 m">{t("so.texture")}</CardTitle>
          {s.texture ? (
            <>
              <div className="flex h-8 overflow-hidden rounded-xl text-[11.5px] font-semibold text-white">
                <span className="flex items-center justify-center" style={{ width: `${s.texture.clay}%`, background: "#8D6E63" }}>{s.texture.clay}%</span>
                <span className="flex items-center justify-center" style={{ width: `${s.texture.silt}%`, background: "#A1887F" }}>{s.texture.silt}%</span>
                <span className="flex items-center justify-center" style={{ width: `${s.texture.sand}%`, background: "#D7B98E", color: "#3E2723" }}>{s.texture.sand}%</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 text-[12.5px] text-[var(--fg-2)]">
                <span>■ {t("so.clay")}</span>
                <span>■ {t("so.silt")}</span>
                <span>■ {t("so.sand")}</span>
              </div>
              <p className="mt-3 text-[14px]">
                → <b>{t(`tx.${s.texture.className}` as Key)}</b> · {t("so.soc")}: <b className="tnum">{s.socGKg ?? "-"} g/kg</b> · pH <b className="tnum">{s.ph ?? "-"}</b>
              </p>
            </>
          ) : (
            <EmptyState title="SoilGrids" text={lang === "uz" ? "Vaqtincha mavjud emas" : "Temporarily unavailable"} />
          )}
        </Card>
      </div>

      {s.soilMoisture && (
        <Card>
          <CardTitle source="NASA POWER GWETROOT (MERRA-2)">{t("so.moisture")}</CardTitle>
          <XYChart
            ariaLabel={t("so.moisture")}
            labels={s.soilMoisture.map((x) => `${monthShort(+x.date.slice(5, 7), lang)} ${x.date.slice(2, 4)}`)}
            yMin={0}
            yMax={100}
            unit="%"
            layers={[
              { type: "line", id: "now", label: lang === "uz" ? "Ildiz zonasi" : "Root zone", values: s.soilMoisture.map((x) => x.rootzone * 100), color: "var(--water)" },
              { type: "line", id: "clim", label: lang === "uz" ? "20 yillik o'rtacha" : "20-year mean", values: s.soilMoisture.map((x) => x.climatology * 100), color: "var(--fg-3)", dash: true },
            ]}
          />
        </Card>
      )}

      <Card>
        <CardTitle source="FAO-29 (Maas-Hoffman)">{t("so.fit")}</CardTitle>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[360px] text-[14px]">
            <thead>
              <tr className="text-left text-[12px] text-[var(--fg-3)]">
                <th className="py-2 font-medium">{t("so.crop")}</th>
                <th className="py-2 font-medium">{t("so.tolerance")}</th>
                <th className="py-2 text-center font-medium">{t("so.yours")}</th>
              </tr>
            </thead>
            <tbody>
              {s.cropTolerance.map((c) => (
                <tr key={c.crop} className="border-t border-[var(--hairline)]">
                  <td className="py-2">{cropIcon(c.crop)} {cropName(c.crop, lang)}</td>
                  <td className="py-2 text-[var(--fg-2)]">{t(`tol.${c.tolerance}` as Key)}</td>
                  <td className="py-2 text-center">{c.fit === "ok" ? "✅" : c.fit === "warn" ? "⚠️" : "❌"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SourceBadge source={s.isEstimated ? "Sentinel-2 SI → ECe" : "Lab ECe"} className="mt-2" />
      </Card>
      <GaezSuitabilityRow data={data} />
    </div>
  );
}
