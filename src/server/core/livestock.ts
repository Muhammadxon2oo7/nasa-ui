import type { ClimateData, Level, LivestockData, LivestockInput, MaybeNumber, Recommendation } from "@/types/api";
import type { Wx } from "./climate";
import { thiOf } from "./thi";
import { mean, median, quantile, round, theilSen } from "./stats";

export const DEFAULT_LIVESTOCK: LivestockInput = {
  herd: { cattle: 25, smallRuminants: 120, horses: 0 },
  grazingFrom: 4,
  grazingTo: 10,
  pastureType: "natural",
  hasWaterOnSite: false,
  priorities: ["conserve"],
};

const AU = { cattle: 1, small: 0.2, horse: 1.25 }; // shartli bosh (plan: 1 cow = 1, 1 sheep = 0.2; horse per USDA AUE)
const INTAKE = 11.5; // kg dry matter / AU / day (PRO_REJA §3A.3)
const unknown = (reason: string): MaybeNumber => ({ value: null, reason });

type Inputs = {
  w: Wx;
  climate: ClimateData;
  modis: { month: string; ndvi: number | null }[] | null;
  npp: { year: number; npp: number }[] | null;
  water: { permanentKm: number | null; seasonalKm: number | null; permanentAt?: [number, number]; seasonalAt?: [number, number]; radiusKm: number } | null;
  forecast: { date: string; tmax: number; rh: number }[] | null;
  areaHa: number;
  statsAreaHa: number;
  input: LivestockInput;
  lang: "uz" | "en";
};

