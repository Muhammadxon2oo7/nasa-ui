"use client";

import { AnimatePresence, m } from "motion/react";
import { ArrowRight, MapPinned, Plus, Sparkles, Trash2, Trophy } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { CompareGoal, CompareResponse } from "@/types/api";
import { analyzeField, ApiError, compareFields, saveAnalysis } from "@/api/client";
import { useRouter } from "next/navigation";
import type { AnalyzeRequest } from "@/types/api";
import { useProfile } from "@/store/platformStore";
import { useT, type Key } from "@/i18n";
import { analyzePolygon } from "@/lib/geo";
import type { MapApi } from "@/components/map/FieldMap";
import { Button, Card, CardTitle, DisclaimerBanner, ErrorState, ScoreBar, Segmented, Skeleton, spring } from "@/components/ui";

const FieldMap = dynamic(() => import("@/components/map/FieldMap"), { ssr: false, loading: () => <div className="shimmer h-full w-full bg-[var(--surface-2)]" /> });

const COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];
const HEX = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]; // = --s1..--s4 (Leaflet needs real colors)
const GOALS: CompareGoal[] = ["winter_wheat", "cotton", "alfalfa", "pasture", "general"];
const ROWS = ["suitability", "region", "salinity", "water", "pasture", "gaez", "frostFree", "slope", "heat", "history", "risk"];
const DEMO = ["sirdaryo", "jizzax", "fargona"];
const DEMO_NAME: Record<string, string> = { sirdaryo: "Sirdaryo", jizzax: "Jizzax", fargona: "Farg'ona" };
const LETTER = "ABCD";

type Place = { name: string; polygon: GeoJSON.Polygon };

