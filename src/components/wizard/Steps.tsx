"use client";

import { clsx } from "clsx";
import { AnimatePresence, m } from "motion/react";
import { Beef, Check, ChevronRight, CloudSun, Coins, Crosshair, Droplets, FileUp, FlaskConical, Leaf, Sprout, Timer, Wheat, Loader2, MapPin, Pencil, RotateCcw, Satellite, Search, SquarePen, Thermometer, Trash2 } from "lucide-react";
import { FieldSnapshot } from "../FieldSnapshot";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzeRequest, CropId, IrrigationMethod, Level, Module, Priority } from "@/types/api";
import { CROPS, SELECTABLE } from "@/data/crops";
import { DEMO_FIELDS } from "@/data/demoFields";
import { analyzeField, ApiError, saveAnalysis } from "@/api/client";
import { analyzePolygon } from "@/lib/geo";
import { cropIcon, monthLong, num } from "@/lib/format";
import { useT, type Key } from "@/i18n";
import { DEFAULT_LS, useWizard } from "@/store/wizardStore";
import { useProfile } from "@/store/platformStore";
import type { MapApi } from "../map/FieldMap";
import { Button, Card, ErrorState, Segmented, spring, springPop } from "../ui";
import { CropDot, G } from "@/components/Glyph";

const FieldMap = dynamic(() => import("../map/FieldMap"), { ssr: false, loading: () => <div className="shimmer h-full w-full bg-[var(--surface-2)]" /> });

/** 200 m circle around a point (FRONTEND_REJASI §3.2.1, "Nuqta qo'yish"). */
function circle(lat: number, lon: number, rM: number): GeoJSON.Polygon {
  const ring: [number, number][] = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * 2 * Math.PI;
    ring.push([lon + (rM / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (rM / 110574) * Math.sin(a)]);
  }
  ring[32] = ring[0];
  return { type: "Polygon", coordinates: [ring] };
}

/** First Polygon (or the first polygon of a MultiPolygon) in any GeoJSON object. */
function polygonFromGeoJson(g: unknown): GeoJSON.Polygon | null {
  const o = g as { type?: string; geometry?: unknown; features?: unknown[]; coordinates?: unknown };
  if (!o || typeof o !== "object") return null;
  if (o.type === "Polygon") return o as GeoJSON.Polygon;
  if (o.type === "MultiPolygon") return { type: "Polygon", coordinates: (o.coordinates as GeoJSON.Position[][][])[0] };
  if (o.type === "Feature") return polygonFromGeoJson(o.geometry);
  if (o.type === "FeatureCollection") for (const f of o.features ?? []) { const p = polygonFromGeoJson(f); if (p) return p; }
  return null;
}

/* ------------------------------------------------------------------ step indicator */

