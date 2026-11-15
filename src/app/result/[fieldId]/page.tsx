"use client";

import { AnimatePresence, m } from "motion/react";
import { Beef, CalendarDays, Check, Info, CloudSun, Droplet, Flame, FlaskConical, Globe, Leaf, MapPin, Satellite, ScrollText, Sprout, ThermometerSun, Wheat } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { AnalyzeRequest } from "@/types/api";
import { analyzeField, saveAnalysis } from "@/api/client";
import { initialWeights } from "@/lib/scoring";
import { useAnalysis } from "@/lib/useAnalysis";
import { useT, type Key } from "@/i18n";
import { useResultUi } from "@/store/resultUiStore";
import { FieldHeader, LivestockCards } from "@/components/result/ResultHeader";
import { AnswerCard, Fold } from "@/components/result/Sections";
import { FieldTwin } from "@/components/twin/FieldTwin";
import { CapacityTab, HeatTab, PastureTab, WaterSourcesTab } from "@/components/result/LivestockTabs";
import { useProfile } from "@/store/platformStore";
import { StrategiesTab, useRanked } from "@/components/result/StrategiesTab";
import { ClimateTab, HistoryTab, SoilTab } from "@/components/result/TabsA";
import { MapTab, Season, WaterTab, Week, WhatIf } from "@/components/result/TabsB";
import { CalendarTab, FeedbackPrompt, ThisWeekCard } from "@/components/result/Extras";
import { Button, DegradedNotice, EmptyState, Segmented, Skeleton, spring } from "@/components/ui";

// Four farmer questions per module, in the order a decision is made:
// what to grow -> when to act -> how much water -> what the evidence says about my field.
// Older tab ids in shared links map onto them.
const TABS = ["plan", "calendar", "water", "field", "pasture", "heat", "wsrc"] as const;
type Tab = (typeof TABS)[number];
const ALIAS: Record<string, Tab> = { strategies: "plan", whatif: "plan", history: "field", soil: "field", space: "field", map: "field", climate: "field", weather: "calendar", forecast: "calendar", capacity: "pasture" };
const ICON: Record<Tab, React.ReactNode> = { plan: <Sprout size={15} />, calendar: <CalendarDays size={15} />, water: <Droplet size={15} />, field: <Satellite size={15} />, pasture: <Leaf size={15} />, heat: <Flame size={15} />, wsrc: <MapPin size={15} /> };

export default function ResultPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Result />
    </Suspense>
  );
}

