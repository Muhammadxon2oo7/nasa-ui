import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ActualWaterData, CalendarData, CalendarEvent, CropId, GaezData, Level, SoilTempSowing, Strategy, WaterSupplyData } from "@/types/api";
import { CROPS } from "@/data/crops";
import type { YearSpec } from "@/data/templates";
import type { Forecast16, S2Month, SoilTemp } from "../sources";
import type { Wx } from "./climate";
import { toDoy } from "./climate";
import { mean, median, quantile, round } from "./stats";
import { yearNeed } from "./water";

type L = (uz: string, en: string) => string;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const DAY = 864e5;
const MONTHS_UZ = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* ------------------------------------------------------------------ N2: soil temperature → sowing */

/** Minimum 0–7 cm soil temperature for sowing (°C). 🔎 agronomy handbooks, PRO_REJA T12 — starting values. */
export const SOIL_TEMP_MIN: Partial<Record<CropId, number>> = { cotton: 12, maize: 10, sorghum: 15, sunflower: 8, mung_bean: 15, rice: 13, soybean: 10, sugar_beet: 6, safflower: 5, chickpea: 7 };

function sowingBySoilTemp(st: SoilTemp, crop: CropId, thr: number, p90LastFrostDoy: number, fc: Forecast16 | null, now: Date): SoilTempSowing | null {
  const byYear = new Map<number, { doy: number; t: number }[]>();
  st.dates.forEach((d, i) => {
    const y = +d.slice(0, 4);
    const doy = toDoy(d.slice(5, 10));
    if (doy < 60 || doy > 180 || !Number.isFinite(st.t[i])) return;
    byYear.set(y, [...(byYear.get(y) ?? []), { doy, t: st.t[i] }]);
  });
  const firsts: number[] = [];
  for (const days of byYear.values()) {
    for (let i = 4; i < days.length; i++) {
      const m5 = mean(days.slice(i - 4, i + 1).map((x) => x.t));
      if (m5 >= thr) {
        firsts.push(days[i].doy);
        break;
      }
    }
  }
  if (firsts.length < 8) return null;
  const typical = Math.round(median(firsts));
  const from = Math.max(typical, p90LastFrostDoy + 3);
  let forecastReachInDays: number | null = null;
  // only meaningful in the sowing season (Feb–May): in autumn the soil is still warm from summer
  const m = now.getUTCMonth() + 1;
  if (fc?.length && m >= 2 && m <= 5) {
    const t = fc.map((d) => d.soilT);
    for (let i = 4; i < t.length; i++) if (mean(t.slice(i - 4, i + 1)) >= thr) { forecastReachInDays = i; break; }
  }
  return { crop, thresholdC: thr, typicalDate: md(typical), windowFrom: md(from), windowTo: md(from + 10), forecastReachInDays, source: "ERA5-Land" };
}
const md = (doy: number) => new Date(Date.UTC(2021, 0, doy)).toISOString().slice(5, 10);

/* ------------------------------------------------------------------ N8: frozen soil by dekad (Nov–Mar) */

function frozenByDekad(st: SoilTemp) {
  const acc = new Map<string, { f: number; n: number }>();
  st.dates.forEach((d, i) => {
    const m = +d.slice(5, 7), day = +d.slice(8, 10);
    if (!(m >= 11 || m <= 3) || !Number.isFinite(st.t[i])) return;
    const k = `${m}-${day <= 10 ? 1 : day <= 20 ? 2 : 3}`;
    const o = acc.get(k) ?? { f: 0, n: 0 };
    o.n++;
    if (st.t[i] < 0) o.f++;
    acc.set(k, o);
  });
  const order = ["11-1", "11-2", "11-3", "12-1", "12-2", "12-3", "1-1", "1-2", "1-3", "2-1", "2-2", "2-3", "3-1", "3-2", "3-3"];
  return order.filter((k) => acc.has(k)).map((k) => ({ dekad: k, pct: Math.round((acc.get(k)!.f / acc.get(k)!.n) * 100) }));
}
const dekadStart = (k: string, from: Date) => {
  const [m, d] = k.split("-").map(Number);
  let y = from.getUTCFullYear();
  if (m < from.getUTCMonth() + 1 && from.getUTCMonth() + 1 >= 10) y++;
  return Date.UTC(y, m - 1, d === 1 ? 1 : d === 2 ? 11 : 21);
};

