import type { AnalyzeRequest, ClimateData, CropId, HistoryData, Level, RuleCheck, SoilData, Strategy } from "@/types/api";
import { CROPS, DOUBLE_CROPS } from "@/data/crops";
import { currentFromHistory, TEMPLATES, type Template, type YearSpec } from "@/data/templates";
import { initialWeights, scoreStrategy } from "@/lib/scoring";
import type { Wx } from "./climate";
import { gddWindow, toDoy } from "./climate";
import { waterForPlan } from "./water";
import { clamp, mean, median, round } from "./stats";

const PLAN_YEARS = [2026, 2027, 2028];
export const DEFAULT_LIMIT: Record<Level, number> = { low: 8000, medium: 11000, high: 14000 };

type Ctx = {
  w: Wx;
  et0: number[];
  et0Alt?: number[][];
  /** what-if: keep the water scale of the baseline run so extra water lowers the score */
  waterRef?: number;
  /** what-if: re-evaluate exactly these plans (by name) instead of re-selecting */
  keep?: string[];
  climate: ClimateData & { _frost: { lastSpring: number[]; firstAutumn: number[]; years: number[] }; _p90LastFrost: number };
  history: HistoryData;
  soil: SoilData;
  ece: number;
  req: AnalyzeRequest;
  lang: "uz" | "en";
  /** the 3 seasons that define the "current rotation" (default: last 3 full years; A6 backtest moves them back) */
  histYears?: [number, number, number];
};

const yieldPct = (crop: CropId, ece: number) => {
  const c = CROPS[crop];
  if (crop === "fallow") return 100;
  return clamp(100 - c.eceSlope * Math.max(0, ece - c.eceThreshold));
};

const nm = (crop: CropId, lang: "uz" | "en") => CROPS[crop].name[lang];

/** Plan name from its seasons, e.g. "Bug'doy + oq jo'xori → Paxta". */
export const planName = (years: YearSpec[], lang: "uz" | "en") =>
  years.map((y) => (y.length ? y.map((s) => nm(s.crop, lang)).join(" + ") : nm("fallow", lang))).join(" → ");

