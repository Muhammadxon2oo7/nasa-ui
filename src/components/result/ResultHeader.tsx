"use client";

import { AnimatePresence, m } from "motion/react";
import { Check, Download, FileText, Link2, MoreHorizontal, MapPin, Pencil, Save, Sparkles, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AnalyzeResponse, Strategy } from "@/types/api";
import { listFields, saveFields } from "@/api/client";
import { num } from "@/lib/format";
import { useT, type Key } from "@/i18n";
import { useWizard } from "@/store/wizardStore";
import { useMode } from "@/store/platformStore";
import { toCsv, toGeoJson } from "@/lib/export";
import { isUnknown } from "@/types/api";
import { Button, LevelBadge, SourceBadge, spring, springPop } from "../ui";
import { WaterSupplyBadge } from "./Extras";

/** One quiet "⋯" instead of a row of buttons. */
function MoreMenu({ items }: { items: { icon: React.ReactNode; label: string; on: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    addEventListener("pointerdown", on);
    return () => removeEventListener("pointerdown", on);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="More" className="press flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] shadow-[var(--shadow-card)]">
        <MoreHorizontal size={18} />
      </button>
      <AnimatePresence>
        {open && (
          <m.div role="menu" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={spring} style={{ transformOrigin: "top right" }} className="lg lg-strong absolute top-11 right-0 z-40 w-52 rounded-[18px] p-1.5">
            {items.map((it) => (
              <button key={it.label} role="menuitem" type="button" onClick={() => (setOpen(false), it.on())} className="press flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[14px] font-medium hover:bg-[var(--surface)]/70">
                {it.icon} {it.label}
              </button>
            ))}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FieldHeader({ data }: { data: AnalyzeResponse }) {
  const { t } = useT();
  const router = useRouter();
  const wiz = useWizard();
  const mode = useMode((s) => s.mode);
  const [toast, setToast] = useState<string | null>(null);
  const f = data.field;
  const flash = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(null), 1800);
  };
  const save = () => {
    const all = listFields().filter((x) => x.fieldId !== data.fieldId);
    saveFields([{ id: data.fieldId, fieldId: data.fieldId, name: [f.region, f.district].filter(Boolean).join(", ") || `${f.centroid[0].toFixed(3)}, ${f.centroid[1].toFixed(3)}`, areaHa: f.areaHa, region: f.region, polygon: f.polygon, savedAt: new Date().toISOString() }, ...all]);
    flash(t("saved"));
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      flash(t("copied"));
    } catch {
      flash(location.href);
    }
  };
  return (
    <div className="relative flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] text-[var(--fg-3)]">
          <MapPin size={14} /> {t("r.period", { a: f.periodStart, b: f.periodEnd })}
        </div>
        <h1 className="mt-0.5 text-[clamp(22px,3.4vw,30px)] leading-tight font-semibold tracking-[-0.025em] text-balance">
          {[f.region, f.district].filter(Boolean).join(", ") || `${f.centroid[0].toFixed(3)}°N, ${f.centroid[1].toFixed(3)}°E`} · <span className="tnum">{num(f.areaHa, 1)}</span> {t("ha")}
        </h1>
      </div>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="secondary" onClick={save}>
          <Save size={14} /> {t("save")}
        </Button>
        <MoreMenu
          items={[
            { icon: <FileText size={15} />, label: t("passport.btn"), on: () => router.push(`/passport/${data.fieldId}`) },
            { icon: <Link2 size={15} />, label: t("share"), on: share },
            {
              icon: <Pencil size={15} />,
              label: t("edit"),
              on: () => {
                wiz.set({ polygon: f.polygon, step: 2 });
                router.push("/analyze");
              },
            },
          ]}
        />
        {mode === "expert" && <ExportMenu data={data} />}
      </div>
      <AnimatePresence>
        {toast && (
          <m.div initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={springPop} role="status" className="lg fixed top-[84px] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-[13.5px] font-semibold">
            <Check size={15} className="text-[var(--accent)]" /> {toast}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SummaryCards({ data, best, bestScore, water }: { data: AnalyzeResponse; best: Strategy; bestScore: number; water: number }) {
  const { t } = useT();
  const cards = [
    { k: "salt", label: t("r.salt"), body: <LevelBadge level={data.summary.salinity} big />, source: data.soil.isEstimated ? "Sentinel-2" : "Lab", icon: "🧂" },
    { k: "water", label: t("r.water"), body: <span className="text-[28px] font-semibold tracking-[-0.02em] tnum">{num(water)}<span className="ml-1 text-[13px] font-medium text-[var(--fg-3)]">{t("r.perYear")}</span></span>, extra: <WaterSupplyBadge data={data} />, source: "FAO-56", icon: "💧" },
    { k: "risk", label: t("r.risk"), body: <span className="text-[22px] font-semibold tracking-[-0.02em]">{data.summary.mainRisk}</span>, source: "NASA POWER", icon: "🌡️" },
    { k: "best", label: t("r.best"), body: <span className="block text-[15.5px] leading-snug font-semibold">{best.name} · <span className="tnum text-[var(--accent)]">{bestScore}</span></span>, source: t("st.recommended"), icon: "🏆" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {cards.map((c, i) => (
        <m.div key={c.k} initial={{ opacity: 0, y: 10, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...spring, delay: 0.05 * i }} className={`flex min-w-0 flex-col gap-2 rounded-[22px] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] ${c.k === "best" ? "ring-2 ring-[var(--gold)]/60" : ""}`}>
          <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--fg-3)]">
            <span aria-hidden>{c.k === "best" ? <Trophy size={14} className="text-[var(--gold)]" /> : c.icon}</span> {c.label}
          </span>
          <div className="min-w-0 flex-1">
            {c.body}
            {"extra" in c ? (c.extra as React.ReactNode) : null}
          </div>
          <SourceBadge source={c.source} className="self-start" />
        </m.div>
      ))}
    </div>
  );
}

export function AiSummary({ text, generatedBy }: { text: string; generatedBy: "llm" | "template" }) {
  const { t } = useT();
  return (
    <div className="rounded-[22px] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--accent)]">
        <Sparkles size={15} /> {t("r.summary")}
      </div>
      <p className="max-w-[75ch] text-[15.5px] leading-relaxed text-[var(--fg)]">{text}</p>
      <p className="mt-2 text-[11.5px] text-[var(--fg-3)]">{generatedBy === "llm" ? t("aiText") : t("templateText")}</p>
    </div>
  );
}

/** CSV / JSON / GeoJSON (expert mode). Server export first, in-browser fallback for offline demos. */
function ExportMenu({ data }: { data: AnalyzeResponse }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const save = async (fmt: "csv" | "json" | "geojson") => {
    setOpen(false);
    let blob: Blob;
    try {
      const r = await fetch(`/api/export/${data.fieldId}?format=${fmt}`);
      if (!r.ok) throw new Error();
      blob = await r.blob();
    } catch {
      const body = fmt === "csv" ? toCsv(data) : JSON.stringify(fmt === "json" ? data : toGeoJson(data), null, 2);
      blob = new Blob([body], { type: fmt === "csv" ? "text/csv" : "application/json" });
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `field-shift-${data.fieldId}.${fmt}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <div className="relative">
      <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>
        <Download size={14} /> {t("export")}
      </Button>
      <AnimatePresence>
        {open && (
          <m.div initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={spring} className="lg lg-strong absolute right-0 z-40 mt-1.5 w-36 rounded-2xl p-1" role="menu">
            {(["csv", "json", "geojson"] as const).map((f) => (
              <button key={f} type="button" role="menuitem" onClick={() => save(f)} className="block w-full rounded-xl px-3 py-2 text-left text-[14px] font-medium uppercase hover:bg-[var(--surface)]/70">
                {f}
              </button>
            ))}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function LivestockCards({ data }: { data: AnalyzeResponse }) {
  const { t } = useT();
  const ls = data.livestock;
  if (!ls) return null;
  const a = ls.pasture.anomalyPct;
  const lo = ls.capacity.lowAuPerHa, hi = ls.capacity.highAuPerHa;
  const wp = ls.waterSources?.nearestPermanentKm, ws = ls.waterSources?.nearestSeasonalKm;
  const water = wp != null && !isUnknown(wp) ? `${wp} km` : ws != null && !isUnknown(ws) ? `${ws} km*` : "❓";
  const cards = [
    { k: "p", icon: "🌿", label: t("ls.cardPasture"), body: <span className="text-[20px] font-semibold">{t(`ls.lvl.${ls.pasture.statusLevel}` as Key)}{!isUnknown(a) && <span className="ml-1.5 text-[14px] text-[var(--fg-3)] tnum">{(a as number) > 0 ? "+" : ""}{a as number}%</span>}</span>, source: "MODIS NDVI" },
    { k: "c", icon: "🐄", label: t("ls.cardCap"), body: <span className="text-[20px] font-semibold tnum">{!isUnknown(lo) && !isUnknown(hi) ? `${lo}–${hi}` : "❓"}<span className="ml-1 text-[12px] font-medium text-[var(--fg-3)]">{t("ls.capUnit")}</span></span>, source: "MODIS NPP" },
    { k: "h", icon: "🌡️", label: t("ls.cardHeat"), body: <span className="text-[24px] font-semibold tnum">{ls.heat.stressDaysPerYear}<span className="ml-1 text-[12px] font-medium text-[var(--fg-3)]">{t("c.perYear")}</span></span>, source: "NASA POWER · THI" },
    { k: "w", icon: "💧", label: t("ls.cardWater"), body: <span className="text-[24px] font-semibold tnum">{water}</span>, source: "JRC GSW" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {cards.map((c, i) => (
        <m.div key={c.k} initial={{ opacity: 0, y: 10, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...spring, delay: 0.05 * i }} className="flex min-w-0 flex-col gap-2 rounded-[22px] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
          <span className="text-[12.5px] font-medium text-[var(--fg-3)]">{c.icon} {c.label}</span>
          <div className="min-w-0 flex-1">
            {c.body}
            {"extra" in c ? (c.extra as React.ReactNode) : null}
          </div>
          <SourceBadge source={c.source} className="self-start" />
        </m.div>
      ))}
    </div>
  );
}