/* ------------------------------------------------------------------ B1: calendar + leaching */

export function calendarOf(o: {
  now: Date;
  best: Strategy;
  bestYears: YearSpec[];
  ece: number;
  eciSource: "satellite" | "lab";
  salinity: Level;
  schedule?: { month: number; times: number; m3PerHa: number }[];
  st: SoilTemp | null;
  fc: Forecast16 | null;
  p90LastFrostDoy: number;
  livestock: boolean;
  L: L;
  lang: "uz" | "en";
}): CalendarData {
  const { now, L, lang } = o;
  const MON = lang === "uz" ? MONTHS_UZ : MONTHS_EN;
  const today = iso(now.getTime());
  const in90 = now.getTime() + 90 * DAY;
  const ev: CalendarEvent[] = [];
  const week: CalendarEvent[] = [];
  const nm = (c: CropId) => CROPS[c].name[lang];

  // --- this week from the 16-day forecast
  if (o.fc) {
    for (const d of o.fc.slice(0, 7)) {
      const dt = new Date(`${d.date}T00:00:00Z`);
      const dd = `${dt.getUTCDate()}-${MON[dt.getUTCMonth()]}`;
      if (d.tmin <= -3) week.push({ id: `frost-${d.date}`, date: d.date, type: "weather", severity: "high", title: L(`❄️ ${dd} kechasi ${round(d.tmin, 0)}°C kutilmoqda`, `❄️ ${round(d.tmin, 0)}°C expected on the night of ${dd}`), detail: L("Ko'chat va suv quvurlarini himoya qiling, sug'orishni kechiktiring", "Protect seedlings and pipes, postpone irrigation"), source: "Open-Meteo" });
      else if (d.tmin < 0) week.push({ id: `frost-${d.date}`, date: d.date, type: "weather", severity: "medium", title: L(`❄️ ${dd} kechasi ${round(d.tmin, 0)}°C`, `❄️ ${round(d.tmin, 0)}°C on the night of ${dd}`), source: "Open-Meteo" });
      if (d.tmax >= 40) week.push({ id: `heat-${d.date}`, date: d.date, type: "weather", severity: "high", title: L(`🔥 ${dd}: ${round(d.tmax, 0)}°C jazirama`, `🔥 ${dd}: ${round(d.tmax, 0)}°C heat`), detail: L("Kechqurun sug'oring, chorvani soyada saqlang", "Irrigate in the evening, keep animals in shade"), source: "Open-Meteo" });
      if (d.precip >= 15) week.push({ id: `rain-${d.date}`, date: d.date, type: "weather", severity: "medium", title: L(`🌧️ ${dd}: ${round(d.precip, 0)} mm yog'in`, `🌧️ ${dd}: ${round(d.precip, 0)} mm rain`), detail: L("Sug'orishni qoldiring", "Skip irrigation"), source: "Open-Meteo" });
    }
  }

  // --- leaching (FAO-29 / Hoffman: Dlw = k · Ds · ECi / ECf)
  const firstYear = o.bestYears[0] ?? [];
  const nextCrop = (firstYear.find((s) => s.crop !== "fallow")?.crop ?? o.best.seasons[0]?.crop ?? "cotton") as CropId;
  const ecf = Math.min(...firstYear.filter((s) => s.crop !== "fallow").map((s) => CROPS[s.crop].eceThreshold), CROPS[nextCrop].eceThreshold);
  const occupied = firstYear.some((s) => s.crop !== "fallow" && (s.prev || +s.start.slice(0, 2) >= 9));
  const frozen = o.st ? frozenByDekad(o.st) : [];
  let leaching: CalendarData["leaching"];
  {
    const Ds = 0.6;
    const kI = 0.1, kC = 0.3;
    const eci = o.ece;
    const need = eci > ecf;
    const lo = o.eciSource === "lab" ? 1 : 0.75, hi = o.eciSource === "lab" ? 1 : 1.25;
    const vol = (k: number, e: number) => Math.round((k * Ds * (e / ecf) * 10000) / 100) * 100;
    const total = vol(kI, eci);
    let recommended = need && !occupied;
    let reason = !need
      ? L(`Sho'rlik (${eci} dS/m) keyingi ekin chegarasidan (${ecf} dS/m) past: yuvish shart emas`, `Salinity (${eci} dS/m) is below the next crop's threshold (${ecf} dS/m): no leaching needed`)
      : occupied
        ? L(`Dalada kuzgi ekin bor: yuvish bahorgi ekin oldidan, ekin yig'ilgandan keyin qilinadi`, `A winter crop occupies the field: leach after harvest, before the next spring crop`)
        : L(`Sho'rlik ~${eci} dS/m, ${nm(nextCrop)} uchun chegara ${ecf} dS/m: qishki yuvish tavsiya etiladi`, `Salinity ~${eci} dS/m vs ${ecf} dS/m threshold for ${nm(nextCrop)}: winter leaching advised`);
    const stages: { date: string; m3PerHa: number }[] = [];
    if (recommended) {
      const n = total > 2000 ? 3 : 2;
      // dekads with the lowest frozen-soil probability, after today, before 10 March
      const cand = frozen
        .map((f) => ({ ...f, t: dekadStart(f.dekad, now) }))
        .filter((f) => f.t > now.getTime() + 5 * DAY && f.t < dekadStart("3-2", now))
        .sort((a, b) => a.t - b.t);
      let pick: typeof cand = [];
      for (let i = 0; i + (n - 1) < cand.length; i++) {
        const run = cand.slice(i, i + n);
        const worst = Math.max(...run.map((r) => r.pct));
        if (!pick.length || worst < Math.max(...pick.map((r) => r.pct))) pick = run;
      }
      if (!pick.length) {
        recommended = false;
        reason = L("Yuvish mavsumi o'tib ketgan yoki tuproq harorati ma'lumoti yo'q", "Leaching season has passed or no soil temperature data");
      }
      for (const p of pick) stages.push({ date: iso(p.t + 2 * DAY), m3PerHa: Math.round(total / n / 100) * 100 });
    }
    const warnings = [L("Drenaj (zovur) ishlamasa yuvish foyda bermaydi va sizot suvini ko'taradi", "Without working drainage, leaching does not help and raises the groundwater")];
    if (o.eciSource === "satellite") warnings.push(L("Sho'rlik sun'iy yo'ldosh bahosi: hajm oraliq bilan berilgan. Laboratoriya tahlili tavsiya etiladi", "Salinity is a satellite estimate: volume shown as a range. A lab test is recommended"));
    leaching = {
      recommended,
      reason,
      stages,
      totalLowM3PerHa: vol(kI, eci * lo),
      totalHighM3PerHa: vol(kI, eci * hi),
      continuousM3PerHa: vol(kC, eci),
      method: "intermittent",
      inputs: { eci, ecf, depthM: Ds, k: kI, eciSource: o.eciSource, nextCrop },
      warnings,
      frozenRisk: frozen,
    };
    stages.forEach((s, i) =>
      ev.push({ id: `leach-${i}`, date: s.date, endDate: iso(new Date(s.date).getTime() + 3 * DAY), type: "leach", m3PerHa: s.m3PerHa, title: L(`🧂 Sho'r yuvish: ${i + 1}-bosqich (~${s.m3PerHa.toLocaleString("ru-RU")} m³/ga)`, `🧂 Leaching, stage ${i + 1} (~${s.m3PerHa.toLocaleString("en-US")} m³/ha)`), detail: i === 0 ? L("Ariq va zovurlarni oldindan tozalang", "Clean canals and drains beforehand") : L("Oldingi bosqichdan ~10 kun keyin", "~10 days after the previous stage"), source: "FAO-29 · ERA5-Land" }),
    );
    if (recommended && stages.length && new Date(stages[0].date).getTime() - now.getTime() < 21 * DAY)
      week.push({ id: "leach-prep", date: today, type: "leach", severity: "medium", title: L("🧂 Sho'r yuvishga tayyorlaning: ariqlar va zovurlarni tozalang", "🧂 Prepare for leaching: clean canals and drains"), source: "FAO-29" });
  }
  // soil sample in winter when salinity is only a satellite estimate
  if (o.eciSource === "satellite" && o.salinity !== "low") {
    const t = Date.UTC(now.getUTCMonth() >= 1 && now.getUTCMonth() < 10 ? now.getUTCFullYear() : now.getUTCFullYear() + (now.getUTCMonth() >= 10 ? 1 : 0), 0, 15);
    ev.push({ id: "sample", date: iso(t), type: "soil_sample", title: L("🔍 Tuproq namunasini oling (0–30 va 30–60 sm)", "🔍 Take a soil sample (0–30 and 30–60 cm)"), detail: L("Laboratoriyada ECe o'lchansa, tavsiyalar aniqroq bo'ladi", "A lab ECe makes the advice more precise"), source: "FAO-29" });
  }

  // --- plan events for the next 12 months (sowing, irrigation, harvest)
  const yr = now.getUTCFullYear();
  const at = (mmdd: string, y: number) => Date.UTC(y, +mmdd.slice(0, 2) - 1, +mmdd.slice(3, 5));
  const nextAt = (mmdd: string) => (at(mmdd, yr) >= now.getTime() - 10 * DAY ? at(mmdd, yr) : at(mmdd, yr + 1));
  const sow = new Set<string>();
  for (const yspec of o.bestYears.slice(0, 2))
    for (const s of yspec) {
      if (s.crop === "fallow" || sow.has(s.crop + s.start)) continue;
      sow.add(s.crop + s.start);
      const w = o.best.sowWindow?.find((x) => x.crop === s.crop);
      const t = nextAt(w?.from ?? s.start);
      ev.push({ id: `sow-${s.crop}-${s.start}`, date: iso(t), endDate: w ? iso(nextAt(w.to)) : undefined, type: "sow", title: L(`🌱 ${nm(s.crop)} ekish`, `🌱 Sow ${nm(s.crop)}`), source: "PRO_REJA R6 · NASA POWER" });
      ev.push({ id: `harv-${s.crop}-${s.end}`, date: iso(nextAt(s.end)), type: "harvest", title: L(`🌾 ${nm(s.crop)} o'rimi (taxminan)`, `🌾 ${nm(s.crop)} harvest (approx.)`), source: "GDD · NASA POWER" });
      if (s.crop === "winter_wheat" || s.crop === "barley") ev.push({ id: `feed-${s.crop}`, date: iso(nextAt("02-25")), endDate: iso(nextAt("03-15")), type: "feed", title: L(`🌾 ${nm(s.crop)}ga erta bahorgi ozuqa (azot)`, `🌾 Early-spring nitrogen for ${nm(s.crop)}`), source: L("Agronomiya amaliyoti", "Agronomic practice") });
    }
  for (const m of o.schedule ?? []) {
    const t = nextAt(`${String(m.month).padStart(2, "0")}-05`);
    ev.push({ id: `irr-${m.month}`, date: iso(t), endDate: iso(t + 25 * DAY), type: "irrigate", m3PerHa: m.m3PerHa, title: L(`💧 ${MON[m.month - 1]}: ${m.times} marta sug'orish, jami ~${m.m3PerHa.toLocaleString("ru-RU")} m³/ga`, `💧 ${MON[m.month - 1]}: irrigate ${m.times}×, ~${m.m3PerHa.toLocaleString("en-US")} m³/ha in total`), source: "FAO-56" });
  }
  if (o.livestock) {
    ev.push({ id: "ls-heat", date: iso(nextAt("07-01")), endDate: iso(nextAt("08-25")), type: "livestock", title: L("🐄 Iyul–avgust: kunduzi chorvani soyada saqlang, suvni ko'paytiring", "🐄 July–August: keep animals in shade at midday, more water"), source: "THI · NASA POWER" });
    ev.push({ id: "ls-winter", date: iso(nextAt("11-20")), type: "livestock", title: L("🐄 Qishki yem zaxirasini tekshiring", "🐄 Check winter feed stock"), source: L("Yaylov holati · MODIS", "Pasture condition · MODIS") });
  }

  // --- N2: sowing by soil temperature for the plan's spring crops
  let soilTempSowing: SoilTempSowing[] | undefined;
  if (o.st) {
    const p90 = o.p90LastFrostDoy;
    const crops = [...new Set(o.bestYears.flat().map((s) => s.crop))].filter((c) => SOIL_TEMP_MIN[c] != null && !o.bestYears.flat().find((s) => s.crop === c)?.prev);
    for (const c of crops.length ? crops : (["cotton"] as CropId[])) {
      const r = sowingBySoilTemp(o.st, c, SOIL_TEMP_MIN[c]!, p90, o.fc, now);
      if (r) soilTempSowing = [...(soilTempSowing ?? []), r];
    }
  }

  // frozen topsoil in the forecast → postpone leaching / irrigation (N8)
  const frozenDay = o.fc?.slice(0, 7).find((d) => d.soilT < 0);
  if (frozenDay) week.push({ id: "soil-frozen", date: frozenDay.date, type: "weather", severity: "medium", title: L("🧊 Tuproq yuzasi muzlaydi: shu kunlarda yuvish va sug'orishni kechiktiring", "🧊 Topsoil will freeze: postpone leaching and irrigation on those days"), source: "Open-Meteo · ERA5-Land" });
  ev.sort((a, b) => a.date.localeCompare(b.date));
  // plan events that start within 7 days also belong to "this week"
  for (const e of ev) if (new Date(e.date).getTime() <= now.getTime() + 7 * DAY && new Date(e.endDate ?? e.date).getTime() >= now.getTime() - DAY && !week.some((x) => x.id === e.id)) week.push(e);
  return {
    today,
    thisWeek: week,
    next90Days: ev.filter((e) => new Date(e.date).getTime() <= in90 && new Date(e.endDate ?? e.date).getTime() >= now.getTime() - DAY),
    leaching,
    soilTempSowing,
  };
}