function evaluate(t: Template, ctx: Ctx, isCurrent: boolean) {
  const { w, et0, climate, ece, req, lang } = ctx;
  const L = (uz: string, en: string) => (lang === "uz" ? uz : en);
  const years = t.years;
  const all = years.flat();
  const rainfed = t.tag === "rainfed";
  const ecw = req.soil?.ecwDsM ?? 1.2;
  const water = waterForPlan(w, et0, years, ecw, rainfed, ctx.et0Alt);
  const limit = req.water.limitM3PerHa ?? DEFAULT_LIMIT[req.water.availability];
  const medFa = toDoy(climate.firstAutumnFrost.median);
  const histYears = climate._frost.years;
  const rules: RuleCheck[] = [];

  // R1 season fits frost-free period / GDD
  let r1: RuleCheck["status"] = "pass";
  let r1d = "";
  for (const s of all) {
    if (s.crop === "fallow") continue;
    const c = CROPS[s.crop];
    if (DOUBLE_CROPS.includes(s.crop) && s.start === "06-22") {
      const g = median(histYears.map((y, i) => gddWindow(w, toDoy(s.start), climate._frost.firstAutumn[i], c.tbase, y)[0] ?? 0));
      if (g < c.gddRequired * 0.9) { r1 = "fail"; r1d = L(`${nm(s.crop, lang)}: ${Math.round(g)} GDD bor, ${c.gddRequired} kerak`, `${nm(s.crop, lang)}: ${Math.round(g)} GDD available, ${c.gddRequired} needed`); }
      else if (g < c.gddRequired && r1 !== "fail") { r1 = "warn"; r1d = L(`${nm(s.crop, lang)}: issiqlik chegarada (${Math.round(g)} / ${c.gddRequired} GDD)`, `${nm(s.crop, lang)}: heat is borderline (${Math.round(g)} / ${c.gddRequired} GDD)`); }
    } else if (!s.prev && c.frostKillC >= -1 && toDoy(s.end) > medFa && r1 === "pass") {
      r1 = "warn";
      r1d = L(`${nm(s.crop, lang)} kuzgi sovuqqa yaqin tugaydi`, `${nm(s.crop, lang)} ends close to the first autumn frost`);
    }
  }
  const annualP = climate.monthly.reduce((a, m) => a + m.precipMm, 0);
  if (rainfed && annualP < 280) {
    r1 = "fail";
    r1d = L(`Lalmi ekin uchun yog'in kam: yiliga ${Math.round(annualP)} mm (kamida ~280 mm kerak)`, `Too dry for rainfed crops: ${Math.round(annualP)} mm/yr (needs ~280 mm)`);
  }
  rules.push({ id: "R1", label: L("Mavsumga sig'adi", "Fits the season"), status: r1, detail: r1d || undefined });

  // R2 salinity
  const worst = all.filter((s) => s.crop !== "fallow").reduce((a, s) => (CROPS[s.crop].eceThreshold < CROPS[a.crop].eceThreshold ? s : a), all[0] ?? { crop: "fallow" as CropId, start: "", end: "" });
  const thr = CROPS[worst.crop].eceThreshold;
  const r2: RuleCheck["status"] = ece > thr * 1.5 ? "fail" : ece > thr ? "warn" : "pass";
  rules.push({ id: "R2", label: L("Sho'rga mos", "Salinity fit"), status: r2, detail: r2 !== "pass" ? L(`${nm(worst.crop, lang)}: chegara ${thr} dS/m, dalada ≈${ece} dS/m`, `${nm(worst.crop, lang)}: threshold ${thr} dS/m, field ≈${ece} dS/m`) : undefined });

  // R3 water limit
  const over = water.grossM3PerHa - limit;
  rules.push({ id: "R3", label: L("Suv limiti", "Water limit"), status: over > 0 ? "warn" : over > -500 ? "warn" : "pass", detail: over > 0 ? L(`Limitdan ${over.toLocaleString("ru-RU")} m³/ga oshadi`, `Exceeds the limit by ${over.toLocaleString("en-US")} m³/ha`) : over > -500 ? L(`Limitga ${(-over).toLocaleString("ru-RU")} m³/ga qoldi`, `${(-over).toLocaleString("en-US")} m³/ha below the limit`) : undefined });

  // R4 rotation break (cotton > 3 years in a row incl. history; same family back to back)
  const histMain = ctx.history.seasons.slice(-3).map((s) => s.crops[0]?.crop);
  const seq = [...histMain, ...years.map((y) => y[0]?.crop ?? "fallow")];
  let run = 0, maxRun = 0;
  for (const c of seq) {
    run = c === "cotton" ? run + 1 : 0;
    maxRun = Math.max(maxRun, run);
  }
  let famRepeat = 0;
  for (let i = 1; i < all.length; i++) if (CROPS[all[i].crop].family === CROPS[all[i - 1].crop].family && all[i].crop !== "cotton" && all[i].crop !== "alfalfa") famRepeat++;
  rules.push({ id: "R4", label: L("Rotatsiya tanaffusi", "Rotation break"), status: maxRun > 3 ? "warn" : famRepeat > 1 ? "warn" : "pass", detail: maxRun > 3 ? L(`Paxta ${maxRun} yil ketma-ket: vertitsillyoz xavfi`, `Cotton ${maxRun} years in a row: Verticillium wilt risk`) : famRepeat > 1 ? L("Bir oiladagi ekinlar ketma-ket", "Same crop family back to back") : undefined });

  // R5 previous-crop effect (legume → cereal)
  let r5 = 0;
  for (let i = 1; i < all.length; i++) if (CROPS[all[i - 1].crop].nFixing && CROPS[all[i].crop].family === "poaceae") r5++;
  if (r5) rules.push({ id: "R5", label: L("Dukkaklidan keyin azot bonusi", "Nitrogen bonus after a legume"), status: "pass" });

  // R6 sowing after the last spring frost (90th percentile)
  const early = all.find((s) => !s.prev && CROPS[s.crop].frostKillC >= -2 && toDoy(s.start) < climate._p90LastFrost);
  rules.push({ id: "R6", label: L("Ekish oynasi", "Sowing window"), status: early ? "warn" : "pass", detail: early ? L(`${nm(early.crop, lang)} ekish sanasi kechki sovuq xavfi bor kunga to'g'ri keladi`, `${nm(early.crop, lang)} sowing date can still meet a late frost`) : undefined });

  // R7 shorter bare period after the cereal harvest
  const doubles = years.filter((y) => y.length > 1).length;
  const cerealOnly = years.filter((y) => y.length === 1 && y[0].prev).length;
  rules.push({ id: "R7", label: L("Bo'sh davr qisqaradi", "Shorter bare period"), status: doubles ? "pass" : cerealOnly ? "warn" : "pass", detail: cerealOnly && !doubles ? L("Bug'doydan keyin dala yozda bo'sh qoladi", "The field stays bare in summer after wheat") : undefined });

  // ---- metrics (0-100)
  const income = clamp((years.reduce((s, y) => s + y.reduce((a, x) => a + (CROPS[x.crop].market * yieldPct(x.crop, ece)) / 100, 0), 0) / years.length / 7) * 100);
  const legumes = all.filter((s) => CROPS[s.crop].nFixing && s.crop !== "alfalfa").length;
  const alfalfaYears = years.filter((y) => y.some((s) => s.crop === "alfalfa")).length;
  const bareYears = years.filter((y) => y.length === 0).length;
  const soilM = clamp(42 + 10 * legumes + 14 * alfalfaYears + 7 * doubles - 12 * Math.max(0, maxRun - 2) - 10 * bareYears - 4 * cerealOnly + (r5 ? 5 : 0));
  const salinity = round(Math.min(...all.filter((s) => s.crop !== "fallow").map((s) => yieldPct(s.crop, ece)), 100));
  const heat = mean(climate.heatDays40.slice(-10).map((h) => h.days));
  const heatSens = all.filter((s) => CROPS[s.crop].heatSensitive && !s.prev && toDoy(s.start) < 200 && toDoy(s.end) > 170).length;
  const frostRisk = early ? 10 : 0;
  const dryShare = (climate.spi3 ?? []).slice(-60).filter((s) => s.value < -1).length / 60;
  const climateRisk = clamp(100 - heatSens * Math.min(25, heat * 1.2) - frostRisk - (rainfed ? dryShare * 120 : dryShare * 30) - (r1 === "warn" ? 10 : 0));
  const labor = clamp(100 - mean(all.filter((s) => s.crop !== "fallow").map((s) => CROPS[s.crop].labor)) * 18);

  const seasons: Strategy["seasons"] = [];
  years.forEach((y, k) =>
    y.forEach((s) => {
      const yr = PLAN_YEARS[k];
      seasons.push({ year: yr, crop: s.crop, start: `${s.prev ? yr - 1 : yr}-${s.start}`, end: `${yr}-${s.end}` });
    }),
  );
  const sowWindow = [...new Map(all.filter((s) => s.crop !== "fallow").map((s) => [s.crop, s])).values()].map((s) => {
    const d = toDoy(s.start);
    const f = new Date(Date.UTC(2021, 0, d - 7)), to = new Date(Date.UTC(2021, 0, d + 10));
    const md = (x: Date) => `${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
    return { crop: s.crop, from: md(f), to: md(to) };
  });

  return {
    t,
    isCurrent,
    years,
    water,
    limit,
    rules,
    hardFails: rules.filter((r) => r.status === "fail").length,
    warns: rules.filter((r) => r.status === "warn").length,
    metrics: { water: 0, income: round(income), soil: round(soilM), salinity, climateRisk: round(climateRisk), labor: round(labor) },
    seasons,
    sowWindow,
    saltFit: (r2 === "pass" ? "ok" : r2 === "warn" ? "warn" : "bad") as Strategy["saltFit"],
    facts: { doubles, legumes, alfalfaYears, maxRun, heat, heatSens, r5, worstCrop: worst.crop, thr },
  };
}

export type Evaluated = ReturnType<typeof evaluate>;

export function buildStrategies(ctx: Ctx) {
  const { req, history, lang } = ctx;
  // current rotation = farmer's answers, else last 3 detected seasons
  const hist = (ctx.histYears ?? [2023, 2024, 2025]).map((y) => {
    const u = req.rotation.find((r) => r.year === y && r.crop);
    if (u) return { crop: u.crop as CropId, second: u.secondCrop ?? null };
    const s = history.seasons.find((x) => x.year === y);
    const main = s?.crops[0]?.crop ?? "cotton";
    const sec = s?.crops[1]?.crop;
    return { crop: main === "other" ? "cotton" : main, second: sec && sec !== "other" ? sec : sec === "other" ? ("mung_bean" as CropId) : null };
  });
  const cur = currentFromHistory(hist);
  const evals = [evaluate(cur, ctx, true), ...TEMPLATES.map((t) => evaluate(t, ctx, false))];
  const maxGross = ctx.waterRef ?? Math.max(...evals.map((e) => e.water.grossM3PerHa), 1);
  for (const e of evals) {
    e.metrics.water = round(clamp(100 * (1 - e.water.grossM3PerHa / (maxGross * 1.15))));
    // over the farmer's water limit → the plan is less safe to run (also visible as rule R3)
    const over = e.water.grossM3PerHa - e.limit;
    if (over > 0) e.metrics.climateRisk = round(clamp(e.metrics.climateRisk - Math.min(30, (over / e.limit) * 60)));
  }
  const weights = initialWeights(req.priorities);
  const scoreOf = (e: Evaluated) => scoreStrategy(e.metrics, weights);

  const current = evals[0];
  const candidates = evals.slice(1).filter((e) => planName(e.years, "en") !== planName(current.years, "en"));
  if (ctx.keep?.length) {
    const fixed = ctx.keep.slice(1).map((n) => candidates.find((e) => planName(e.years, ctx.lang) === n)).filter((e): e is Evaluated => !!e);
    if (fixed.length === ctx.keep.length - 1) return finish([current, ...fixed], false);
  }
  const ok = candidates.filter((e) => e.hardFails === 0).sort((a, b) => scoreOf(b) - scoreOf(a) || a.warns - b.warns);
  let picked = ok.slice(0, 3);
  let nearest = false;
  if (picked.length < 3) {
    // R8: nothing satisfies everything → fill with the least-violating options
    const rest = candidates.filter((e) => e.hardFails > 0).sort((a, b) => a.hardFails - b.hardFails || scoreOf(b) - scoreOf(a));
    nearest = picked.length === 0;
    picked = [...picked, ...rest.slice(0, 3 - picked.length)];
  }
  return finish([current, ...picked], nearest);

  function finish(chosen: Evaluated[], nearest: boolean) {
  const ids = ["A", "B", "C", "D"];
  const strategies: Strategy[] = chosen.map((e, i) => ({
    id: ids[i],
    name: planName(e.years, lang),
    isCurrent: e.isCurrent,
    isNearest: !e.isCurrent && (nearest || e.hardFails > 0) ? true : undefined,
    seasons: e.seasons,
    sowWindow: e.sowWindow,
    metrics: e.metrics,
    score: scoreOf(e),
    waterM3PerHa: e.water.grossM3PerHa,
    saltFit: e.saltFit,
    rules: e.rules,
    explanation: explain(e, current, ctx),
  }));
  return { strategies, chosen, weights, maxGross };
  }
}

/* ------------------------------------------------------------------ template explanations */

function explain(e: Evaluated, cur: Evaluated, ctx: Ctx): Strategy["explanation"] {
  const { lang, climate, soil, history } = ctx;
  const L = (uz: string, en: string) => (lang === "uz" ? uz : en);
  const fmt = (n: number) => n.toLocaleString(lang === "uz" ? "ru-RU" : "en-US");
  const f = e.facts;
  const lastBare = history.bareWindows.slice(-6);
  const bareYears = new Set(lastBare.map((b) => b.start.slice(0, 4))).size;
  const yrsSeen = history.seasons.length;
  const dWater = e.water.grossM3PerHa - cur.water.grossM3PerHa;

  const why: string[] = [];
  if (e.isCurrent) why.push(L("Bu sizning hozirgi rotatsiyangiz. Boshqa variantlar shu bilan solishtiriladi.", "This is your current rotation; the other options are compared against it."));
  else {
    if (f.doubles) why.push(L(`Bug'doy o'rimidan birinchi kuzgi sovuqqacha issiqlik yig'indisi ≈${fmt(climate.gddAfterWheat)} GDD. Bu takroriy ekin uchun yetarli, shuning uchun yozgi bo'sh davr ishlatiladi.`, `About ${fmt(climate.gddAfterWheat)} GDD accumulate between the wheat harvest and the first autumn frost, which is enough for a second crop, so the summer bare period gets used.`));
    if (f.legumes || f.alfalfaYears) why.push(L("Dukkakli ekin (mosh, soya, no'xat yoki beda) tuproqqa azot to'playdi va paxta-bug'doy kasallik siklini uzadi.", "A legume (mung bean, soybean, chickpea or alfalfa) adds nitrogen and breaks the cotton-wheat disease cycle."));
    if (e.t.tag === "salt") why.push(L(`Sho'rga chidamli ekinlar tanlangan: dalada sho'rlanish ${lvl(soil.salinityLevel, lang)}.`, `Salt-tolerant crops were chosen: field salinity is ${lvl(soil.salinityLevel, lang)}.`));
    if (dWater < -300) why.push(L(`Hozirgi rotatsiyadan yiliga ≈${fmt(-dWater)} m³/ga kam suv talab qiladi.`, `Needs about ${fmt(-dWater)} m³/ha less water per year than the current rotation.`));
    if (e.t.tag === "rainfed") why.push(L("Sug'orishsiz (lalmi) yer uchun qurg'oqchilikka chidamli ketma-ketlik.", "A drought-tolerant sequence for rainfed land."));
    if (!why.length) why.push(L("Sizning ustuvorliklaringiz bo'yicha umumiy ball yuqori.", "Scores high on your priorities overall."));
  }

  const evidence: Strategy["explanation"]["evidence"] = [
    { text: L(`Sovuqsiz davr: ${climate.frostFreeDays} kun (median)`, `Frost-free period: ${climate.frostFreeDays} days (median)`), source: "NASA POWER 2005-2025" },
    { text: L(`Yillik suv talabi: ${fmt(e.water.grossM3PerHa)} m³/ga (oraliq ${fmt(e.water.lowM3PerHa)}-${fmt(e.water.highM3PerHa)})`, `Annual water need: ${fmt(e.water.grossM3PerHa)} m³/ha (range ${fmt(e.water.lowM3PerHa)}-${fmt(e.water.highM3PerHa)})`), source: "FAO-56 · NASA POWER" },
  ];
  if (f.doubles) evidence.push({ text: L(`Bug'doydan keyingi issiqlik: ${fmt(climate.gddAfterWheat)} GDD`, `Heat after wheat: ${fmt(climate.gddAfterWheat)} GDD`), source: "NASA POWER 2005-2025" });
  if (bareYears) evidence.push({ text: L(`Dala yozda bo'sh turgan yillar: ${bareYears} / ${yrsSeen}`, `Summers the field stood bare: ${bareYears} of ${yrsSeen}`), source: "Sentinel-2 NDVI 2017-2025" });
  evidence.push({ text: L(`Sho'rlanish darajasi: ${lvl(soil.salinityLevel, lang)}${soil.salinityTrendPct != null ? ` (trend ${soil.salinityTrendPct > 0 ? "+" : ""}${soil.salinityTrendPct}%)` : ""}`, `Salinity level: ${lvl(soil.salinityLevel, lang)}${soil.salinityTrendPct != null ? ` (trend ${soil.salinityTrendPct > 0 ? "+" : ""}${soil.salinityTrendPct}%)` : ""}`), source: soil.isEstimated ? "Sentinel-2 SI" : L("Fermer tahlili", "Farmer's lab test") });
  if (f.heatSens) evidence.push({ text: L(`40°C+ kunlar: o'rtacha ${round(f.heat, 0)} kun/yil (oxirgi 10 yil)`, `40°C+ days: ${round(f.heat, 0)} per year on average (last 10 years)`), source: "NASA POWER" });

  const benefits: string[] = [];
  if (!e.isCurrent) {
    if (e.metrics.soil > cur.metrics.soil + 4) benefits.push(L("Tuproq unumdorligi yaxshilanadi", "Better soil health"));
    if (e.metrics.water > cur.metrics.water + 4) benefits.push(L("Suv tejaladi", "Saves water"));
    if (e.metrics.income > cur.metrics.income + 4) benefits.push(L("Daromad indeksi yuqoriroq", "Higher income index"));
    if (e.metrics.salinity > cur.metrics.salinity + 4) benefits.push(L("Sho'rga chidamliroq", "More salt-tolerant"));
    if (f.doubles) benefits.push(L("Bir yilda ikki hosil, dala bo'sh turmaydi", "Two harvests a year, no bare summer"));
    if (f.r5) benefits.push(L("Keyingi g'alla uchun azot", "Nitrogen for the next cereal"));
  } else benefits.push(L("Tanish texnologiya va bozor", "Familiar practice and market"));
  if (!benefits.length) benefits.push(L("Hozirgi rotatsiyaga yaqin, o'tish oson", "Close to the current rotation, easy to adopt"));

  const gaps: string[] = [];
  if (soil.isEstimated) gaps.push(L("Tuproq sho'rligi (ECe) laboratoriyada o'lchanmagan: sun'iy yo'ldosh taxmini", "Soil salinity (ECe) not lab-measured: satellite estimate only"));
  gaps.push(L("Ekin narxlari ekspert bahosi (bozor ma'lumoti ulanmagan)", "Crop prices are expert estimates (no market feed yet)"));
  if (history.seasons.some((s) => s.crops.some((c) => c.source === "rules"))) gaps.push(L("Dala tarixi NDVI qoidalari bilan aniqlangan (AI modeli M1 hali o'qitilmagan)", "Field history comes from NDVI rules (the M1 AI model is not trained yet)"));

  const risks = e.rules.filter((r) => r.status !== "pass" && r.detail).map((r) => r.detail as string);
  if (f.heatSens && f.heat > 8) risks.push(L("Yozgi jazirama gullash davriga to'g'ri kelishi mumkin", "Summer heat may hit flowering"));
  if (f.doubles) risks.push(L("Takroriy ekin uchun iyul suv limitini suv uyushmasi bilan aniqlang", "Confirm the July water quota for the second crop with your water users' association"));
  if (!risks.length) risks.push(L("Katta xavf topilmadi. Baribir agronom bilan maslahatlashing", "No major risk found. Still check with an agronomist"));

  return { why: why.join(" "), evidence, benefits, gaps, risks, generatedBy: "template" };
}

export const lvl = (l: Level, lang: "uz" | "en") => (lang === "uz" ? { low: "past", medium: "o'rta", high: "yuqori" }[l] : { low: "low", medium: "medium", high: "high" }[l]);