export default function ComparePage() {
  const { t, lang } = useT();
  const [goal, setGoal] = useState<CompareGoal>("winter_wheat");
  const [places, setPlaces] = useState<Place[]>([]);
  const [draft, setDraft] = useState<GeoJSON.Polygon | null>(null);
  const [res, setRes] = useState<CompareResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "busy" | "error">("idle");
  const [err, setErr] = useState("");
  const api = useRef<MapApi | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const router = useRouter();
  const profile = useProfile((s) => s.profile);
  const [opening, setOpening] = useState<string | null>(null);

  /** Detailed result: demo pilots open instantly; others run /api/analyze (core inputs are already cached by compare). */
  const open = async (i: number, placeId: string) => {
    const demo = Object.keys(DEMO_NAME).find((k) => DEMO_NAME[k] === places[i]?.name);
    const mod = goal === "pasture" ? "?module=livestock" : "";
    if (demo) return router.push(`/result/demo-${demo}${mod}`);
    setOpening(placeId);
    const y = new Date().getFullYear();
    const req: AnalyzeRequest = { polygon: places[i].polygon, rotation: [y - 3, y - 2, y - 1].map((year) => ({ year, crop: null })), priorities: ["income", "water"], water: { availability: "medium", method: "furrow" }, lang, profile, modules: goal === "pasture" ? ["crop", "livestock"] : ["crop"] };
    try {
      const d = await analyzeField(req);
      saveAnalysis(d);
      try {
        localStorage.setItem(`fs:req:${d.fieldId}`, JSON.stringify(req));
      } catch {}
      router.push(`/result/${d.fieldId}${mod}`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.code : (e as Error).message);
      setStatus("error");
    } finally {
      setOpening(null);
    }
  };

  const draftCheck = draft ? analyzePolygon(draft) : null;
  const canAdd = !!draft && !draftCheck?.errors.length && places.length < 4;

  const add = () => {
    if (!draft || !canAdd) return;
    setPlaces((p) => [...p, { name: `${lang === "uz" ? "Joy" : "Place"} ${LETTER[p.length]}`, polygon: draft }]);
    setDraft(null);
    api.current?.clear();
    setRes(null);
  };
  const loadDemo = async () => {
    const reqs = await Promise.all(DEMO.map((n) => fetch(`/demo/${n}.req.json`).then((r) => r.json())));
    const ps: Place[] = reqs.map((r, i) => ({ name: DEMO_NAME[DEMO[i]], polygon: r.polygon }));
    setPlaces(ps);
    setRes(null);
    return ps;
  };
  const run = async (g = goal, ps = places) => {
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    setStatus("busy");
    setRes(null);
    try {
      setRes(await compareFields({ places: ps, goal: g, lang }, ctrl.current.signal));
      setStatus("idle");
    } catch (e) {
      // offline demo fallback (same 3 pilots, same goal)
      const demo = ps.length === 3 && ps.every((p, i) => p.name === DEMO_NAME[DEMO[i]]) ? await fetch(`/demo/compare-${g}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
      if (demo) {
        setRes(demo);
        setStatus("idle");
      } else {
        setErr(e instanceof ApiError ? e.code : (e as Error).message);
        setStatus("error");
      }
    }
  };

  // /compare?demo=1 → load the 3 pilots and compare right away (2.5-min demo scenario)
  useEffect(() => {
    if (new URLSearchParams(location.search).get("demo") !== "1") return;
    void (async () => {
      const ps = await loadDemo();
      await run(goal, ps);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const best = res?.places.find((p) => p.placeId === res.bestPlaceId);
  const shown = res?.places ?? [];
  const rows = ROWS.filter((r) => shown.some((p) => p.rows[r]));

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-3 px-3 pb-8 sm:px-6">
      <div className="pt-2">
        <h1 className="text-[clamp(26px,4vw,38px)] font-semibold tracking-[-0.03em]">📍 {t("cmp.title")}</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-[var(--fg-2)]">{t("cmp.sub")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-[var(--fg-3)]">{t("cmp.goal")}:</span>
        <div className="no-scrollbar max-w-full overflow-x-auto">
          <Segmented<CompareGoal>
            value={goal}
            onChange={(g) => {
              setGoal(g);
              if (res) run(g);
            }}
            options={GOALS.map((g) => ({ value: g, label: t(`goal.${g}` as Key) }))}
            ariaLabel="goal"
          />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-[24px] bg-[var(--surface)] shadow-[var(--shadow-card)]">
          <div className="relative h-[min(56vh,460px)]">
            <FieldMap value={draft} onChange={setDraft} basemap="sat" apiRef={api} extra={{ polygons: places.map((p, i) => ({ coords: p.polygon, label: `${LETTER[i]} · ${p.name}`, color: HEX[i] })) }} fitExtra />
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
              <div className="lg pointer-events-auto flex items-center gap-1.5 rounded-full p-1">
                <Button size="sm" variant="ghost" onClick={() => api.current?.startDraw()} disabled={places.length >= 4}>
                  <MapPinned size={15} /> {lang === "uz" ? "Chizish" : "Draw"}
                </Button>
                <Button size="sm" onClick={add} disabled={!canAdd}>
                  <Plus size={15} /> {t("cmp.add")}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Card className="flex flex-col gap-3">
          <CardTitle>{t("cmp.places", { n: places.length })}</CardTitle>
          {places.length === 0 && <p className="text-[14px] text-[var(--fg-3)]">{t("cmp.addHint")}</p>}
          {draftCheck?.errors[0] && <p className="text-[13px] text-[var(--level-high)]">{t(`err.${draftCheck.errors[0]}` as Key)}</p>}
          <ul className="flex flex-col gap-1.5">
            <AnimatePresence initial={false}>
              {places.map((p, i) => (
                <m.li key={p.name + i} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} transition={spring} className="flex items-center gap-2.5 rounded-2xl bg-[var(--surface-2)] px-3 py-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: COLORS[i] }}>
                    {LETTER[i]}
                  </span>
                  <input
                    value={p.name}
                    onChange={(e) => setPlaces((ps) => ps.map((q, j) => (j === i ? { ...q, name: e.target.value.slice(0, 40) } : q)))}
                    className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none"
                    aria-label="name"
                  />
                  <span className="shrink-0 text-[12.5px] text-[var(--fg-3)] tabular-nums">{analyzePolygon(p.polygon).areaHa.toFixed(1)} ga</span>
                  <button type="button" onClick={() => (setPlaces((ps) => ps.filter((_, j) => j !== i)), setRes(null))} className="press rounded-full p-1.5 text-[var(--fg-3)] hover:text-[var(--level-high)]" aria-label="remove">
                    <Trash2 size={15} />
                  </button>
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
          <div className="mt-auto flex flex-wrap gap-2">
            <Button onClick={() => run()} disabled={places.length < 2 || status === "busy"} className="flex-1">
              <Sparkles size={16} /> {places.length < 2 ? t("cmp.need") : t("cmp.run")}
            </Button>
            <Button variant="secondary" onClick={() => loadDemo()}>
              {t("cmp.demo")}
            </Button>
          </div>
        </Card>
      </div>

      {status === "busy" && (
        <Card className="flex flex-col gap-2">
          <p className="text-[14px] text-[var(--fg-2)]">{t("cmp.running")}</p>
          <Skeleton className="h-10" />
          <Skeleton className="h-40" />
        </Card>
      )}
      {status === "error" && <ErrorState message={err} onRetry={() => run()} />}

      <AnimatePresence>
        {res && best && (
          <m.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring} className="grid grid-cols-[minmax(0,1fr)] gap-3">
            <DisclaimerBanner />
            <Card className="flex flex-col gap-2 border-[color-mix(in_oklab,var(--accent)_30%,transparent)]">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-fill)] text-white">
                  <Trophy size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-[var(--fg-3)]">
                    {t("cmp.best")} · {t(`goal.${res.goal}` as Key)}
                  </p>
                  <p className="text-[22px] font-semibold tracking-[-0.02em]">{best.name}</p>
                </div>
                <span className="text-[30px] font-semibold tabular-nums">{best.suitability}</span>
              </div>
              <p className="text-[15px] leading-relaxed text-[var(--fg-2)]">
                <b className="text-[var(--fg)]">{t("cmp.why")}</b> {res.explanation.why}
              </p>
              {res.explanation.risks?.length ? <p className="text-[14px] text-[var(--fg-3)]">{res.explanation.risks.join(" · ")}</p> : null}
            </Card>

            {/* desktop table */}
            <Card className="hidden overflow-x-auto p-0 md:block">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-[var(--separator)]">
                    <th className="p-3 text-left font-medium text-[var(--fg-3)]" />
                    {shown.map((p, i) => (
                      <th key={p.placeId} className="p-3 text-left">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} />
                          <span className="font-semibold">{p.name}</span>
                          {p.placeId === res.bestPlaceId && <Trophy size={14} className="text-[var(--accent)]" />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r} className="border-b border-[var(--separator)] last:border-0">
                      <td className="p-3 whitespace-nowrap text-[var(--fg-2)]">{t(`row.${r}` as Key)}</td>
                      {shown.map((p) => {
                        const c = p.rows[r];
                        return (
                          <td key={p.placeId} className="p-3">
                            {r === "suitability" ? (
                              <div className="flex items-center gap-2">
                                <b className="tabular-nums">{p.suitability}</b>
                                <ScoreBar value={p.suitability} className="w-24" color={c?.better ? "var(--accent-fill)" : "var(--fg-3)"} />
                              </div>
                            ) : (
                              <span className={c?.better ? "rounded-lg bg-[color-mix(in_oklab,var(--level-low)_14%,transparent)] px-1.5 py-0.5 font-semibold text-[var(--fg)]" : "text-[var(--fg-2)]"}>{c?.value ?? "-"}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td />
                    {shown.map((p) => (
                      <td key={p.placeId} className="p-3">
                        <button type="button" onClick={() => open(shown.indexOf(p), p.placeId)} disabled={!!opening} className="press inline-flex items-center gap-1 text-[13.5px] font-semibold text-[var(--accent)] disabled:opacity-50">
                          {opening === p.placeId ? "…" : t("cmp.open")} <ArrowRight size={14} />
                        </button>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </Card>

            {/* mobile cards */}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:hidden">
              {shown.map((p, i) => (
                <Card key={p.placeId} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: COLORS[i] }}>
                      {LETTER[i]}
                    </span>
                    <b className="min-w-0 flex-1 truncate text-[16px]">{p.name}</b>
                    {p.placeId === res.bestPlaceId && <Trophy size={16} className="text-[var(--accent)]" />}
                    <b className="text-[20px] tabular-nums">{p.suitability}</b>
                  </div>
                  <ScoreBar value={p.suitability} />
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13.5px]">
                    {rows
                      .filter((r) => r !== "suitability")
                      .map((r) => (
                        <div key={r} className="contents">
                          <dt className="text-[var(--fg-3)]">{t(`row.${r}` as Key)}</dt>
                          <dd className={p.rows[r]?.better ? "font-semibold" : "text-[var(--fg-2)]"}>
                            {p.rows[r]?.value ?? "-"} {p.rows[r]?.better && "✓"}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  <button type="button" onClick={() => open(i, p.placeId)} disabled={!!opening} className="press inline-flex items-center gap-1 self-start text-[14px] font-semibold text-[var(--accent)] disabled:opacity-50">
                    {opening === p.placeId ? "…" : t("cmp.open")} <ArrowRight size={14} />
                  </button>
                </Card>
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