/* ------------------------------------------------------------------ A1: actual consumption vs need */

/** Kcb = a·NDVI + b (🔎 a 1.2–1.4, b −0.1…0.1; QOSHIMCHA_FUNKSIYALAR A1), simple soil evaporation term. */
const KCB_A = 1.3, KCB_B = -0.1;
const kcAct = (ndvi: number, a = KCB_A) => {
  const kcb = Math.min(1.2, Math.max(0.15, a * ndvi + KCB_B));
  const fc = Math.min(1, Math.max(0, (ndvi - 0.15) / 0.7));
  return kcb + 0.1 * (1 - fc);
};

export function actualWaterOf(o: { w: Wx; et0: number[]; et0Alt?: number[][]; s2: S2Month[]; yearSpec: YearSpec | null; crops: CropId[]; modisEt: { year: number; etMm: number }[] | null; L: L }): { data: ActualWaterData | null; reason?: string } {
  const { w, et0, s2, L } = o;
  const years = [...new Set(s2.filter((m) => m.ndvi != null).map((m) => +m.month.slice(0, 4)))].sort();
  const lastFull = Math.max(...w.year.filter((y) => w.year.filter((v) => v === y).length > 360));
  const year = [...years].reverse().find((y) => y <= lastFull && s2.filter((m) => m.ndvi != null && +m.month.slice(0, 4) === y).length >= 8);
  if (!year || !o.yearSpec) return { data: null, reason: L("Bulutsiz Sentinel-2 suratlari yetarli emas", "Not enough cloud-free Sentinel-2 images") };
  const ndviOf = new Map(s2.filter((m) => m.ndvi != null).map((m) => [m.month, m.ndvi as number]));
  const et0m = (arr: number[]) => {
    const r = new Array(12).fill(0);
    w.dates.forEach((d, i) => +d.slice(0, 4) === year && (r[+d.slice(5, 7) - 1] += arr[i]));
    return r;
  };
  const e = et0m(et0);
  const alts = (o.et0Alt ?? []).map(et0m);
  const idx = new Map<string, number>();
  w.dates.forEach((d, i) => idx.set(d, i));
  const need = yearNeed(w, et0, idx, o.yearSpec, year);
  const monthly = e.map((et, m) => {
    const key = `${year}-${String(m + 1).padStart(2, "0")}`;
    // fill a missing month from its neighbours
    const v = ndviOf.get(key) ?? (() => {
      const a = ndviOf.get(`${year}-${String(m).padStart(2, "0")}`), b = ndviOf.get(`${year}-${String(m + 2).padStart(2, "0")}`);
      return a != null && b != null ? (a + b) / 2 : a ?? b ?? null;
    })();
    return { month: m + 1, needMm: round(need.etc[m], 0), consumedMm: v == null ? 0 : round(kcAct(v) * et, 0), ndvi: v == null ? null : round(v, 2), _v: v };
  });
  const tot = (f: (m: (typeof monthly)[number], i: number) => number) => Math.round(monthly.reduce((s, m, i) => s + f(m, i), 0) * 10 / 100) * 100;
  const consumed = tot((m) => m.consumedMm);
  const variants = [
    tot((m) => (m._v == null ? 0 : kcAct(m._v, 1.2) * e[m.month - 1])),
    tot((m) => (m._v == null ? 0 : kcAct(m._v, 1.4) * e[m.month - 1])),
    ...alts.map((a) => tot((m) => (m._v == null ? 0 : kcAct(m._v) * a[m.month - 1]))),
  ];
  const me = o.modisEt?.find((x) => x.year === year);
  return {
    data: {
      year,
      crops: o.crops,
      needM3PerHa: tot((m) => m.needMm),
      consumedM3PerHa: consumed,
      consumedLow: Math.min(consumed, ...variants),
      consumedHigh: Math.max(consumed, ...variants),
      checks: [
        { source: "modis", m3PerHa: me ? Math.round((me.etMm * 10) / 100) * 100 : null, note: me ? L("MODIS MOD16 (500 m) yillik ET: sug'oriladigan dalada odatda past baholaydi", "MODIS MOD16 (500 m) annual ET: usually low on irrigated fields") : L("MODIS ET topilmadi", "No MODIS ET") },
        { source: "wapor", m3PerHa: null, note: L("WaPOR L1 faqat Google Earth Engine orqali: ulanmagan", "WaPOR L1 is GEE-only: not connected") },
        { source: "ecostress", m3PerHa: null, note: L("ECOSTRESS (70 m) uchun NASA Earthdata login kerak: ulanmagan", "ECOSTRESS (70 m) needs a NASA Earthdata login: not connected") },
      ],
      monthly: monthly.map(({ _v, ...m }) => (void _v, m)),
      method: `Kcb = ${KCB_A}·NDVI ${KCB_B} (+0.1·(1−fc)), ETc_act = Kc·ET0 (POWER + ERA5)`,
    },
  };
}