export function livestockModule(x: Inputs): LivestockData {
  const L = (uz: string, en: string) => (x.lang === "uz" ? uz : en);
  const { w, climate } = x;
  const lastFull = Math.max(...w.year.filter((y) => w.year.filter((v) => v === y).length > 360));

  /* ---------------- pasture condition vs the 2005–2025 MODIS norm ---------------- */
  const series = x.modis ?? [];
  const thisYear = new Date().getUTCFullYear();
  const yearHas = (y: number) => series.filter((s) => s.month.startsWith(`${y}`) && s.ndvi != null && +s.month.slice(5, 7) >= 4 && +s.month.slice(5, 7) <= 9).length >= 4;
  const year = yearHas(thisYear) ? thisYear : thisYear - 1;
  const normYears = series.filter((s) => +s.month.slice(0, 4) < year);
  const ndviNorm = Array.from({ length: 12 }, (_, m) => {
    const v = normYears.filter((s) => +s.month.slice(5, 7) === m + 1 && s.ndvi != null).map((s) => s.ndvi as number);
    return { month: m + 1, p10: round(quantile(v, 0.1), 3), p50: round(quantile(v, 0.5), 3), p90: round(quantile(v, 0.9), 3) };
  });
  const ndviThisYear = Array.from({ length: 12 }, (_, m) => {
    const s = series.find((r) => r.month === `${year}-${String(m + 1).padStart(2, "0")}`);
    return { month: m + 1, value: s?.ndvi == null ? null : round(s.ndvi, 3) };
  });
  const season = [4, 5, 6, 7, 8, 9];
  const seasonMean = (y: number) => mean(series.filter((s) => +s.month.slice(0, 4) === y && season.includes(+s.month.slice(5, 7)) && s.ndvi != null).map((s) => s.ndvi as number));
  const thisMean = seasonMean(year);
  const normMean = mean(season.map((m) => ndviNorm[m - 1].p50));
  const pastYears = [...new Set(normYears.map((s) => +s.month.slice(0, 4)))];
  const pastMeans = pastYears.map(seasonMean).filter(Number.isFinite);
  let anomalyPct: MaybeNumber = unknown(L("MODIS NDVI ma'lumoti yetarli emas", "Not enough MODIS NDVI data"));
  let percentile: MaybeNumber = anomalyPct;
  let statusLevel: Level = "medium";
  if (Number.isFinite(thisMean) && Number.isFinite(normMean) && pastMeans.length >= 8) {
    const a = round(((thisMean - normMean) / normMean) * 100, 0);
    anomalyPct = a;
    percentile = round((pastMeans.filter((v) => v < thisMean).length / pastMeans.length) * 100, 0);
    statusLevel = a <= -12 ? "low" : a >= 8 ? "high" : "medium";
  }
  const yearlyPeak = pastYears
    .concat(yearHas(year) ? [year] : [])
    .map((y) => ({ year: y, ndvi: round(mean(series.filter((s) => (s.month === `${y}-05` || s.month === `${y}-06`) && s.ndvi != null).map((s) => s.ndvi as number)), 3) }))
    .filter((p) => Number.isFinite(p.ndvi));
  const droughtYears = (climate.spi3 ?? []).filter((s) => s.date.endsWith("-06") && s.value < -1.5).map((s) => +s.date.slice(0, 4));

  /* ---------------- carrying capacity from MODIS NPP ---------------- */
  const h = x.input.herd;
  const herdAu = round(h.cattle * AU.cattle + h.smallRuminants * AU.small + h.horses * AU.horse, 1);
  const from = Math.min(12, Math.max(1, x.input.grazingFrom)), to = Math.min(12, Math.max(1, x.input.grazingTo));
  const grazingDays = Math.round(((to >= from ? to - from + 1 : 12 - from + 1 + to) * 365) / 12);
  const nppRecent = (x.npp ?? []).slice(-5).map((n) => n.npp);
  const aboveground = 0.45, cToDm = 2.2, useLo = 0.3, useHi = 0.5;
  // [] = MODIS answered but masked every pixel (urban / water / barren fill values); null = request failed
  const nppWhy = x.npp && !x.npp.length ? L("MODIS NPP bu joyni yaylov emas deb belgilagan (aholi punkti, suv yoki qum)", "MODIS NPP masks this place as non-vegetated (built-up, water or barren)") : L("MODIS NPP ma'lumoti olinmadi", "MODIS NPP data unavailable");
  let lowAuPerHa: MaybeNumber = unknown(nppWhy);
  let highAuPerHa: MaybeNumber = lowAuPerHa;
  let status: LivestockData["capacity"]["status"] = "unknown";
  if (nppRecent.length) {
    const nppKgC = median(nppRecent); // kg C / m² / yr
    const forageKgHa = nppKgC * 10000 * cToDm * aboveground; // kg DM / ha / yr
    const need = INTAKE * grazingDays;
    lowAuPerHa = round((forageKgHa * useLo) / need, 2);
    highAuPerHa = round((forageKgHa * useHi) / need, 2);
    const density = herdAu / Math.max(0.1, x.areaHa);
    status = density <= (lowAuPerHa as number) ? "ok" : density <= (highAuPerHa as number) ? "warn" : "over";
  }
  const assumptions = [
    { name: L("NPP (median, so'nggi 5 yil)", "NPP (median, last 5 years)"), value: nppRecent.length ? round(median(nppRecent), 3) : NaN, unit: "kg C/m²/yil", source: "MODIS MOD17A3HGF" },
    { name: L("Uglerod → quruq modda", "Carbon → dry matter"), value: cToDm, unit: "×", source: "PRO_REJA §3A.3" },
    { name: L("Yer usti ulushi", "Above-ground share"), value: aboveground, unit: "×", source: "PRO_REJA §3A.3" },
    { name: L("Foydalanish koeffitsienti", "Utilisation"), value: useLo, unit: `– ${useHi}`, source: L("“Yarmini ye, yarmini qoldir” qoidasi", "Take-half-leave-half range") },
    { name: L("Kunlik iste'mol, 1 shartli bosh", "Daily intake, 1 AU"), value: INTAKE, unit: "kg QM", source: "USDA NRCS" },
    { name: L("O'tlatish kunlari", "Grazing days"), value: grazingDays, unit: L("kun", "days"), source: L("Sizning formangiz", "Your form") },
  ].filter((a) => Number.isFinite(a.value));

  /* ---------------- livestock heat stress (THI) ---------------- */
  const thresholds = { mild: 72, moderate: 79, severe: 89 };
  // stress days use the daily-mean THI (mean T, mean RH); the daily maximum is shown separately
  const thi = w.tmax.map((t, i) => thiOf((t + w.tmin[i]) / 2, w.rh[i]));
  const thiMaxD = w.tmax.map((t, i) => thiOf(t, w.rh[i]));
  const years = [...new Set(w.year)].filter((y) => y <= lastFull);
  const yearly = years.map((y) => ({ year: y, days: thi.filter((v, i) => w.year[i] === y && v >= thresholds.mild).length }));
  // "severe" = days whose midday peak (daily-max THI) reaches the moderate threshold
  const severe = years.map((y) => thiMaxD.filter((v, i) => w.year[i] === y && v >= thresholds.moderate).length);
  const monthly = Array.from({ length: 12 }, (_, m) => {
    const v = thi.filter((_, i) => w.month[i] === m + 1 && w.year[i] <= lastFull);
    const vx = thiMaxD.filter((_, i) => w.month[i] === m + 1 && w.year[i] <= lastFull);
    return { month: m + 1, thiMean: round(mean(v), 1), thiMax: round(mean(vx), 1) };
  });
  const forecast7d = (x.forecast ?? []).map((f) => {
    const v = round(thiOf(f.tmax, f.rh), 1);
    return { date: f.date, thiMax: v, level: (v >= thresholds.moderate ? "high" : v >= thresholds.mild ? "medium" : "low") as Level };
  });
  const heat = {
    stressDaysPerYear: Math.round(mean(yearly.slice(-10).map((y) => y.days))),
    severeDaysPerYear: Math.round(mean(severe.slice(-10))),
    trendDaysPerDecade: round(theilSen(yearly.map((y) => y.year), yearly.map((y) => y.days)) * 10, 1),
    yearly,
    monthly,
    forecast7d,
    thresholds,
  };

  /* ---------------- water ---------------- */
  const wsrc = x.water;
  const waterSources = {
    nearestPermanentKm: wsrc ? (wsrc.permanentKm ?? unknown(L(`${wsrc.radiusKm} km radiusda doimiy suv topilmadi`, `No permanent water within ${wsrc.radiusKm} km`))) : unknown(L("JRC ma'lumoti olinmadi", "JRC data unavailable")),
    nearestSeasonalKm: wsrc ? (wsrc.seasonalKm ?? unknown(L(`${wsrc.radiusKm} km radiusda mavsumiy suv topilmadi`, `No seasonal water within ${wsrc.radiusKm} km`))) : unknown(L("JRC ma'lumoti olinmadi", "JRC data unavailable")),
    nearestPermanentLatLon: wsrc?.permanentAt,
    nearestSeasonalLatLon: wsrc?.seasonalAt,
    radiusKm: wsrc?.radiusKm ?? 12,
  };

  /* ---------------- recommendations (5-part format) ---------------- */
  const recs: Recommendation[] = [];
  const num = (v: MaybeNumber) => (typeof v === "number" ? v : null);
  const a = num(anomalyPct);
  const hi = num(highAuPerHa), lo = num(lowAuPerHa);
  const capHerd = hi != null ? Math.round(hi * x.areaHa) : null;
  const gaps = [
    L("Sig'im koeffitsientlari umumiy adabiyotdan olingan: mahalliy mutaxassis tekshirishi kerak", "Capacity coefficients come from general literature and need a local expert check"),
    L("MODIS 250–500 m piksel: kichik yaylovlarda atrofdagi yerlar ham hisobga kiradi", "MODIS 250–500 m pixels: small pastures include surrounding land"),
  ];
  const nppSrc = "MODIS MOD17A3HGF";
  if (x.areaHa >= 5) {
    recs.push({
      id: "rotate",
      title: L("Yaylovni 2–3 qismga bo'lib, navbatlab o'tlatish", "Split the pasture into 2–3 parts and graze in rotation"),
      why: L("Bir joyda uzoq o'tlatilganda o't tiklanishga ulgurmaydi. Navbatlab o'tlatishda har bir qism 30–45 kun dam oladi.", "Grass can't regrow when animals stay in one place; rotation gives each part 30–45 days of rest."),
      evidence: [
        ...(a != null ? [{ text: L(`Yaylov holati me'yorga nisbatan ${a > 0 ? "+" : ""}${a}%`, `Pasture vs norm: ${a > 0 ? "+" : ""}${a}%`), source: "MODIS NDVI 2005–2025" }] : []),
        { text: L(`Yaylov maydoni: ${round(x.areaHa, 1)} ga`, `Pasture area: ${round(x.areaHa, 1)} ha`), source: L("Xarita", "Map") },
      ],
      benefits: [L("O't qoplami saqlanadi, eroziya kamayadi", "Keeps grass cover and cuts erosion"), L("Mavsum oxirigacha yem yetadi", "Forage lasts to the end of the season")],
      gaps,
      risks: [L("Qismlarni ajratish uchun to'siq yoki cho'pon kerak", "Needs fencing or a herder to separate the parts")],
      generatedBy: "template",
    });
  }
  const overload = hi != null && herdAu > hi * x.areaHa;
  if (overload || (a != null && a <= -12) || droughtYears.includes(lastFull)) {
    const cut = overload && capHerd != null ? Math.min(60, Math.max(10, Math.round(((herdAu - capHerd) / herdAu) * 100))) : 20;
    recs.push({
      id: "reduce",
      title: L(`Bu mavsumda yuklamani ~${cut}% kamaytirish`, `Reduce grazing load by ~${cut}% this season`),
      why: overload
        ? L(`Sizdagi chorva (${herdAu} shartli bosh) taxminiy sig'imdan (${capHerd} shartli bosh) ko'p.`, `Your herd (${herdAu} AU) is above the estimated capacity (${capHerd} AU).`)
        : L("Yaylov odatdagidan kam yashil yoki yaqinda qurg'oqchilik bo'lgan.", "The pasture is less green than usual or a drought happened recently."),
      evidence: [
        ...(lo != null && hi != null ? [{ text: L(`Sig'im: ${lo}–${hi} shartli bosh/ga`, `Capacity: ${lo}–${hi} AU/ha`), source: nppSrc }] : []),
        ...(a != null ? [{ text: L(`NDVI anomaliyasi: ${a}%`, `NDVI anomaly: ${a}%`), source: "MODIS NDVI" }] : []),
        ...(droughtYears.length ? [{ text: L(`Qurg'oqchil yillar (SPI-3 < −1.5): ${droughtYears.slice(-3).join(", ")}`, `Drought years (SPI-3 < −1.5): ${droughtYears.slice(-3).join(", ")}`), source: "NASA POWER" }] : []),
      ],
      benefits: [L("O't qayta tiklanadi, keyingi yillar hosili saqlanadi", "Grass recovers, protecting future years")],
      gaps,
      risks: [L("Daromad vaqtincha kamayadi: qo'shimcha yem sotib olish yoki sotish muddatini agronom bilan rejalang", "Income dips for a while: plan extra feed or sale timing with an expert")],
      generatedBy: "template",
    });
  }
  if (heat.stressDaysPerYear >= 15) {
    recs.push({
      id: "heat",
      title: L("Iyul–avgustda issiqdan himoya", "Protect animals from July–August heat"),
      why: L(`Yiliga o'rtacha ${heat.stressDaysPerYear} kun kunlik o'rtacha THI ≥ 72 bo'ladi. Bunday kunlarda sut va vazn kamayadi.`, `About ${heat.stressDaysPerYear} days a year have a daily-mean THI ≥ 72, when milk yield and weight gain drop.`),
      evidence: [
        { text: L(`Stress kunlari: ${heat.stressDaysPerYear}/yil, trend ${heat.trendDaysPerDecade > 0 ? "+" : ""}${heat.trendDaysPerDecade} kun/10 yil`, `Stress days: ${heat.stressDaysPerYear}/yr, trend ${heat.trendDaysPerDecade > 0 ? "+" : ""}${heat.trendDaysPerDecade} days/decade`), source: "NASA POWER · THI" },
      ],
      benefits: [L("Issiqlik stressi va o'lim xavfi kamayadi", "Less heat stress and mortality risk")],
      gaps: [L("THI kunlik o'rtacha harorat va namlikdan (NASA POWER) hisoblangan: soat bo'yicha tushdagi cho'qqi bundan yuqori", "THI uses daily mean temperature and humidity (NASA POWER); midday peaks are higher")],
      risks: [L("Soya va qo'shimcha suv uchun xarajat", "Costs for shade and extra water")],
      generatedBy: "template",
    });
  }
  const pk = num(waterSources.nearestPermanentKm);
  if (!x.input.hasWaterOnSite && (pk == null || pk > 3)) {
    recs.push({
      id: "water",
      title: L("Suv nuqtasini yaylovga yaqinlashtirish", "Bring water closer to the pasture"),
      why: L("Suvga uzoq yurish chorvani charchatadi va suv yonidagi yerni ortiqcha toptatadi.", "Long walks to water tire animals and over-trample land near the water."),
      evidence: [{ text: pk != null ? L(`Eng yaqin doimiy suv: ${pk} km`, `Nearest permanent water: ${pk} km`) : L(`${waterSources.radiusKm} km radiusda doimiy suv yo'q`, `No permanent water within ${waterSources.radiusKm} km`), source: "JRC Global Surface Water" }],
      benefits: [L("Yaylov bir tekis o'tlatiladi", "Grazing spreads evenly")],
      gaps: [L("Sun'iy suv nuqtalari (quduq, ariq) JRC'da ko'rinmaydi", "Wells and small canals don't show in JRC")],
      risks: [L("Suv tashish yoki quduq qazish xarajati", "Cost of hauling water or drilling a well")],
      generatedBy: "template",
    });
  }
  recs.push({
    id: "forage",
    title: L("Yem-xashak ekinlari: beda yoki oq jo'xori", "Forage crops: alfalfa or sorghum"),
    why: L("Yaylov yemi kam bo'lgan oylarni ekilgan yem bilan to'ldirish mumkin.", "Sown forage can cover the months when pasture is short."),
    evidence: [{ text: L(`Bug'doydan keyin issiqlik: ${climate.gddAfterWheat} GDD`, `Heat after wheat: ${climate.gddAfterWheat} GDD`), source: "NASA POWER" }],
    benefits: [L("Qishki yem zaxirasi", "Winter feed reserve")],
    gaps: [L("Sug'oriladigan yer bormi, bilinmaydi", "Whether irrigated land is available is unknown")],
    risks: [L("Beda sho'rga sezgir va ko'p suv talab qiladi", "Alfalfa is salt-sensitive and water-hungry")],
    generatedBy: "template",
  });

  return {
    pasture: { statusLevel, anomalyPct, percentile, year, ndviThisYear, ndviNorm, yearlyPeak, droughtYears, areaHa: round(x.statsAreaHa, 0) },
    capacity: { lowAuPerHa, highAuPerHa, herdAu, grazingDays, status, assumptions },
    heat,
    waterSources,
    recommendations: recs,
  };
}
