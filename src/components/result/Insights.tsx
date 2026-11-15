"use client";

import { clsx } from "clsx";
import { CloudRain, Flame, Layers, Leaf, Mountain, Snowflake, Sprout, Timer, Waves } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { AnalyzeResponse, CropId, Strategy, ZoneKind, ZonesData } from "@/types/api";
import { monthShort, num } from "@/lib/format";
import { useT } from "@/i18n";
import { CropDot } from "../Glyph";
import { Card, CardTitle, SourceBadge } from "../ui";

const FieldMap = dynamic(() => import("../map/FieldMap"), { ssr: false, loading: () => <div className="shimmer h-full w-full bg-[var(--surface-2)]" /> });

const useL = () => {
  const { lang } = useT();
  return { lang, L: (uz: string, en: string) => (lang === "en" ? en : uz) };
};

/* ------------------------------------------------------------------ GRACE: water storage */

/** Yearly total water storage anomaly around the field. Loss is warm, gain is water-blue. */
export function WaterStorageCard({ data }: { data: AnalyzeResponse }) {
  const { L } = useL();
  const w = data.insights?.waterStorage;
  if (!w?.series?.length) return null;
  const s = w.series;
  const max = Math.max(...s.map((x) => Math.abs(x.cm)), 1);
  const H = 120, mid = H / 2;
  const first = s[0], last = s[s.length - 1];
  const decade = Math.round(w.trendCmPerYear * 10 * 10) / 10;
  const losing = w.trendCmPerYear < -0.2;
  return (
    <Card>
      <CardTitle source={w.source ?? "GRACE / GRACE-FO"}>{L("Hududning suv zaxirasi", "Regional water storage")}</CardTitle>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <b className={clsx("text-[26px] font-semibold tracking-[-0.02em] tnum", losing ? "text-[var(--level-high-fg)]" : "text-[var(--fg)]")}>
          {w.trendCmPerYear > 0 ? "+" : ""}
          {w.trendCmPerYear.toFixed(1)} {L("sm/yil", "cm/yr")}
        </b>
        <span className="text-[14px] text-[var(--fg-2)]">
          {losing
            ? L(`har 10 yilda ~${Math.abs(decade)} sm suv qatlami yo'qolmoqda (yer osti va yer usti suvi birga)`, `~${Math.abs(decade)} cm of water lost every decade (ground and surface water together)`)
            : L("zaxira barqaror", "storage is stable")}
        </span>
      </div>
      <svg viewBox={`0 0 ${s.length * 14} ${H}`} className="h-[120px] w-full" preserveAspectRatio="none" role="img" aria-label={L("Yillik suv zaxirasi anomaliyasi", "Yearly water storage anomaly")}>
        <line x1={0} x2={s.length * 14} y1={mid} y2={mid} stroke="var(--hairline-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {s.map((x, i) => {
          const h = (Math.abs(x.cm) / max) * (mid - 4);
          return (
            <rect key={x.year} x={i * 14 + 2} width={10} rx={3} y={x.cm >= 0 ? mid - h : mid} height={Math.max(1, h)} fill={x.cm >= 0 ? "var(--water)" : "var(--level-high)"} opacity={0.9}>
              <title>{`${x.year}: ${x.cm > 0 ? "+" : ""}${x.cm.toFixed(1)} ${L("sm", "cm")}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[12px] text-[var(--fg-3)] tnum">
        <span>{first.year}</span>
        <span>{L("0 = 2004-2009 o'rtachasi", "0 = 2004-2009 mean")}</span>
        <span>{last.year}</span>
      </div>
      <p className="mt-2 text-[13px] text-[var(--fg-2)]">
        {L(
          "Bu kamayish kam suv talab qiladigan rotatsiya foydasiga eng kuchli dalil: kelajakda kanal suvi ham, sizot suvi ham kamroq bo'ladi.",
          "This decline is the strongest case for a lower-water rotation: both canal and groundwater will be scarcer.",
        )}
      </p>
      <p className="mt-1 text-[12px] text-[var(--fg-3)]">{w.resolution ? `${w.resolution} · ` : ""}{L("hudud o'rtachasi, dala darajasida emas", "a regional average, not field-level")}</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ heavy rain + erosion */

export function RainErosionCard({ data }: { data: AnalyzeResponse }) {
  const { L } = useL();
  const r = data.insights?.extremeRain, e = data.insights?.erosionRisk;
  if (!r && !e) return null;
  const lvl = e?.level ?? "low";
  return (
    <Card>
      <CardTitle source={r?.source ?? "GPM IMERG · SRTM"}>{L("Kuchli yog'in va eroziya", "Heavy rain and erosion")}</CardTitle>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {r && (
          <>
            <Stat icon={<CloudRain size={14} />} k={L(`> ${r.thresholdMm} mm kunlar`, `> ${r.thresholdMm} mm days`)} v={`${num(r.daysPerYear, 1)} ${L("/yil", "/yr")}`} />
            <Stat icon={<CloudRain size={14} />} k={L("Eng kuchli kun", "Wettest day")} v={`${num(r.maxDailyMm, 0)} mm`} />
            <Stat icon={<Timer size={14} />} k={L("Trend", "Trend")} v={`${r.trendPerDecade > 0 ? "+" : ""}${num(r.trendPerDecade, 1)} ${L("/10 yil", "/decade")}`} />
          </>
        )}
        {e && <Stat icon={<Mountain size={14} />} k={L("Eroziya xavfi", "Erosion risk")} v={L(lvl === "high" ? "Yuqori" : lvl === "medium" ? "O'rta" : "Past", lvl === "high" ? "High" : lvl === "medium" ? "Medium" : "Low")} sub={`${L("qiyalik", "slope")} ${num(e.slopeDeg, 1)}°`} tone={lvl} />}
      </dl>
    </Card>
  );
}

function Stat({ icon, k, v, sub, tone }: { icon: React.ReactNode; k: string; v: string; sub?: string; tone?: "low" | "medium" | "high" }) {
  return (
    <div className="rounded-2xl bg-[var(--surface-2)] px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[12px] text-[var(--fg-3)]">{icon} {k}</dt>
      <dd className="text-[17px] font-semibold tnum" style={tone ? { color: `var(--level-${tone}-fg)` } : undefined}>{v}</dd>
      {sub && <dd className="text-[12px] text-[var(--fg-3)]">{sub}</dd>}
    </div>
  );
}

/* ------------------------------------------------------------------ vulnerable windows */

const RISK = {
  heat: { color: "var(--level-high)", icon: Flame, uz: "Jazirama", en: "Heat" },
  frost: { color: "var(--water)", icon: Snowflake, uz: "Bahorgi sovuq", en: "Spring frost" },
  autumn_frost: { color: "var(--water)", icon: Snowflake, uz: "Kuzgi sovuq", en: "Autumn frost" },
} as const;

const doy = (mmdd: string) => {
  const [m, d] = mmdd.split("-").map(Number);
  return Math.round((Date.UTC(2021, m - 1, d) - Date.UTC(2021, 0, 1)) / 864e5);
};

/** "Seasons when current crops appear more vulnerable" - on one 12-month ruler, per crop. */
export function VulnerableWindowsCard({ data }: { data: AnalyzeResponse }) {
  const { lang, L } = useL();
  const all = data.insights?.vulnerableWindows ?? [];
  const relevant = useMemo(() => {
    const cur = data.strategies.find((s) => s.isCurrent);
    const best = data.strategies.find((s) => s.id === data.summary.bestStrategyId);
    const crops = new Set<CropId>([...(cur?.seasons ?? []), ...(best?.seasons ?? [])].map((x) => x.crop));
    return all.filter((v) => crops.has(v.crop));
  }, [all, data]);
  if (!relevant.length) return null;
  const byCrop = [...new Set(relevant.map((v) => v.crop))];
  return (
    <Card>
      <CardTitle source="NASA POWER 2005-2025">{L("Ekin qachon zaif bo'ladi?", "When is each crop vulnerable?")}</CardTitle>
      <div className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-[12px] sm:grid-cols-[120px_1fr]">
        <span />
        <div className="grid grid-cols-12 text-center text-[var(--fg-3)]">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i}>{monthShort(i + 1, lang).slice(0, 3)}</span>
          ))}
        </div>
        {byCrop.map((c) => (
          <div key={c} className="contents">
            <span className="flex items-center text-[13px] font-medium">
              <CropDot crop={c} label />
            </span>
            <div className="relative h-7 rounded-lg bg-[var(--surface-2)]">
              {relevant
                .filter((v) => v.crop === c)
                .map((v, i) => {
                  const a = doy(v.from), b = doy(v.to);
                  const R = RISK[v.risk];
                  return (
                    <span
                      key={i}
                      title={`${lang === "en" ? R.en : R.uz} · ${v.from} - ${v.to} · ${L("yillarning", "of years")} ${v.probPct}%${v.note ? ` · ${v.note}` : ""}`}
                      className="absolute inset-y-1 flex items-center justify-center overflow-hidden rounded-md text-[11px] font-semibold text-white"
                      style={{ left: `${(a / 365) * 100}%`, width: `${(Math.max(4, b - a) / 365) * 100}%`, background: R.color, opacity: 0.35 + 0.65 * (v.probPct / 100) }}
                    >
                      {v.probPct}%
                    </span>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
      <ul className="mt-3 grid gap-1 text-[13px] text-[var(--fg-2)]">
        {relevant.filter((v) => v.note).slice(0, 3).map((v, i) => {
          const R = RISK[v.risk];
          return (
            <li key={i} className="flex gap-2">
              <R.icon size={14} className="mt-0.5 shrink-0" style={{ color: R.color }} />
              <span>{v.note} <span className="text-[var(--fg-3)] tnum">({L("yillarning", "years")} {v.probPct}%)</span></span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[12px] text-[var(--fg-3)]">{L("Foiz: 20 yilning nechtasida shu xavf ekinning sezgir bosqichiga to'g'ri kelgani.", "Percent: share of the 20 years in which the risk hit the crop's sensitive stage.")}</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ SMAP anomaly + satellite salinity */

export function SoilNowCard({ data }: { data: AnalyzeResponse }) {
  const { L } = useL();
  const m = data.insights?.moistureAnomaly, s = data.insights?.salinityEstimate, src = data.insights?.salinitySource;
  if (!m && !(s && src === "satellite")) return null;
  const z = m ? Math.max(-2.5, Math.min(2.5, m.zScore)) : 0;
  return (
    <Card className="grid gap-4 sm:grid-cols-2">
      {m && (
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <b className="text-[15px]">{L("Tuproq namligi hozir", "Soil moisture now")}</b>
            <SourceBadge source="SMAP L4" />
          </div>
          <p className="text-[14px] text-[var(--fg-2)]">
            {m.level === "dry" ? L("Odatdagidan quruq", "Drier than normal") : m.level === "wet" ? L("Odatdagidan ho'l", "Wetter than normal") : L("Me'yorda", "Normal")} ·{" "}
            <span className="tnum">{num(m.valueM3M3, 3)} m³/m³</span> <span className="text-[var(--fg-3)] tnum">({L("me'yor", "normal")} {num(m.normalM3M3, 3)})</span>
          </p>
          <div className="relative mt-3 h-2 rounded-full" style={{ background: "linear-gradient(90deg, var(--level-high), var(--surface-3) 50%, var(--water))" }} role="img" aria-label={`z = ${m.zScore}`}>
            <i className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[var(--surface)] bg-[var(--fg)]" style={{ left: `${((z + 2.5) / 5) * 100}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[11.5px] text-[var(--fg-3)]">
            <span>{L("quruq", "dry")}</span>
            <span className="tnum">z = {m.zScore.toFixed(2)}</span>
            <span>{L("ho'l", "wet")}</span>
          </div>
        </div>
      )}
      {s && src === "satellite" && (
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <b className="text-[15px]">{L("Sho'rlanish: sun'iy yo'ldosh bahosi", "Salinity: satellite estimate")}</b>
            <span className="rounded-full bg-[var(--warn-bg)] px-2 py-0.5 text-[11.5px] font-semibold text-[var(--warn-fg)]">{L("ishonch past", "low confidence")}</span>
          </div>
          <p className="text-[14px] text-[var(--fg-2)]">
            {s.eceEstDsM != null && <b className="tnum">≈ {num(s.eceEstDsM, 1)} dS/m · </b>}
            {L("Laboratoriya natijasi bo'lsa, uni kiriting: tavsiya darhol aniqlashadi.", "If you have a lab result, enter it: the advice sharpens immediately.")}
          </p>
          {s.usedReason && <p className="mt-1 text-[12.5px] text-[var(--fg-2)]">{s.usedReason}</p>}
          {s.method && <p className="mt-1 text-[12px] text-[var(--fg-3)]">{s.method}</p>}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ rotation's effect on soil */

export function SoilEffects({ st }: { st: Strategy }) {
  const { L } = useL();
  const e = st.soilEffects;
  if (!e) return null;
  const items = [
    { icon: <Leaf size={14} />, k: L("Azot to'playdi", "Nitrogen fixed"), v: e.nFixKgHaPerYear ? `${num(e.nFixKgHaPerYear)} ${L("kg/ga/yil", "kg/ha/yr")}` : "-" },
    { icon: <Layers size={14} />, k: L("Tuproq qoplangan", "Soil covered"), v: `${num(e.coverDaysPerYear)} ${L("kun/yil", "days/yr")}` },
    { icon: <Sprout size={14} />, k: L("Eng chuqur ildiz", "Deepest root"), v: `${num(e.rootDepthMaxCm)} ${L("sm", "cm")}` },
    { icon: <Waves size={14} />, k: L("Organik qoldiq", "Crop residue"), v: `${num(e.residueTHa, 1)} ${L("t/ga", "t/ha")}` },
    { icon: <Timer size={14} />, k: L("Zararkunanda tanaffusi", "Pest-cycle break"), v: e.pestBreakYears ? `${e.pestBreakYears} ${L("yil", "yr")}` : L("yo'q", "none") },
  ];
  return (
    <div className="grid gap-2">
      <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {items.map((x) => (
          <div key={x.k} className="rounded-xl bg-[var(--surface)] px-2.5 py-2">
            <dt className="flex items-center gap-1 text-[11.5px] text-[var(--fg-3)]">{x.icon} {x.k}</dt>
            <dd className="text-[14.5px] font-semibold tnum">{x.v}</dd>
          </div>
        ))}
        {st.bare && (
          <div className="rounded-xl bg-[var(--surface)] px-2.5 py-2">
            <dt className="text-[11.5px] text-[var(--fg-3)]">{L("Dala bo'sh (aprel-oktabr)", "Field bare (Apr-Oct)")}</dt>
            <dd className="text-[14.5px] font-semibold tnum">{st.bare.daysPerYear} {L("kun/yil", "days/yr")}</dd>
          </div>
        )}
      </dl>
      <p className="text-[11.5px] text-[var(--fg-3)]">{L("Adabiyotdagi tipik qiymatlar, taxminiy.", "Typical literature values, approximate.")}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ A3: zones inside the field */

/** Okabe-Ito hues: distinguishable with colour-vision deficiency and on satellite imagery. */
const ZONE: Record<ZoneKind, { color: string; uz: string; en: string }> = {
  low_vigor: { color: "#F0E442", uz: "Sust o'sish", en: "Low vigour" },
  water_stress: { color: "#D55E00", uz: "Suv stressi", en: "Water stress" },
  salinity: { color: "#56B4E9", uz: "Sho'rlanish", en: "Salinity" },
  erosion: { color: "#CC79A7", uz: "Eroziya", en: "Erosion" },
};
const LEVEL_OPACITY = { high: 0.55, medium: 0.4, low: 0.18 } as const;

export function ZonesCard({ data }: { data: AnalyzeResponse }) {
  const { lang, L } = useL();
  const id = data.sourceId ?? data.fieldId;
  const [z, setZ] = useState<ZonesData | null | "loading" | "none">(data.backend === "fastapi" ? "loading" : "none");
  const [hidden, setHidden] = useState<Set<ZoneKind>>(new Set());
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    if (data.backend !== "fastapi" || !id?.startsWith("f-")) return;
    const ac = new AbortController();
    import("@/api/fastapi")
      .then(({ getZonesFastApi }) => getZonesFastApi(id, ac.signal, lang === "en" ? "en" : "uz"))
      .then((r) => setZ(r ?? "none"))
      .catch(() => !ac.signal.aborted && setZ("none"));
    return () => ac.abort();
  }, [id, data.backend, lang]);
  if (z === "none") return null;
  const feats = z === "loading" || !z ? [] : z.features;
  const kinds = (Object.keys(ZONE) as ZoneKind[]).filter((k) => feats.some((f) => f.properties.kind === k));
  const zones = feats
    .map((f, i) => ({ f, key: `${f.properties.kind}-${i}` }))
    .filter(({ f }) => !hidden.has(f.properties.kind))
    .map(({ f, key }) => ({
      key,
      geometry: f.geometry,
      color: ZONE[f.properties.kind].color,
      fillOpacity: key === pick ? 0.75 : LEVEL_OPACITY[f.properties.level],
      tip: `${lang === "en" ? ZONE[f.properties.kind].en : ZONE[f.properties.kind].uz} · ${num(f.properties.areaHa, 2)} ${L("ga", "ha")}`,
    }));
  const sel = pick ? feats[+pick.split("-").pop()!] : null;
  return (
    <Card className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="relative isolate h-[min(60dvh,520px)] min-h-[340px] overflow-hidden rounded-[18px]">
        <FieldMap value={data.field.polygon} basemap="sat" readOnly fitMaxZoom={18} zones={zones} onZoneClick={setPick} />
        {z === "loading" && (
          <div className="lg absolute top-3 left-3 z-[600] rounded-full px-3.5 py-2 text-[13px] font-medium" role="status">
            {L("Dala ichidagi zonalar hisoblanmoqda (birinchi marta 10-40 s)…", "Computing zones inside the field (first time 10-40 s)…")}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3 p-1">
        <div>
          <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{L("Dala ichidagi xavf zonalari", "Risk zones inside the field")}</h3>
          <p className="mt-1 text-[13.5px] text-[var(--fg-2)]">{L("Dalaning qaysi qismi doim orqada qolishi: 30 m piksellar bo'yicha, ko'p yillik ma'lumotdan.", "Which part of the field keeps lagging: per 30 m pixel, from multi-year data.")}</p>
        </div>
        {z !== "loading" && z && !feats.length && <p className="text-[14px] text-[var(--fg-2)]">{z.reason ?? L("Dala bir xil: ajralib turadigan zona topilmadi.", "The field is uniform: no zone stands out.")}</p>}
        <ul className="grid gap-1.5">
          {kinds.map((k) => {
            const fs = feats.filter((f) => f.properties.kind === k);
            const area = fs.reduce((a, f) => a + f.properties.areaHa, 0);
            const top = fs.reduce((a, f) => (["high", "medium", "low"].indexOf(f.properties.level) < ["high", "medium", "low"].indexOf(a) ? f.properties.level : a), "low" as "low" | "medium" | "high");
            const off = hidden.has(k);
            return (
              <li key={k}>
                <button
                  type="button"
                  aria-pressed={!off}
                  onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
                  className={clsx("press flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left transition-opacity", off ? "opacity-45" : "bg-[var(--surface-2)]")}
                >
                  <i className="h-3.5 w-3.5 shrink-0 rounded-[4px] ring-1 ring-black/10" style={{ background: ZONE[k].color }} />
                  <span className="min-w-0 flex-1">
                    <b className="block text-[14px]">{lang === "en" ? ZONE[k].en : ZONE[k].uz}</b>
                    <span className="text-[12px] text-[var(--fg-3)] tnum">{num(area, 2)} {L("ga", "ha")} · {L(top === "high" ? "kuchli" : top === "medium" ? "o'rta" : "kuchsiz", top)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {sel && (
          <div className="rounded-2xl bg-[var(--surface-2)] px-3 py-2.5 text-[13.5px]">
            <b className="block">{lang === "en" ? ZONE[sel.properties.kind].en : ZONE[sel.properties.kind].uz}</b>
            <span className="text-[var(--fg-2)]">{sel.properties.note}</span>
            <span className="mt-1 block text-[12px] text-[var(--fg-3)] tnum">
              {num(sel.properties.value, 2)} {L("vs dala o'rtachasi", "vs field mean")} {num(sel.properties.fieldMean, 2)} · {sel.properties.unit}
            </span>
          </div>
        )}
        {!sel && feats.length > 0 && <p className="text-[12.5px] text-[var(--fg-3)]">{L("Zonani bosing: sababi va nima qilish kerakligi chiqadi.", "Tap a zone to see why and what to do.")}</p>}
        {z && z !== "loading" && z.sources && <p className="mt-auto text-[11.5px] text-[var(--fg-3)]">{z.sources.join(" · ")}</p>}
      </div>
    </Card>
  );
}