/** Livestock module on demand: say what is computed (MODIS pasture norm, NPP, THI, water) and for how long. */
function ModuleProgress() {
  const { lang } = useT();
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSec((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const steps = lang === "uz" ? ["MODIS: yaylov 20 yillik me'yori", "MODIS NPP: yaylov sig'imi", "NASA POWER: issiqlik stressi (THI)", "JRC: eng yaqin suv manbalari"] : ["MODIS: 20-year pasture norm", "MODIS NPP: grazing capacity", "NASA POWER: heat stress (THI)", "JRC: nearest water sources"];
  const cur = Math.min(steps.length - 1, Math.floor(sec / 8));
  return (
    <div role="status" aria-live="polite" className="grid gap-2 rounded-[22px] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
      <b className="text-[15px]">{lang === "uz" ? "Chorvachilik moduli hisoblanmoqda" : "Computing the livestock module"} <span className="font-normal text-[var(--fg-3)] tnum">· {sec} s</span></b>
      {steps.map((st, i) => (
        <span key={st} className={`flex items-center gap-2.5 text-[14px] ${i <= cur ? "text-[var(--fg)]" : "text-[var(--fg-3)]"}`}>
          <span className={`h-2 w-2 rounded-full ${i < cur ? "bg-[var(--accent-fill)]" : i === cur ? "animate-pulse bg-[var(--accent-fill)] motion-reduce:animate-none" : "bg-[var(--surface-3)]"}`} /> {st}
        </span>
      ))}
      {sec > 30 && <span className="text-[12.5px] text-[var(--fg-3)]">{lang === "uz" ? "Yaylov uchun birinchi hisob 1-2 daqiqa olishi mumkin." : "The first pasture analysis can take 1-2 minutes."}</span>}
    </div>
  );
}

const STAGES = [
  { s: 0, uz: "NASA POWER: 20 yillik kunlik iqlim", en: "NASA POWER: 20 years of daily climate" },
  { s: 3, uz: "Sentinel-2: dalaning yillar bo'yicha tarixi", en: "Sentinel-2: the field's history by year" },
  { s: 7, uz: "FAO-56: har bir rotatsiyaning suv talabi", en: "FAO-56: water need of every rotation" },
  { s: 11, uz: "ECMWF: 7 kunlik va mavsumiy prognoz", en: "ECMWF: 7-day and seasonal forecast" },
  { s: 15, uz: "Strategiyalarni solishtirish va tushuntirish", en: "Comparing and explaining the strategies" },
];

/** Analysis in progress: show what is being computed and for how long, never a silent grey page. */
function Loading() {
  const { lang } = useT();
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSec((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const cur = STAGES.reduce((k, st, i) => (sec >= st.s ? i : k), 0);
  return (
    <div className="mx-auto grid max-w-6xl gap-3 px-4 sm:px-6">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="relative flex h-[clamp(320px,52vh,500px)] items-center justify-center overflow-hidden rounded-[26px] bg-[#0d1512]">
          <div className="shimmer absolute inset-0 opacity-20" />
          <div className="relative grid w-[min(380px,85%)] gap-2.5" role="status" aria-live="polite">
            <p className="text-[13px] font-medium text-white/60 tnum">{lang === "uz" ? `Tahlil qilinmoqda · ${sec} s` : `Analysing · ${sec} s`}</p>
            {STAGES.map((st, i) => (
              <div key={st.s} className={`flex items-center gap-3 text-[14.5px] transition-opacity duration-500 ${i <= cur ? "opacity-100" : "opacity-35"}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${i < cur ? "border-[var(--brand-green)] bg-[var(--brand-green)]" : i === cur ? "border-white" : "border-white/40"}`}>
                  {i < cur ? <Check size={12} className="text-white" strokeWidth={3} /> : i === cur ? <span className="h-2 w-2 animate-pulse rounded-full bg-white motion-reduce:animate-none" /> : null}
                </span>
                <span className="text-white">{lang === "uz" ? st.uz : st.en}</span>
              </div>
            ))}
            {sec > 25 && <p className="mt-1 text-[12.5px] text-white/60">{lang === "uz" ? "Yangi dala uchun birinchi tahlil 1 daqiqagacha davom etishi mumkin. Keyingi safar bir necha soniyada ochiladi." : "The first analysis of a new field can take up to a minute. Next time it opens in seconds."}</p>}
          </div>
        </div>
        <Skeleton className="h-[clamp(320px,52vh,500px)] rounded-[26px]" />
      </div>
      <Skeleton className="h-24" />
    </div>
  );
}

function Result() {
  const { fieldId } = useParams<{ fieldId: string }>();
  const { t, lang } = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("tab") ?? "";
  const tab: Tab = (TABS as readonly string[]).includes(raw) ? (raw as Tab) : (ALIAS[raw] ?? "plan");
  const { data, status } = useAnalysis(fieldId);
  const ui = useResultUi();
  const [busy, setBusy] = useState(false);

  // weights start from the farmer's own priority order (wizard answers, or the demo request)
  useEffect(() => {
    if (!data) return;
    let dead = false;
    (async () => {
      let req: Partial<AnalyzeRequest> | null = null;
      try {
        req = JSON.parse(localStorage.getItem(`fs:req:${data.fieldId}`) ?? "null");
      } catch {}
      if (!req && data.fieldId.startsWith("demo-")) req = await fetch(`/demo/${data.fieldId.slice(5)}.req.json`).then((r) => r.json()).catch(() => null);
      if (!dead) ui.init(data.fieldId, initialWeights(req?.priorities ?? []), req?.water?.method ?? "furrow");
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.fieldId]);

  const setTab = (v: Tab, mod?: string) => {
    const q = new URLSearchParams(sp.toString());
    q.set("tab", v);
    if (mod) q.set("module", mod);
    router.replace(`?${q.toString()}`, { scroll: false });
  };

  const recompute = async (ece: number) => {
    if (!data) return;
    let req: AnalyzeRequest | null = null;
    try {
      req = JSON.parse(localStorage.getItem(`fs:req:${data.fieldId}`) ?? "null");
    } catch {}
    if (!req && data.fieldId.startsWith("demo-")) req = await fetch(`/demo/${data.fieldId.slice(5)}.req.json`).then((r) => r.json()).catch(() => null);
    if (!req) return;
    setBusy(true);
    try {
      const next = { ...req, soil: { ...req.soil, eceDsM: ece }, lang };
      const d = await analyzeField(next);
      saveAnalysis(d);
      try {
        localStorage.setItem(`fs:req:${d.fieldId}`, JSON.stringify(next));
      } catch {}
      router.push(`/result/${d.fieldId}?tab=field`);
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading") return <Loading />;
  if (!data)
    return (
      <div className="mx-auto max-w-xl px-4">
        <EmptyState title={t("r.notFound")} text={t("r.notFoundd")} action={<div className="mt-2 flex gap-2"><Button onClick={() => router.push("/analyze")}>{t("nav.analyze")}</Button><Button variant="secondary" onClick={() => router.push("/demo")}>{t("openDemo")}</Button></div>} />
      </div>
    );

  return <Body data={data} tab={tab} setTab={setTab} recompute={recompute} busy={busy} />;
}

type ModuleTab = "crop" | "livestock" | "general";
const MODULE_TABS: Record<ModuleTab, Tab[]> = {
  crop: ["plan", "calendar", "water", "field"],
  livestock: ["pasture", "heat", "wsrc", "field"],
  general: ["field", "water", "calendar"],
};

function Body({ data: initial, tab, setTab, recompute, busy }: { data: NonNullable<ReturnType<typeof useAnalysis>["data"]>; tab: Tab; setTab: (t: Tab, mod?: ModuleTab) => void; recompute: (e: number) => void; busy: boolean }) {
  const { t, lang } = useT();
  const sp = useSearchParams();
  const profile = useProfile((s) => s.profile);
  const [data, setData] = useState(initial);
  const [loadingLs, setLoadingLs] = useState(false);
  const modParam = sp.get("module") as ModuleTab | null;
  const mod: ModuleTab = modParam && MODULE_TABS[modParam] ? modParam : profile === "herder" ? "livestock" : "crop";
  const tabs = MODULE_TABS[mod];
  const active: Tab = tabs.includes(tab) ? tab : tabs[0];
  const ranked = useRanked(data);
  const { best } = ranked;
  const options = useMemo(() => tabs.map((k) => ({ value: k, label: <span className="flex items-center gap-1.5"><span aria-hidden className="text-[var(--fg-3)]">{ICON[k]}</span>{t(`q.${k}` as Key)}</span> })), [t, tabs]);

  // livestock not computed yet → ask the backend for it (core is cached, so this is fast)
  const loadLivestock = async () => {
    if (data.livestock || loadingLs) return;
    let req: AnalyzeRequest | null = null;
    try {
      req = JSON.parse(localStorage.getItem(`fs:req:${data.fieldId}`) ?? "null");
    } catch {}
    if (!req && data.fieldId.startsWith("demo-")) req = await fetch(`/demo/${data.fieldId.slice(5)}.req.json`).then((r) => r.json()).catch(() => null);
    if (!req && data.fieldId.startsWith("live-")) req = (await import("@/api/fastapi")).liveDemoRequest(data.fieldId.slice(5), lang);
    if (!req) return;
    setLoadingLs(true);
    try {
      const d = await analyzeField({ ...req, modules: ["crop", "livestock"], lang });
      setData((cur) => ({ ...cur, livestock: d.livestock, modulesComputed: d.modulesComputed }));
    } catch {
    } finally {
      setLoadingLs(false);
    }
  };
  const switchModule = async (m: ModuleTab) => {
    setTab(MODULE_TABS[m][0], m);
    if (m === "livestock") await loadLivestock();
  };
  // a shared link straight to the livestock module computes it on arrival
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches over the network, state settles later
    if (mod === "livestock" && !data.livestock) void loadLivestock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mod]);

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-3 px-3 sm:px-6">
      <FieldHeader data={data} />
      {data.degraded && <DegradedNotice items={data.degraded} />}
      <div className="flex items-center gap-2">
        <Segmented<ModuleTab>
          value={mod}
          onChange={switchModule}
          options={[
            { value: "crop", label: <span className="flex items-center gap-1.5"><Wheat size={15} className="hidden sm:block" />{t("mod.crop")}</span> },
            { value: "livestock", label: <span className="flex items-center gap-1.5"><Beef size={15} className="hidden sm:block" />{t("mod.livestock")}</span> },
            { value: "general", label: <span className="flex items-center gap-1.5"><Globe size={15} className="hidden sm:block" />{t("mod.general")}</span> },
          ]}
          ariaLabel="module"
          className="w-full sm:w-max"
        />
      </div>
      {mod === "livestock" && data.livestock ? (
        <LivestockCards data={data} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <FieldTwin data={data} list={ranked.list} bestId={best.s.id} />
          <AnswerCard data={data} best={best.s} bestScore={best.score} water={best.gross} currentScore={ranked.list.find((x) => x.s.isCurrent)?.score} onMore={() => setTab("plan", mod)} />
        </div>
      )}
      <p className="-mt-1 flex items-center gap-1.5 px-1 text-[12px] text-[var(--fg-3)]"><Info size={13} /> {t("disclaimer")}</p>
      {mod !== "general" && active !== "calendar" && <ThisWeekCard data={data} livestock={mod === "livestock"} onOpen={() => setTab("calendar", mod)} />}
      <div className="lg sticky top-[calc(76px+env(safe-area-inset-top))] z-30 -mx-1 rounded-full p-1">
        <div className="no-scrollbar overflow-x-auto">
          <Segmented<Tab> value={active} onChange={(v) => setTab(v, mod)} options={options} className="bg-transparent" ariaLabel="tabs" />
        </div>
      </div>
      {busy && <Skeleton className="h-24" />}
      {loadingLs && <ModuleProgress />}
      <AnimatePresence mode="wait" initial={false}>
        <m.div key={mod + active} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring}>
          {active === "plan" && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
              <StrategiesTab data={data} />
              <Fold icon={<CloudSun size={18} />} title={t("f.whatifTitle" as Key)} hint={t("f.whatifHint" as Key)} open={useResultUi.getState().whatIf.dP !== 0 || useResultUi.getState().whatIf.dT !== 0}>
                <WhatIf data={data} />
              </Fold>
            </div>
          )}
          {active === "calendar" && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
              {mod !== "general" && <CalendarTab data={data} />}
              <Week data={data} />
              <Fold icon={<CloudSun size={18} />} title={t("f.seasonFold" as Key)} hint={t("f.seasonHint" as Key)}>
                <Season data={data} />
              </Fold>
            </div>
          )}
          {active === "water" && (
            <WaterTab
              data={data}
              onTryDry={() => {
                useResultUi.getState().set({ whatIf: { dT: 0, dP: -30, strategies: null, loading: true } });
                setTab("plan", mod);
              }}
            />
          )}
          {active === "field" && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
              <MapTab data={data} />
              {mod !== "livestock" && (
                <Fold icon={<FlaskConical size={18} />} title={t("f.soil")} hint={`${t("r.salt")}: ${t(`lvl.${data.soil.salinityLevel}` as Key)}`}>
                  <SoilTab data={data} onRecompute={recompute} />
                </Fold>
              )}
              <Fold icon={<ScrollText size={18} />} title={t("f.history")} hint={data.history.seasons.length ? `${data.history.seasons[0].year}-${data.history.seasons[data.history.seasons.length - 1].year}` : undefined}>
                <HistoryTab data={data} />
              </Fold>
              <Fold icon={<ThermometerSun size={18} />} title={t("f.climate")} hint={`${t("r.risk")}: ${data.summary.mainRisk}`}>
                <ClimateTab data={data} />
              </Fold>
            </div>
          )}
          {!loadingLs && active === "pasture" && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
              <PastureTab data={data} />
              <CapacityTab data={data} onCrop={() => switchModule("crop")} />
            </div>
          )}
          {!loadingLs && active === "heat" && <HeatTab data={data} />}
          {!loadingLs && active === "wsrc" && <WaterSourcesTab data={data} />}
        </m.div>
      </AnimatePresence>
      <FeedbackPrompt data={data} />
    </div>
  );
}