export function StepIndicator({ step, onGo }: { step: 1 | 2 | 3; onGo: (s: 1 | 2) => void }) {
  const { t } = useT();
  const items: { n: 1 | 2 | 3; k: Key }[] = [
    { n: 1, k: "step.field" },
    { n: 2, k: "step.info" },
    { n: 3, k: "step.run" },
  ];
  return (
    <ol className="flex items-center gap-1.5 text-[13.5px]">
      {items.map((it, i) => {
        const done = step > it.n, on = step === it.n;
        return (
          <li key={it.n} className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!done || it.n === 3}
              onClick={() => it.n !== 3 && onGo(it.n)}
              className={clsx("flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 font-semibold transition-colors", on ? "bg-[var(--surface)] shadow-[var(--shadow-card)]" : done ? "text-[var(--accent)] hover:bg-[var(--surface)]/60" : "text-[var(--fg-3)]")}
            >
              <span className={clsx("flex h-6 w-6 items-center justify-center rounded-full text-[12px]", on ? "bg-[var(--accent-fill)] text-white" : done ? "bg-[var(--accent-soft)]" : "bg-[var(--surface-3)]")}>{done ? <Check size={13} /> : it.n}</span>
              {t(it.k)}
            </button>
            {i < 2 && <span className="h-px w-5 bg-[var(--hairline-strong)]" />}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ step 1: field */

type Place = { display_name: string; lat: string; lon: string };

export function Step1({ onNext }: { onNext: () => void }) {
  const { t, lang } = useT();
  const { polygon, setPolygon, demoId, placeType } = useWizard();
  const [inputMode, setInputMode] = useState<"draw" | "point" | "geojson">("draw");
  const [fileErr, setFileErr] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const onFile = async (f: File) => {
    setFileErr(false);
    try {
      const p = polygonFromGeoJson(JSON.parse(await f.text()));
      if (!p) throw new Error("no polygon");
      setPolygon(p, null, "polygon");
    } catch {
      setFileErr(true);
    }
  };
  const [basemap, setBasemap] = useState<"sat" | "map">("sat");
  const api = useRef<MapApi | null>(null);
  const info = useMemo(() => (polygon ? analyzePolygon(polygon) : null), [polygon]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [region, setRegion] = useState<string>("");

  // Nominatim search, debounced 600 ms (plan §4.3)
  useEffect(() => {
    if (q.trim().length < 3) {
      setResults([]); // eslint-disable-line react-hooks/set-state-in-effect -- clear stale results
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=uz&limit=5&accept-language=${lang}&q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((r: Place[]) => setResults(r))
        .catch(() => {});
    }, 600);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q, lang]);

  // region name for the drawn field
  useEffect(() => {
    if (!info) return;
    const ctrl = new AbortController();
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${info.centroid[0]}&lon=${info.centroid[1]}&zoom=8&accept-language=${lang}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((r: { address?: { state?: string } }) => setRegion(r.address?.state ?? ""))
      .catch(() => {});
    return () => ctrl.abort();
  }, [info?.centroid[0], info?.centroid[1], lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = !!info && info.errors.length === 0;

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
      <div className="relative isolate h-[62dvh] min-h-[420px] overflow-hidden rounded-[28px] shadow-[var(--shadow-card)] lg:h-[calc(100dvh-210px)]">
        <FieldMap navClassName="top-[118px] right-3 sm:top-3" value={polygon} onChange={(p) => setPolygon(p, null)} basemap={basemap} apiRef={api} onMapClick={inputMode === "point" ? (la, lo) => setPolygon(circle(la, lo, 200), null, "point_buffer") : undefined} />
        {/* search */}
        <div className="absolute top-3 right-3 left-3 z-[500] sm:right-auto sm:w-[360px]">
          <div className="lg flex h-11 items-center gap-2 rounded-full px-3.5">
            <Search size={16} className="text-[var(--fg-3)]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("s1.search")} className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-[var(--fg-3)] sm:text-[14px]" aria-label={t("s1.search")} />
          </div>
          <AnimatePresence>
            {results.length > 0 && (
              <m.ul initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring} className="lg lg-strong mt-1.5 overflow-hidden rounded-2xl p-1">
                {results.map((r) => (
                  <li key={r.lat + r.lon}>
                    <button
                      type="button"
                      onClick={() => {
                        api.current?.flyTo(+r.lat, +r.lon, 15);
                        setResults([]);
                        setQ("");
                      }}
                      className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-[13px] hover:bg-[var(--surface)]/70"
                    >
                      <MapPin size={14} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                      <span className="line-clamp-2">{r.display_name}</span>
                    </button>
                  </li>
                ))}
              </m.ul>
            )}
          </AnimatePresence>
        </div>
        {/* tools */}
        <div className="absolute bottom-3 left-3 z-[500] flex max-w-[calc(100%-24px)] flex-wrap gap-1.5">
          <div className="lg rounded-full p-0.5">
            <Segmented
              size="sm"
              className="bg-transparent"
              value={inputMode}
              onChange={(v) => {
                setInputMode(v);
                if (v === "draw") api.current?.startDraw();
                if (v === "geojson") fileRef.current?.click();
              }}
              options={[{ value: "draw", label: <span className="flex items-center gap-1"><Pencil size={13} /> {t("place.draw")}</span> }, { value: "point", label: <span className="flex items-center gap-1"><MapPin size={13} /> {t("place.point")}</span> }, { value: "geojson", label: <span className="flex items-center gap-1"><FileUp size={13} /> {t("place.geojson")}</span> }]}
            />
          </div>
          <input ref={fileRef} type="file" accept=".geojson,.json,application/geo+json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <Button size="sm" variant="glass" onClick={() => api.current?.toggleEdit()} disabled={!polygon}>
            <SquarePen size={14} /> {t("s1.editMode")}
          </Button>
          <Button size="sm" variant="glass" onClick={() => api.current?.clear()} disabled={!polygon} ariaLabel={t("s1.delete")}>
            <Trash2 size={14} />
          </Button>
          <Button size="sm" variant="glass" ariaLabel={t("s1.locate")} onClick={() => navigator.geolocation?.getCurrentPosition((p) => api.current?.flyTo(p.coords.latitude, p.coords.longitude, 16))}>
            <Crosshair size={14} />
          </Button>
          <div className="lg rounded-full p-0.5">
            <Segmented size="sm" className="bg-transparent" value={basemap} onChange={setBasemap} options={[{ value: "sat", label: t("s1.basemap.sat") }, { value: "map", label: t("s1.basemap.map") }]} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Card>
          <div className="mb-2 text-[12px] font-semibold tracking-wide text-[var(--fg-3)] uppercase">{t("s1.field")}</div>
          {inputMode === "point" && !polygon && <p className="mb-2 text-[13.5px] text-[var(--accent)]"><G e="📍" /> {t("place.pointHint")}</p>}
          {inputMode === "geojson" && <p className="mb-2 text-[13px] text-[var(--fg-3)]"><G e="📂" /> {t("place.geojsonHint")} <button type="button" className="font-semibold text-[var(--accent)]" onClick={() => fileRef.current?.click()}>{t("place.pick")}</button></p>}
          {fileErr && <p role="alert" className="mb-2 text-[13px] font-medium text-[var(--danger-fg)]">{t("place.badFile")}</p>}
          {placeType === "point_buffer" && polygon && <p className="mb-2 rounded-xl bg-[var(--warn-bg)] px-2.5 py-1.5 text-[12.5px] text-[var(--warn-fg)]">{t("place.approx")}</p>}
          {info ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
              <dt className="text-[var(--fg-3)]">{t("s1.area")}</dt>
              <dd className="font-semibold tnum">
                {num(info.areaHa, 1)} {t("ha")}
              </dd>
              <dt className="text-[var(--fg-3)]">{t("s1.center")}</dt>
              <dd className="tnum">
                {info.centroid[0].toFixed(3)}, {info.centroid[1].toFixed(3)}
              </dd>
              <dt className="text-[var(--fg-3)]">{t("s1.region")}</dt>
              <dd>{region || "…"}</dd>
            </dl>
          ) : (
            <p className="text-[14px] text-[var(--fg-3)]">{t("s1.hint")}</p>
          )}
          {info?.errors.map((e) => (
            <p key={e} role="alert" className="mt-2 text-[13px] font-medium text-[var(--danger-fg)]">
              {t(`err.${e}` as Key)}
            </p>
          ))}
        </Card>
        <Card>
          <div className="mb-2 text-[12px] font-semibold tracking-wide text-[var(--fg-3)] uppercase">
            {t("s1.or")} · {t("s1.demo")}
          </div>
          <div className="grid gap-1.5">
            {DEMO_FIELDS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setPolygon(f.polygon, f.id)}
                className={clsx("press flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors", demoId === f.id ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-2)]")}
              >
                <FieldSnapshot polygon={f.polygon} ratio={1} className="h-12 w-12 shrink-0 overflow-hidden rounded-xl" />
                <span className="flex-1">
                  <b className="block text-[14.5px]">{f.region[lang]}</b>
                  <span className="text-[12.5px] text-[var(--fg-3)]">{t(`demo.${f.id}` as Key)}</span>
                </span>
                {demoId === f.id && <Check size={16} className="text-[var(--accent)]" />}
              </button>
            ))}
          </div>
        </Card>
        <Button size="lg" disabled={!valid} onClick={onNext} className="w-full">
          {info ? `${num(info.areaHa, 1)} ${t("ha")} · ` : ""}
          {t("next")} <ChevronRight size={18} />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ step 2: farmer data */

const PRIORITIES: { id: Priority; icon: React.ReactNode }[] = [
  { id: "water", icon: <Droplets size={15} /> },
  { id: "salinity", icon: <FlaskConical size={15} /> },
  { id: "income", icon: <Coins size={15} /> },
  { id: "soil", icon: <Sprout size={15} /> },
  { id: "forage", icon: <Beef size={15} /> },
  { id: "labor", icon: <Timer size={15} /> },
];

function CropSelect({ value, onChange, filter, id }: { value: CropId | null; onChange: (c: CropId) => void; filter?: (c: CropId) => boolean; id: string }) {
  const { lang } = useT();
  return (
    <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value as CropId)} className="h-11 min-w-0 flex-1 rounded-2xl bg-[var(--surface-2)] px-3 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:text-[14.5px]">
      <option value="" disabled>
        -
      </option>
      {SELECTABLE.filter((c) => !filter || filter(c)).map((c) => (
        <option key={c} value={c}>
          <CropDot crop={c} /> {CROPS[c].name[lang]}
        </option>
      ))}
    </select>
  );
}

export function Step2({ onBack, onRun }: { onBack: () => void; onRun: () => void }) {
  const { t } = useT();
  const w = useWizard();
  const profile = useProfile((s) => s.profile);
  const [tab, setTab] = useState<"crop" | "livestock">(profile === "herder" ? "livestock" : "crop");
  const showCrop = profile !== "herder";
  const showLs = profile === "herder" || profile === "expert";
  const canRun = profile === "herder" ? true : w.priorities.length > 0;
  const info = w.polygon ? analyzePolygon(w.polygon) : null;
  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
    <div className="grid min-w-0 gap-3">
      {showCrop && showLs && (
        <div className="flex justify-center">
          <Segmented value={tab} onChange={setTab} options={[{ value: "crop", label: t("mod.crop") }, { value: "livestock", label: t("mod.livestock") }]} />
        </div>
      )}
      {showCrop && (!showLs || tab === "crop") && <CropForm />}
      {showLs && (!showCrop || tab === "livestock") && <LivestockForm />}
      <div className="flex justify-between gap-2 pt-1">
        <Button variant="secondary" onClick={onBack}>
          ← {t("back")}
        </Button>
        <Button disabled={!canRun} onClick={onRun}>
          <Search size={16} /> {t("s2.run")} →
        </Button>
      </div>
    </div>
      {/* the field stays in view while answering */}
      {w.polygon && info && (
        <aside className="grid gap-3 lg:sticky lg:top-[96px]">
          <FieldSnapshot polygon={w.polygon} ratio={4 / 3} />
          <div className="rounded-[22px] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-baseline justify-between">
              <b className="text-[15px]">{t("s2.yourField" as Key)}</b>
              <span className="text-[20px] font-semibold tnum">{info.areaHa} <span className="text-[13px] font-normal text-[var(--fg-3)]">{t("ha")}</span></span>
            </div>
            <div className="text-[12.5px] text-[var(--fg-3)] tnum">{info.centroid[0].toFixed(4)}°N, {info.centroid[1].toFixed(4)}°E</div>
            <ul className="mt-3 grid gap-2 text-[13px]">
              {([[Thermometer, "s2.d1"], [Satellite, "s2.d2"], [Droplets, "s2.d3"], [CloudSun, "s2.d4"]] as const).map(([Icon, k]) => (
                <li key={k} className="flex items-center gap-2.5 text-[var(--fg-2)]">
                  <Icon size={15} className="shrink-0 text-[var(--accent)]" /> {t(k as Key)}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      )}
    </div>
  );
}

const LS_PRIORITIES = ["conserve", "more_animals", "heat", "forage"] as const;

function LivestockForm() {
  const { t, lang } = useT();
  const w = useWizard();
  const ls = w.livestock ?? DEFAULT_LS;
  const set = (patch: Partial<typeof ls>) => w.set({ livestock: { ...ls, ...patch } });
  const au = ls.herd.cattle + ls.herd.smallRuminants * 0.2 + ls.herd.horses * 1.25;
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const herdIn = (k: keyof typeof ls.herd, label: string) => (
    <label className="flex items-center gap-2 text-[14px]">
      <span className="text-[var(--fg-2)]">{label}</span>
      <input inputMode="numeric" value={ls.herd[k]} onChange={(e) => set({ herd: { ...ls.herd, [k]: Math.min(100000, Number(e.target.value.replace(/\D/g, "")) || 0) } })} className="h-11 w-24 rounded-2xl bg-[var(--surface-2)] px-3 text-[16px] tnum outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:text-[14.5px]" />
    </label>
  );
  return (
    <>
      <Card>
        <h2 className="mb-3 text-[17px] font-semibold">1. {t("lf.herd")}</h2>
        <div className="flex flex-wrap gap-3">
          {herdIn("cattle", t("lf.cattle"))}
          {herdIn("smallRuminants", t("lf.small"))}
          {herdIn("horses", t("lf.horses"))}
        </div>
        <p className="mt-2 text-[13px] text-[var(--fg-3)] tnum">→ {t("lf.total", { n: Math.round(au * 10) / 10 })}</p>
      </Card>
      <Card>
        <h2 className="mb-3 text-[17px] font-semibold">2. {t("lf.period")}</h2>
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <select aria-label={t("lf.from")} value={ls.grazingFrom} onChange={(e) => set({ grazingFrom: +e.target.value })} className="h-11 rounded-2xl bg-[var(--surface-2)] px-3 text-[16px] sm:text-[14.5px]">
            {months.map((mo) => <option key={mo} value={mo}>{monthLong(mo, lang)}</option>)}
          </select>
          {t("lf.from")}
          <select aria-label={t("lf.to")} value={ls.grazingTo} onChange={(e) => set({ grazingTo: +e.target.value })} className="h-11 rounded-2xl bg-[var(--surface-2)] px-3 text-[16px] sm:text-[14.5px]">
            {months.map((mo) => <option key={mo} value={mo}>{monthLong(mo, lang)}</option>)}
          </select>
          {t("lf.to")}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-[14px] text-[var(--fg-2)]">{t("lf.type")}</span>
          <Segmented value={ls.pastureType} onChange={(v) => set({ pastureType: v })} options={(["natural", "sown", "mixed"] as const).map((v) => ({ value: v, label: t(`lf.${v}` as Key) }))} />
        </div>
      </Card>
      <Card>
        <h2 className="mb-3 text-[17px] font-semibold">3. {t("lf.water")}</h2>
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent-fill)]" checked={ls.hasWaterOnSite} onChange={(e) => set({ hasWaterOnSite: e.target.checked })} />
          {t("lf.waterOnSite")}
        </label>
      </Card>
      <Card>
        <h2 className="mb-3 text-[17px] font-semibold">4. {t("lf.priorities")}</h2>
        <div className="flex flex-wrap gap-2">
          {LS_PRIORITIES.map((p) => {
            const idx = ls.priorities.indexOf(p);
            const on = idx >= 0;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() => set({ priorities: on ? ls.priorities.filter((x) => x !== p) : [...ls.priorities, p] })}
                className={clsx("flex h-11 items-center gap-2 rounded-full pr-4 pl-3 text-[14.5px] font-medium transition-colors", on ? "bg-[var(--accent-fill)] text-white" : "bg-[var(--surface-2)] hover:bg-[var(--surface-3)]")}
              >
                {on ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-[12px] font-bold">{idx + 1}</span> : <span aria-hidden className="flex">{{ conserve: <Leaf size={15} />, more_animals: <Beef size={15} />, heat: <Thermometer size={15} />, forage: <Wheat size={15} /> }[p]}</span>}
                {t(`lp.${p}` as Key)}
              </button>
            );
          })}
        </div>
      </Card>
    </>
  );
}

