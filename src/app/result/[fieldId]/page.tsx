"use client";

import { AnimatePresence, m } from "motion/react";
import { Beef, CalendarDays, Info, CloudSun, Droplet, Flame, FlaskConical, Globe, Layers, Leaf, Map, MapPin, ScrollText, Sprout, ThermometerSun, Wheat } from "lucide-react";
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
import { ForecastTab, MapTab, WaterTab } from "@/components/result/TabsB";
import { CalendarTab, FeedbackPrompt, ThisWeekCard } from "@/components/result/Extras";
import { Button, DegradedNotice, EmptyState, Segmented, Skeleton, spring } from "@/components/ui";

// 5 question-shaped sections per module; older tab ids in shared links map onto them
const TABS = ["plan", "calendar", "water", "field", "weather", "pasture", "heat", "wsrc"] as const;
type Tab = (typeof TABS)[number];
const ALIAS: Record<string, Tab> = { strategies: "plan", history: "field", soil: "field", map: "field", climate: "weather", forecast: "weather", capacity: "pasture" };
const ICON: Record<Tab, React.ReactNode> = { plan: <Sprout size={15} />, calendar: <CalendarDays size={15} />, water: <Droplet size={15} />, field: <Layers size={15} />, weather: <CloudSun size={15} />, pasture: <Leaf size={15} />, heat: <Flame size={15} />, wsrc: <MapPin size={15} /> };

export default function ResultPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Result />
    </Suspense>
  );
}

function Loading() {
  return (
    <div className="mx-auto grid max-w-6xl gap-3 px-4 sm:px-6">
      <Skeleton className="h-16" />
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-28" />
      <Skeleton className="h-80" />
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
  crop: ["plan", "calendar", "water", "field", "weather"],
  livestock: ["pasture", "heat", "wsrc", "calendar", "weather"],
  general: ["field", "weather", "water"],
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
  const active: Tab = tabs.includes(tab) && (sp.get("tab") || mod === "crop") ? tab : tabs[0];
  const ranked = useRanked(data);
  const { best } = ranked;
  const options = useMemo(() => tabs.map((k) => ({ value: k, label: <span className="flex items-center gap-1.5"><span aria-hidden className="text-[var(--fg-3)]">{ICON[k]}</span>{t(`q.${k}` as Key)}</span> })), [t, tabs]);

  // livestock not computed yet → ask the backend for it (core is cached, so this is fast)
  const switchModule = async (m: ModuleTab) => {
    setTab(MODULE_TABS[m][0], m);
    if (m !== "livestock" || data.livestock) return;
    let req: AnalyzeRequest | null = null;
    try {
      req = JSON.parse(localStorage.getItem(`fs:req:${data.fieldId}`) ?? "null");
    } catch {}
    if (!req && data.fieldId.startsWith("demo-")) req = await fetch(`/demo/${data.fieldId.slice(5)}.req.json`).then((r) => r.json()).catch(() => null);
    if (!req) return;
    setLoadingLs(true);
    try {
      const d = await analyzeField({ ...req, modules: ["crop", "livestock"], lang });
      setData({ ...data, livestock: d.livestock, modulesComputed: d.modulesComputed });
    } catch {
    } finally {
      setLoadingLs(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-3 px-3 sm:px-6">
      <FieldHeader data={data} />
      {data.degraded && <DegradedNotice items={data.degraded} />}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<ModuleTab>
          value={mod}
          onChange={switchModule}
          options={[
            { value: "crop", label: <span className="flex items-center gap-1.5"><Wheat size={15} />{t("mod.crop")}</span> },
            { value: "livestock", label: <span className="flex items-center gap-1.5"><Beef size={15} />{t("mod.livestock")}</span> },
            { value: "general", label: <span className="flex items-center gap-1.5"><Globe size={15} />{t("mod.general")}</span> },
          ]}
          ariaLabel="module"
        />
      </div>
      {mod === "livestock" && data.livestock ? (
        <LivestockCards data={data} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <FieldTwin data={data} list={ranked.list} bestId={best.s.id} />
          <AnswerCard data={data} best={best.s} bestScore={best.score} water={best.gross} onMore={() => setTab("plan", mod)} />
        </div>
      )}
      <p className="-mt-1 flex items-center gap-1.5 px-1 text-[12px] text-[var(--fg-3)]"><Info size={13} /> {t("disclaimer")}</p>
      {mod !== "general" && active !== "calendar" && <ThisWeekCard data={data} onOpen={() => setTab("calendar", mod)} />}
      <div className="lg sticky top-[calc(76px+env(safe-area-inset-top))] z-30 -mx-1 rounded-full p-1">
        <div className="no-scrollbar overflow-x-auto">
          <Segmented<Tab> value={active} onChange={(v) => setTab(v, mod)} options={options} className="bg-transparent" ariaLabel="tabs" />
        </div>
      </div>
      {(busy || loadingLs) && <Skeleton className="h-24" />}
      <AnimatePresence mode="wait" initial={false}>
        <m.div key={mod + active} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring}>
          {active === "plan" && <StrategiesTab data={data} />}
          {active === "calendar" && <CalendarTab data={data} />}
          {active === "water" && (
            <WaterTab
              data={data}
              onTryDry={() => {
                useResultUi.getState().set({ whatIf: { dT: 0, dP: -30, strategies: null, loading: true } });
                setTab("weather", mod);
              }}
            />
          )}
          {active === "field" && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
              <Fold icon={<FlaskConical size={18} />} title={t("f.soil")} hint={`${t("r.salt")}: ${t(`lvl.${data.soil.salinityLevel}` as Key)}`} open>
                <SoilTab data={data} onRecompute={recompute} />
              </Fold>
              <Fold icon={<ScrollText size={18} />} title={t("f.history")} hint={data.history.seasons.length ? `${data.history.seasons[0].year}-${data.history.seasons[data.history.seasons.length - 1].year}` : undefined}>
                <HistoryTab data={data} />
              </Fold>
              <Fold icon={<Map size={18} />} title={t("f.map")} hint="MODIS · SMAP · IMERG · SRTM">
                <MapTab data={data} />
              </Fold>
            </div>
          )}
          {active === "weather" && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
              <ForecastTab data={data} />
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