/* ------------------------------------------------------------------ N1: water supply signal */

type WsFile = { basins: Record<string, { name: string; flowName: string; history: { year: number; n: number; snowIndex: number; marchSnow: number | null; summerFlow: number | null }[]; current: { season: string; composites: number; lastDate: string | null; snowSoFar: number | null; normSoFar: number | null }; correlation: number | null; correlationYears: string | null }> };
let wsCache: WsFile | null | undefined;
const readRef = <T,>(f: string): T | null => {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "data", "ref", f), "utf8")) as T;
  } catch {
    return null;
  }
};

export function basinOf(region?: string, lon?: number): WaterSupplyData["basin"] | null {
  const r = (region ?? "").toLowerCase().replace(/[ʻʼ'`’]/g, "");
  if (/samarq|samark/.test(r)) return "zarafshan";
  if (/toshkent|tashkent|sirdaryo|syrdar|jizza|fargon|fergan|andij|namang/.test(r)) return "syrdarya";
  if (/surxon|surkhan|qashqa|kashka|buxoro|bukhar|navoi|navoiy|xorazm|khorez|qoraqalp|karakalp/.test(r)) return "amudarya";
  if (lon != null) return lon < 64.5 ? "amudarya" : null;
  return null;
}

const pctRank = (arr: number[], v: number) => Math.round((arr.filter((x) => x < v).length / Math.max(1, arr.length - 1)) * 100);
const lvlOf = (p: number): Level => (p <= 30 ? "low" : p >= 70 ? "high" : "medium");

export function waterSupplyOf(region: string | undefined, lon: number, L: L): { data: WaterSupplyData | null; reason?: string } {
  if (wsCache === undefined) wsCache = readRef<WsFile>("water_supply.json");
  const basin = basinOf(region, lon);
  if (!basin) return { data: null, reason: L("Dala qaysi daryo havzasidan suv olishi aniqlanmadi", "Could not tell which river basin feeds this field") };
  const b = wsCache?.basins[basin];
  if (!b) return { data: null, reason: L("Havza bo'yicha qor ma'lumoti hali yig'ilmagan", "Basin snow data not built yet") };
  const full = b.history.filter((h) => h.n >= 12);
  if (full.length < 8) return { data: null, reason: L("Qor qoplami tarixi yetarli emas", "Not enough snow history") };
  const last = full[full.length - 1];
  // spring (Mar–Apr) snow: the winter index saturates in the high mountains, the melt-season one varies more
  const spr = full.filter((h) => h.marchSnow != null).map((h) => h.marchSnow as number);
  const useSpring = last.marchSnow != null && spr.length >= 8;
  const idx = useSpring ? spr : full.map((h) => h.snowIndex);
  const v = useSpring ? (last.marchSnow as number) : last.snowIndex;
  const med = median(idx);
  const p = pctRank(idx, v);
  const anom = round((v / med - 1) * 100, 0);
  // a level needs both a low/high rank and a real anomaly (±10 %)
  const level: Level = p <= 30 && anom <= -10 ? "low" : p >= 70 && anom >= 10 ? "high" : "medium";
  const flows = full.filter((h) => h.summerFlow != null).map((h) => h.summerFlow as number);
  const fp = last.summerFlow != null ? pctRank(flows, last.summerFlow) : null;
  const fMed = median(flows);
  const cur = b.current;
  const anomCur = cur.snowSoFar != null && cur.normSoFar ? round((cur.snowSoFar / cur.normSoFar - 1) * 100, 0) : null;
  return {
    data: {
      basin,
      basinName: b.name,
      flowName: b.flowName,
      lastSeason: { season: `${last.year - 1}–${String(last.year).slice(2)}`, snowAnomalyPct: anom, percentile: p, level, summerFlowLevel: fp == null ? undefined : lvlOf(fp), summerFlowPct: last.summerFlow != null ? round((last.summerFlow / fMed - 1) * 100, 0) : undefined },
      currentSeason: { season: cur.season, from: "11-01", lastDate: cur.lastDate, snowAnomalyPct: anomCur, level: cur.composites < 6 || anomCur == null ? "early" : anomCur <= -15 ? "low" : anomCur >= 15 ? "high" : "medium", confidence: cur.composites < 6 ? "low" : cur.composites < 12 ? "medium" : "high" },
      history: b.history.map(({ year, snowIndex, marchSnow, summerFlow }) => ({ year, snowIndex, marchSnow, summerFlow })),
      correlation: b.correlation,
      correlationYears: b.correlationYears,
      sources: ["MODIS MOD10A2", "GloFAS v4"],
    },
  };
}

/* ------------------------------------------------------------------ N9: FAO GAEZ */

type GaezFile = { layers: Record<string, { w: number; h: number; lon0: number; lat0: number; rx: number; ry: number; v: (number | null)[] }> };
let gaezCache: GaezFile | null | undefined;
const GAEZ_CROPS: CropId[] = ["winter_wheat", "cotton", "alfalfa", "sunflower", "barley", "sorghum", "maize", "rice"];

export function gaezAt(lat: number, lon: number, rainfedOnly: boolean, L: L): { data: GaezData | null; reason?: string } {
  if (gaezCache === undefined) gaezCache = readRef<GaezFile>("gaez.json");
  if (!gaezCache) return { data: null, reason: L("FAO GAEZ rastrlari yuklanmagan", "FAO GAEZ rasters not loaded") };
  const at = (k: string) => {
    const g = gaezCache!.layers[k];
    if (!g) return null;
    const c = Math.floor((lon - g.lon0) / g.rx), r = Math.floor((lat - g.lat0) / g.ry);
    if (c < 0 || r < 0 || c >= g.w || r >= g.h) return null;
    return g.v[r * g.w + c];
  };
  const crops = GAEZ_CROPS.map((crop) => {
    const regime: "irrigated" | "rainfed" = !rainfedOnly && gaezCache!.layers[`${crop}_irrigated_su`] ? "irrigated" : "rainfed";
    return { crop, regime, suitability: at(`${crop}_${regime}_su`), attainableKgPerHa: at(`${crop}_${regime}_yl`) };
  }).filter((c) => c.suitability != null);
  if (!crops.length) return { data: null, reason: L("Bu joy GAEZ katagida yo'q", "No GAEZ cell here") };
  return { data: { regime: rainfedOnly ? "rainfed" : "irrigated", crops, resolutionKm: 9, note: L("Potensial (erishiladigan) hosil, haqiqiy hosil emas. 1981–2010 iqlimi, yuqori agrotexnika", "Attainable (potential) yield, not actual yield. 1981–2010 climate, high inputs") } };
}

export { quantile };