function CropForm() {
  const { t } = useT();
  const w = useWizard();
  const detect = w.rotation.every((r) => r.crop == null);
  const setRow = (i: number, patch: Partial<(typeof w.rotation)[number]>) => w.set({ rotation: w.rotation.map((r, k) => (k === i ? { ...r, ...patch } : r)) });

  return (
    <>
      <Card>
        <h2 className="mb-3 text-[17px] font-semibold">1. {t("s2.rotation")}</h2>
        <div className="grid gap-2">
          {w.rotation.map((r, i) => (
            <div key={r.year} className="flex flex-wrap items-center gap-2">
              <span className="w-12 text-[14px] font-semibold tnum">{r.year}</span>
              {r.crop == null && detect ? (
                <span className="flex h-11 flex-1 items-center gap-2 rounded-2xl bg-[var(--surface-2)] px-3 text-[14px] text-[var(--fg-3)]">
                  <Satellite size={15} /> {t("s2.detecting")}
                </span>
              ) : (
                <CropSelect id={`crop-${r.year}`} value={r.crop} onChange={(c) => setRow(i, { crop: c, secondCrop: c === "winter_wheat" || c === "barley" ? r.secondCrop : null })} />
              )}
              {(r.crop === "winter_wheat" || r.crop === "barley") && (
                <label className="flex w-full items-center gap-2 pl-14 text-[13.5px] text-[var(--fg-2)] sm:w-auto sm:pl-0">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--accent-fill)]" checked={r.secondCrop != null} onChange={(e) => setRow(i, { secondCrop: e.target.checked ? "mung_bean" : null })} />
                  {t("s2.second")}
                  {r.secondCrop != null && <CropSelect id={`second-${r.year}`} value={r.secondCrop} onChange={(c) => setRow(i, { secondCrop: c })} filter={(c) => ["mung_bean", "sorghum", "soybean", "sunflower", "maize", "fallow"].includes(c)} />}
                </label>
              )}
            </div>
          ))}
        </div>
        <Button
          size="sm"
          variant={detect ? "primary" : "secondary"}
          className="mt-3"
          onClick={() => w.set({ rotation: w.rotation.map((r) => ({ ...r, crop: detect ? "cotton" : null, secondCrop: null })) })}
        >
          <Satellite size={14} /> {t("s2.detect")}
          {detect && <Check size={14} />}
        </Button>
      </Card>

      <Card>
        <h2 className="mb-3 text-[17px] font-semibold">2. {t("s2.priorities")}</h2>
        <div className="flex flex-wrap gap-2">
          {PRIORITIES.map((p) => {
            const idx = w.priorities.indexOf(p.id);
            const on = idx >= 0;
            const blocked = !on && w.priorities.length >= 3;
            return (
              <m.button
                key={p.id}
                type="button"
                whileTap={{ scale: 0.96 }}
                transition={spring}
                disabled={blocked}
                onClick={() => w.togglePriority(p.id)}
                aria-pressed={on}
                className={clsx(
                  "relative flex h-11 items-center gap-2 rounded-full pr-4 pl-3 text-[14.5px] font-medium transition-colors disabled:opacity-40",
                  on ? "bg-[var(--accent-fill)] text-white shadow-[0_6px_16px_-8px_rgb(46_125_50/0.7)]" : "bg-[var(--surface-2)] hover:bg-[var(--surface-3)]",
                )}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {on ? (
                    <m.span key="n" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.3, opacity: 0 }} transition={springPop} className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-[12px] font-bold tnum">
                      {idx + 1}
                    </m.span>
                  ) : (
                    <m.span key="i" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.3, opacity: 0 }} transition={springPop} aria-hidden>
                      {p.icon}
                    </m.span>
                  )}
                </AnimatePresence>
                {t(`p.${p.id}` as Key)}
              </m.button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[13px] text-[var(--fg-3)]">
          <span>
            {t("s2.order")}: {w.priorities.length ? w.priorities.map((p, i) => `${i + 1}. ${t(`p.${p}` as Key)}`).join("  ") : "-"}
          </span>
          {w.priorities.length > 0 && (
            <button type="button" onClick={() => w.set({ priorities: [] })} className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-[var(--accent)] hover:bg-[var(--accent-soft)]" aria-label={t("reset")}>
              <RotateCcw size={13} />
            </button>
          )}
        </div>
        {!w.priorities.length && <p className="mt-1 text-[13px] text-[var(--danger-fg)]">{t("s2.needPriority")}</p>}
      </Card>

      <Card>
        <h2 className="mb-3 text-[17px] font-semibold">3. {t("s2.water")}</h2>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-32 text-[14px] text-[var(--fg-2)]">{t("s2.supply")}</span>
            <Segmented<Level> value={w.water.availability} onChange={(v) => w.set({ water: { ...w.water, availability: v } })} options={(["low", "medium", "high"] as const).map((v) => ({ value: v, label: t(`supply.${v}` as Key) }))} />
          </div>
          <label className="flex flex-wrap items-center gap-3" htmlFor="limit">
            <span className="w-32 text-[14px] text-[var(--fg-2)]">{t("s2.limit")}</span>
            <span className="flex items-center gap-2">
              <input
                id="limit"
                inputMode="numeric"
                value={w.water.limitM3PerHa ?? ""}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  w.set({ water: { ...w.water, limitM3PerHa: v ? Math.min(30000, +v) : undefined } });
                }}
                placeholder="11000"
                className="h-11 w-32 rounded-2xl bg-[var(--surface-2)] px-3 text-[16px] tnum outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:text-[14.5px]"
              />
              <span className="text-[13px] text-[var(--fg-3)]">{t("m3ha")}</span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-32 text-[14px] text-[var(--fg-2)]">{t("s2.method")}</span>
            <Segmented<IrrigationMethod> value={w.water.method} onChange={(v) => w.set({ water: { ...w.water, method: v } })} options={(["furrow", "drip", "sprinkler"] as const).map((v) => ({ value: v, label: t(`m.${v}` as Key) }))} />
          </div>
        </div>
      </Card>

      <details className="disclosure rounded-[22px] bg-[var(--surface)] shadow-[var(--shadow-card)]">
        <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 text-[17px] font-semibold">
          <ChevronRight size={17} className="chev text-[var(--fg-3)]" /> 4. {t("s2.advanced")}
        </summary>
        <div className="grid gap-3 px-5 pb-5">
          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            <span className="w-36 text-[var(--fg-2)]">{t("s2.soilTest")}</span>
            <NumIn id="ece" label="ECe" unit="dS/m" value={w.soil?.eceDsM} max={30} onChange={(v) => w.set({ soil: { ...w.soil, eceDsM: v } })} />
            <NumIn id="humus" label="Gumus" unit="%" value={w.soil?.humusPct} max={10} onChange={(v) => w.set({ soil: { ...w.soil, humusPct: v } })} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            <span className="w-36 text-[var(--fg-2)]">{t("s2.irrWater")}</span>
            <NumIn id="ecw" label="ECw" unit="dS/m" value={w.soil?.ecwDsM} max={10} onChange={(v) => w.set({ soil: { ...w.soil, ecwDsM: v } })} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[14px]">
            <span className="w-36 text-[var(--fg-2)]">{t("s2.equipment")}</span>
            {(["combine", "seeder", "drip"] as const).map((e) => {
              const on = w.constraints?.equipment?.includes(e);
              return (
                <label key={e} className="flex items-center gap-1.5">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--accent-fill)]" checked={!!on} onChange={() => w.set({ constraints: { ...w.constraints, equipment: on ? w.constraints?.equipment?.filter((x) => x !== e) : [...(w.constraints?.equipment ?? []), e] } })} />
                  {t(`eq.${e}` as Key)}
                </label>
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" className="h-4 w-4 accent-[var(--accent-fill)]" checked={!!w.constraints?.hasLivestock} onChange={(e) => w.set({ constraints: { ...w.constraints, hasLivestock: e.target.checked } })} />
            {t("s2.livestock")}
          </label>
        </div>
      </details>
    </>
  );
}

function NumIn({ id, label, unit, value, max, onChange }: { id: string; label: string; unit: string; value?: number; max: number; onChange: (v?: number) => void }) {
  return (
    <label htmlFor={id} className="flex items-center gap-1.5">
      <span className="text-[var(--fg-3)]">{label}</span>
      <input
        id={id}
        inputMode="decimal"
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value.replace(",", ".");
          if (v === "") return onChange(undefined);
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0 && n <= max) onChange(n);
        }}
        className="h-10 w-20 rounded-xl bg-[var(--surface-2)] px-2.5 text-[16px] tnum outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:text-[14px]"
      />
      <span className="text-[12px] text-[var(--fg-3)]">{unit}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ step 3: running */

const STEPS: Key[] = ["s3.power", "s3.s2", "s3.ai", "s3.soil", "s3.water", "s3.seasonal", "s3.strategies"];

export function Step3({ onBack }: { onBack: () => void }) {
  const { t, lang } = useT();
  const profile = useProfile((x) => x.profile);
  const router = useRouter();
  const w = useWizard();
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!w.polygon) return;
    const ctrl = new AbortController();
    const t0 = Date.now();
    setError(null); // eslint-disable-line react-hooks/set-state-in-effect -- new attempt
    setElapsed(0);
    const tick = setInterval(() => setElapsed((Date.now() - t0) / 1000), 250);
    const modules: Module[] = profile === "herder" ? ["crop", "livestock"] : profile === "expert" ? ["crop", "livestock"] : ["crop"];
    const req: AnalyzeRequest = {
      polygon: w.polygon,
      rotation: w.rotation,
      priorities: w.priorities.length ? w.priorities : ["forage"],
      water: w.water,
      soil: w.soil,
      constraints: w.constraints,
      lang,
      profile,
      modules,
      placeType: w.placeType ?? "polygon",
      livestock: modules.includes("livestock") ? (w.livestock ?? DEFAULT_LS) : undefined,
    };
    let handedOver = false;
    analyzeField(req, ctrl.signal, (p) => {
      // the backend's first answer (~4 s): open the result now, the page keeps polling the job
      handedOver = true;
      saveAnalysis(p);
      try {
        localStorage.setItem(`fs:req:${p.fieldId}`, JSON.stringify(req));
      } catch {}
      router.push(`/result/${p.fieldId}`);
    })
      .then((d) => {
        if (handedOver) return;
        saveAnalysis(d);
        try {
          localStorage.setItem(`fs:req:${d.fieldId}`, JSON.stringify(req));
        } catch {}
        router.push(`/result/${d.fieldId}`);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof ApiError && e.code.startsWith("too") ? t(`err.${e.code}` as Key) : e instanceof ApiError && e.status === 422 && e.message !== e.code ? e.message : t("s3.failed"));
      })
      .finally(() => clearInterval(tick));
    return () => {
      ctrl.abort();
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per attempt
  }, [run]);

  const current = Math.min(STEPS.length - 1, Math.floor(elapsed / 4));
  const pct = Math.min(95, Math.round((1 - Math.exp(-elapsed / 14)) * 100));
  const dyk = (["dyk.1", "dyk.2", "dyk.3", "dyk.4"] as Key[])[Math.floor(elapsed / 7) % 4];
  const demo = w.demoId ?? "sirdaryo";

  if (error)
    return (
      <div className="mx-auto max-w-[620px]">
        <ErrorState message={error} onRetry={() => setRun((r) => r + 1)} onDemo={() => router.push(`/result/demo-${demo}`)} />
        <Button variant="ghost" className="mt-3" onClick={onBack}>
          ← {t("back")}
        </Button>
      </div>
    );

  const LAYERS = ["NASA POWER", "Sentinel-2", "MODIS", "SMAP", "SRTM", "ECMWF"];
  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
      {w.polygon && (
        <FieldSnapshot polygon={w.polygon} scan ratio={4 / 3}>
          <div className="absolute top-3 left-3 flex max-w-[calc(100%-24px)] flex-wrap gap-1.5">
            {LAYERS.map((l, i) => (
              <span key={l} className={clsx("rounded-full px-2.5 py-1 text-[12px] font-semibold backdrop-blur-md transition-all duration-500", i <= Math.floor(elapsed / 2.5) ? "bg-white/90 text-[#142019]" : "bg-black/35 text-white/60")}>
                {i <= Math.floor(elapsed / 2.5) && <Check size={11} className="mr-1 inline -translate-y-px" strokeWidth={3} />}
                {l}
              </span>
            ))}
          </div>
        </FieldSnapshot>
      )}
      <div className="rounded-[24px] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]" role="status" aria-live="polite">
        <h2 className="flex items-center gap-2 text-[20px] font-semibold"><Satellite size={20} className="text-[var(--fg-3)]" /> {t("s3.title")}</h2>
        <ul className="mt-4 grid gap-2">
          {STEPS.map((k, i) => (
            <li key={k} className={clsx("flex items-center gap-2.5 text-[14.5px] transition-colors", i < current ? "text-[var(--fg)]" : i === current ? "font-semibold text-[var(--fg)]" : "text-[var(--fg-3)]")}>
              <span className="flex h-5 w-5 items-center justify-center">
                {i < current ? <Check size={16} className="text-[var(--accent)]" /> : i === current ? <Loader2 size={16} className="animate-spin text-[var(--accent)]" /> : <i className="h-2 w-2 rounded-full bg-[var(--surface-3)]" />}
              </span>
              {t(k)}
            </li>
          ))}
        </ul>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
          <div className="h-full origin-left rounded-full bg-[var(--accent-fill)] transition-transform duration-300" style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[12px] text-[var(--fg-3)] tnum">
          <span>{pct}%</span>
          <span>{Math.round(elapsed)} s</span>
        </div>
        <AnimatePresence mode="wait">
          <m.p key={dyk} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring} className="mt-4 rounded-2xl bg-[var(--surface-2)] px-3.5 py-2.5 text-[13.5px] text-[var(--fg-2)]"><b>{t("s3.dyk")}</b> {t(dyk)}
          </m.p>
        </AnimatePresence>
        {elapsed > 30 && (
          <m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex flex-wrap items-center gap-2 text-[13.5px] text-[var(--fg-2)]">
            {t("s3.slow")}
            <Button size="sm" variant="secondary" onClick={() => router.push(`/result/demo-${demo}`)}>
              {t("openDemo")}
            </Button>
          </m.div>
        )}
      </div>
    </div>
  );
}
