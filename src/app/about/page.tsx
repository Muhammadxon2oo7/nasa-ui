"use client";

import { clsx } from "clsx";
import { useEffect, useState } from "react";
import type { ModelInfo } from "@/types/api";
import { getModels } from "@/api/client";
import { GLOSSARY } from "@/data/glossary";
import { BacktestSection, NasaDataUsageTable, ValidationNotes } from "@/components/AboutValidation";
import { Pipeline } from "@/components/Pipeline";
import { useT } from "@/i18n";
import { Card, SourceBadge } from "@/components/ui";

const DATASETS = [
  { name: "NASA POWER (MERRA-2/GEOS, AG)", why: { uz: "20 yillik kunlik iqlim: ET0, GDD, sovuq, jazirama, yog'in, SPI", en: "20 years of daily climate: ET0, GDD, frost, heat, rainfall, SPI" }, res: "0.5° × 0.625°", period: "2005-2025", url: "https://power.larc.nasa.gov/" },
  { name: "Sentinel-2 L2A (ESA)", why: { uz: "Oylik NDVI (dala tarixi) va SI (sho'rlanish), SCL bulut maskasi", en: "Monthly NDVI (field history) and SI (salinity), SCL cloud mask" }, res: "10-20 m", period: "2017-2026", url: "https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a" },
  { name: "SMAP L4 (NASA)", why: { uz: "Xarita qatlami: ildiz zonasi namligi", en: "Map layer: root-zone soil moisture" }, res: "9 km", period: "2015-", url: "https://www.earthdata.nasa.gov/data/platforms/space-based-platforms/smap" },
  { name: "MODIS NDVI 8-day (NASA)", why: { uz: "Xarita qatlami: hudud ko'kligi", en: "Map layer: regional greenness" }, res: "250 m", period: "2000-", url: "https://gibs.earthdata.nasa.gov" },
  { name: "GPM IMERG (NASA)", why: { uz: "Xarita qatlami: yog'in", en: "Map layer: rainfall" }, res: "0.1°", period: "2000-", url: "https://gpm.nasa.gov/data" },
  { name: "SRTM GL1 (NASA/USGS)", why: { uz: "Balandlik va qiyalik", en: "Elevation and slope" }, res: "30 m", period: "2000", url: "https://www.earthdata.nasa.gov/data/instruments/srtm" },
  { name: "SoilGrids 2.0 (ISRIC)", why: { uz: "Gil, qum, organik uglerod, pH", en: "Clay, sand, organic carbon, pH" }, res: "250 m", period: "-", url: "https://soilgrids.org" },
  { name: "ERA5 (ECMWF, Open-Meteo)", why: { uz: "ET0 ansambli va SEAS5 uchun referens iqlim", en: "ET0 ensemble and SEAS5 reference climate" }, res: "0.25°", period: "2005-2025", url: "https://open-meteo.com/en/docs/historical-weather-api" },
  { name: "ECMWF SEAS5 (Open-Meteo)", why: { uz: "6 oylik mavsumiy prognoz, 51 senariy", en: "6-month seasonal forecast, 51 members" }, res: "≈ 36 km", period: "-", url: "https://open-meteo.com/en/docs/seasonal-forecast-api" },
  { name: "MODIS MOD13Q1 NDVI 16-day (NASA)", why: { uz: "Yaylov holati: joriy yil va 20 yillik me'yor", en: "Pasture condition: this year vs the 20-year norm" }, res: "250 m", period: "2005-2026", url: "https://planetarycomputer.microsoft.com/dataset/modis-13Q1-061" },
  { name: "MODIS MOD17A3HGF NPP (NASA)", why: { uz: "Yaylov sig'imi: yillik biomassa (Terra + Aqua o'rtachasi)", en: "Grazing capacity: annual biomass (Terra + Aqua mean)" }, res: "500 m", period: "2001-2025", url: "https://planetarycomputer.microsoft.com/dataset/modis-17A3HGF-061" },
  { name: "MODIS MOD16A3GF ET (NASA)", why: { uz: "Haqiqiy suv iste'molini mustaqil tekshirish (A1)", en: "Independent check of actual water use (A1)" }, res: "500 m", period: "2015-2025", url: "https://planetarycomputer.microsoft.com/dataset/modis-16A3GF-061" },
  { name: "MODIS MOD10A2 snow cover (NASA)", why: { uz: "Tog'lardagi qor: suv ta'minoti signali (N1)", en: "Mountain snow: water-supply signal (N1)" }, res: "500 m", period: "2001-2026", url: "https://planetarycomputer.microsoft.com/dataset/modis-10A2-061" },
  { name: "ERA5-Land soil temperature (ECMWF)", why: { uz: "Tuproq harorati bo'yicha ekish va muzlash (N2, N8)", en: "Sowing and frozen soil by soil temperature (N2, N8)" }, res: "0.1°", period: "2005-2025", url: "https://open-meteo.com/en/docs/historical-weather-api" },
  { name: "GloFAS v4 (Copernicus)", why: { uz: "Yozgi daryo oqimi (N1)", en: "Summer river flow (N1)" }, res: "0.05°", period: "2001-2026", url: "https://open-meteo.com/en/docs/flood-api" },
  { name: "FAO GAEZ v4", why: { uz: "Hududga moslik va potensial hosil (N9)", en: "Regional suitability and potential yield (N9)" }, res: "5′ ≈ 9 km", period: "1981-2010", url: "https://gaez.fao.org" },
  { name: "JRC Global Surface Water (EC JRC / Google)", why: { uz: "Eng yaqin doimiy va mavsumiy suv manbai (12 km radius)", en: "Nearest permanent and seasonal water (12 km radius)" }, res: "30 m", period: "1984-2020", url: "https://planetarycomputer.microsoft.com/dataset/jrc-gsw" },
];

// N1 validation, from data/ref/water_supply.json (scripts/build-water-supply.mjs)
const SNOW_FLOW = [{"basin": "Sirdaryo", "r": 0.32, "years": "2001-2026"}, {"basin": "Amudaryo", "r": 0.27, "years": "2001-2026"}, {"basin": "Zarafshon", "r": -0.06, "years": "2001-2026"}];

const METHODS = [
  { k: "ET0", f: "FAO-56 Penman-Monteith (Eq. 6), Rn from POWER ALLSKY_SFC_SW_DWN; ensemble mean with ERA5 FAO-56 ET0" },
  { k: "GDD", f: "Σ max(0, (Tmax + Tmin)/2 − Tbase)" },
  { k: "Frost", f: "Last spring / first autumn Tmin < 0 °C per year; median, extremes, P90" },
  { k: "Heat", f: "Days with Tmax ≥ 40 °C per year, Theil-Sen trend" },
  { k: "SPI-3", f: "3-month rainfall, gamma fit per calendar month (Thom 1958), inverse normal" },
  { k: "NDVI", f: "(B08 − B04)/(B08 + B04), SCL ∈ {4, 5}, 2 least-cloudy scenes per month, median" },
  { k: "Salinity", f: "SI = √(B02·B04) on bare months (NDVI < 0.2); 3 levels (provisional thresholds 0.22 / 0.27); lab ECe overrides" },
  { k: "Water", f: "ETc = Kc(t)·ET0 (FAO-56 Kc curves) · Peff USDA-SCS · 80 mm initial soil water · LR = ECw/(5·ECe_t − ECw) (FAO-29) · gross = net / η" },
  { k: "Rules", f: "R1 season/GDD · R2 salinity · R3 water limit · R4 rotation break · R5 legume bonus · R6 sowing window · R7 bare period · R8 nearest option" },
  { k: "Score", f: "Σ wᵢ·metricᵢ / Σ wᵢ; priority 1 = 3, 2 = 2, 3 = 1.5, others 0.5, climate risk 1; unknown (null) metrics are skipped and weights renormalised" },
  { k: "Robustness", f: "Re-score under normal / dry year (−30 % rain) / hot year (+1.5 °C): 0.5·min + 0.5·(100 − 2·σ)" },
  { k: "Pasture", f: "MODIS NDVI peak this year vs 2005-2025 median for the same months → anomaly %, percentile; NDVI stats on ≥ 1 km² around the place" },
  { k: "Capacity", f: "NPP (median, last 5 yr) × 2.2 (C→DM) × 0.45 (above-ground) × 0.3-0.5 (use) ÷ (11.5 kg DM × grazing days) → AU/ha; 1 cow = 1, 1 sheep/goat = 0.2, 1 horse = 1.25" },
  { k: "THI", f: "NRC 1971: THI = (1.8T + 32) − (0.55 − 0.0055·RH)(1.8T − 26); stress day = daily-mean THI ≥ 72, severe = daily-max THI ≥ 79" },
  { k: "Suitability", f: "Land selection: weighted mean of salinity .25, water .20, season .20, history .15, slope .10, heat .10 (pasture goal: NDVI, anomaly, THI, water, slope)" },
  { k: "A1 actual ET", f: "Kcb = 1.3·NDVI − 0.1 (Sentinel-2 monthly), Kc = Kcb + 0.1·(1 − fc), ETc_act = Kc·ET0 (POWER + ERA5); range a = 1.2-1.4 and both ET0 sources; check: MODIS MOD16A3GF" },
  { k: "B1 leaching", f: "Hoffman / FAO-29: Dlw = k·Ds·ECi/ECf, k = 0.1 intermittent (0.3 continuous), Ds = 0.6 m, ECf = threshold of the next crop; satellite ECi ±25 %; stages in the dekads with the lowest frozen-soil probability" },
  { k: "N2 sowing", f: "ERA5-Land 0-7 cm soil temperature 2005-2025: first day the 5-day mean ≥ crop minimum (cotton 12 °C …), median; window = max(that, P90 last frost + 3 d)" },
  { k: "N8 frozen", f: "Share of days with 0-7 cm soil temperature < 0 °C per dekad, Nov-Mar, 20 years" },
  { k: "N1 supply", f: "MODIS MOD10A2 snow fraction over the mountain headwaters (Nov-Mar mean, Mar-Apr spring index) vs 2001-2026 median; GloFAS Jun-Aug flow; Pearson r spring snow vs summer flow" },
  { k: "N9 GAEZ", f: "FAO GAEZ v4 theme 4 (1981-2010, high input) suitability index and attainable yield at the field cell (5′ ≈ 9 km); 20 % of the land-selection score" },
  { k: "B2 profit", f: "Yield (farmer) × Maas-Hoffman salt factor × (1 − Ky·(1 − limit/need)) × price − cost; dry year = −30 % rain scenario; grain yields capped at the GAEZ potential" },
  { k: "A6 backtest", f: "Data cut at 1 Oct (no leakage) → plans → re-scored with the real next-year weather (water need, limit rule) → Spearman ρ of predicted vs realized ranks" },
  { k: "Unknown", f: "Missing or masked data is shown as with its reason, never as 0 (ADR-10)" },
];

export default function About() {
  const { lang } = useT();
  const [models, setModels] = useState<ModelInfo[]>([]);
  useEffect(() => {
    getModels().then(setModels).catch(() => {});
  }, []);
  const L = (uz: string, en: string) => (lang === "uz" ? uz : en);
  const sections = [
    ["about", L("Loyiha haqida", "About")],
    ["sources", L("Ma'lumotlar manbalari", "Data sources")],
    ["methods", L("Usullar", "Methods")],
    ["models", L("AI modellar", "AI models")],
    ["backtest", L("Orqaga qarab sinov", "Backtest")],
    ["validation", L("Tekshiruvlar", "Validation")],
    ["nasa", L("NASA ma'lumotlari qayerda", "Where NASA data is used")],
    ["llm", L("AI tushuntirishlar", "AI explanations")],
    ["limits", L("Cheklovlar", "Limitations")],
    ["glossary", L("Lug'at", "Glossary")],
  ];
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-6 px-4 sm:px-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav className="hidden lg:block" aria-label="About">
        <ul className="sticky top-[96px] grid gap-0.5 text-[14px]">
          {sections.map(([id, l]) => (
            <li key={id}>
              <a href={`#${id}`} className="block rounded-xl px-3 py-1.5 text-[var(--fg-2)] hover:bg-[var(--surface)] hover:text-[var(--fg)]">
                {l}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
        <section id="about">
          <h1 className="text-[clamp(28px,4.5vw,40px)] font-semibold tracking-[-0.03em]">{L("Metodologiya", "Methodology")}</h1>
          <p className="mt-3 max-w-[32rem] text-[16px] leading-relaxed text-[var(--fg-2)]">
            {L(
              "TerraVision dehqon, chorvador, yer tanlovchi va mutaxassis uchun NASA va hamkor agentliklar ma'lumotlarini oladi. Dala uchun tarix, iqlim xavfi, sho'rlanish va suv talabini hisoblaydi va kamida 3 ta rotatsiya strategiyasini hozirgi rotatsiya bilan solishtiradi. Yaylov uchun holatni 20 yillik me'yor bilan, sig'imni, issiqlik stressini va eng yaqin suvni ko'rsatadi. Yer tanlashda 2-4 joyni maqsad bo'yicha solishtiradi. Tavsiyalarni qoidalar va ballash tizimi beradi, LLM esa faqat tushuntirish yozadi. Har bir raqamning manbasi ko'rsatiladi.",
              "TerraVision pulls NASA and partner-agency data for farmers, herders, land seekers and experts. For a field it computes history, climate risk, salinity and water need, then compares at least 3 rotation strategies with the current one. For a pasture it shows condition vs the 20-year norm, grazing capacity, heat stress and the nearest water. For land selection it compares 2-4 places by goal. Recommendations come from rules and scoring; an LLM only writes explanations. Every number shows its source.",
            )}
          </p>
                  <div className="mt-6">
            <Pipeline />
          </div>
        </section>
        <section id="sources">
          <h2 className="mb-3 text-[22px] font-semibold tracking-[-0.02em]">{L("Ma'lumotlar manbalari", "Data sources")}</h2>
          <div className="scroll-thin overflow-x-auto rounded-[22px] bg-[var(--surface)] shadow-[var(--shadow-card)]">
            <table className="w-full min-w-[640px] text-left text-[13.5px]">
              <thead className="text-[12px] tracking-wide text-[var(--fg-3)] uppercase">
                <tr>
                  <th className="px-4 py-3">Dataset</th>
                  <th className="px-4 py-3">{L("Nima uchun", "Used for")}</th>
                  <th className="px-4 py-3">{L("O'lcham", "Resolution")}</th>
                  <th className="px-4 py-3">{L("Davr", "Period")}</th>
                </tr>
              </thead>
              <tbody>
                {DATASETS.map((d) => (
                  <tr key={d.name} className="border-t border-[var(--hairline)] align-top">
                    <td className="px-4 py-3 font-semibold">
                      <a href={d.url} target="_blank" rel="noreferrer" className="text-[var(--secondary)] hover:underline">
                        {d.name}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-[var(--fg-2)]">{d.why[lang]}</td>
                    <td className="px-4 py-3 tnum">{d.res}</td>
                    <td className="px-4 py-3 tnum">{d.period}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section id="methods">
          <h2 className="mb-3 text-[22px] font-semibold tracking-[-0.02em]">{L("Usullar", "Methods")}</h2>
          <div className="grid gap-2">
            {METHODS.map((x) => (
              <div key={x.k} className="grid gap-1 rounded-2xl bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-card)] sm:grid-cols-[110px_1fr]">
                <b className="text-[14px]">{x.k}</b>
                <code data-no-translit className="text-[13px] break-words text-[var(--fg-2)]">{x.f}</code>
              </div>
            ))}
          </div>
        </section>
        <section id="models">
          <h2 className="mb-3 text-[22px] font-semibold tracking-[-0.02em]">{L("AI modellar", "AI models")}</h2>
          <div className="grid gap-3 lg:grid-cols-3">
            {models.map((m) => (
              <Card key={m.id}>
                <div className="mb-1 text-[12px] font-semibold tracking-wide text-[var(--accent)] uppercase">{m.id}</div>
                <h3 className="text-[16px] font-semibold">{m.name}</h3>
                <dl className="mt-2 grid gap-1.5 text-[13.5px]">
                  <dt className="text-[var(--fg-3)]">{L("Asos", "Base")}</dt>
                  <dd>{m.baseModel}</dd>
                  <dt className="text-[var(--fg-3)]">{L("Biz qo'shdik", "Our contribution")}</dt>
                  <dd>{m.ourContribution}</dd>
                  {m.trainingData && (
                    <>
                      <dt className="text-[var(--fg-3)]">{L("Ma'lumot", "Data")}</dt>
                      <dd>{m.trainingData}</dd>
                    </>
                  )}
                  {m.validation && (
                    <>
                      <dt className="text-[var(--fg-3)]">{L("Tekshiruv", "Validation")}</dt>
                      <dd>{m.validation}</dd>
                    </>
                  )}
                </dl>
                <ul className="mt-3 grid gap-1 text-[13px] text-[var(--warn-fg)]">
                  {m.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </section>
        <section id="backtest">
          <h2 className="mb-3 text-[22px] font-semibold tracking-[-0.02em]">{L("Orqaga qarab sinov (A6)", "Backtest (A6)")}</h2>
          <BacktestSection />
        </section>
        <section id="validation">
          <h2 className="mb-3 text-[22px] font-semibold tracking-[-0.02em]">{L("Tekshiruvlar", "Validation")}</h2>
          <ValidationNotes snow={SNOW_FLOW} />
        </section>
        <section id="nasa">
          <h2 className="mb-3 text-[22px] font-semibold tracking-[-0.02em]">{L("NASA ma'lumotlari qayerda ishlatiladi", "Where NASA data is used")}</h2>
          <NasaDataUsageTable />
        </section>
        <section id="llm">
          <h2 className="mb-3 text-[22px] font-semibold tracking-[-0.02em]">{L("AI tushuntirishlar", "AI explanations")}</h2>
          <Card>
            <p className="max-w-[34rem] text-[15px] leading-relaxed text-[var(--fg-2)]">
              {L(
                "Tavsiyani LLM emas, qoidalar (R1-R8) va ballash beradi. Hozir barcha tushuntirishlar hisoblangan raqamlardan avtomatik shablon bilan yoziladi. Keyingi bosqichda LLM (Claude) ulanadi: u faqat shu JSON'ni oddiy tilga o'giradi, matndagi har bir raqam esa kirish ma'lumotlari bilan avtomatik solishtiriladi. Mos kelmasa, shablon matn ko'rsatiladi.",
                "Recommendations come from rules (R1-R8) and scoring, not from an LLM. Right now every explanation is written from the computed numbers by a template. Next, an LLM (Claude) will only rewrite that JSON in plain language, with every number in its text checked against the input automatically and a template shown if any number doesn't match.",
              )}
            </p>
          </Card>
        </section>
        <section id="limits">
          <h2 className="mb-3 text-[22px] font-semibold tracking-[-0.02em]">{L("Cheklovlar", "Limitations")}</h2>
          <ul className="grid gap-2">
            {[
              L("Sho'rlanish darajasi sun'iy yo'ldosh asosidagi taxmin. Chegaralar hali pilot dalalarda kalibrlanmagan (T7).", "Salinity is a satellite estimate; thresholds are not yet calibrated on pilot fields (T7)."),
              L("Dala tarixi hozircha NDVI qoidalari bilan aniqlanadi (B0). Presto modeli Remelgado 2020 namunalarida o'qitilishi kerak.", "Field history currently comes from NDVI rules (B0); Presto still has to be trained on Remelgado 2020 samples."),
              L("Paxta, makkajo'xori va sholi faqat NDVI bo'yicha bir-biridan yaxshi ajralmaydi.", "Cotton, maize and rice are hard to tell apart from NDVI alone."),
              L("NASA POWER katakchasi ~50 km: tog' oldi dalalarida harorat farq qilishi mumkin.", "A NASA POWER cell is ~50 km: foothill fields can differ in temperature."),
              L("SEAS5 prognozi hindcast bilan tekshirilmagan, shuning uchun ishonch past deb ko'rsatiladi.", "SEAS5 skill is not yet checked with hindcasts, so confidence is shown as low."),
              L("Ekin narxlari ekspert bahosi. Bozor ma'lumotlari hali ulanmagan.", "Crop prices are expert estimates; no market feed yet."),
              L("Yaylov sig'imi o'rtacha koeffitsientlarga tayanadi. Yaylov turi va o't tarkibi hisobga olinmagan, shuning uchun oraliq (min-max) ko'rsatiladi.", "Grazing capacity uses average coefficients; pasture species are not modelled, so a min-max range is shown."),
              L("GPS bo'yinbog' ma'lumotini ulash (M4) hozircha qilinmagan.", "GPS collar data integration (M4) is not done yet."),
              L("Rasmiy sug'orish me'yorlari (A2), tuman hosildorligi va narxlar (B2) hali yig'ilmagan: ko'rsatiladi yoki foydalanuvchi o'zi kiritadi.", "Official irrigation norms (A2), district yields and prices (B2) are not collected yet: shown as or entered by the user."),
              L("WaPOR va OpenET (N4) Google Earth Engine, ECOSTRESS (N5) esa Earthdata login talab qiladi: ulanmagan.", "WaPOR and OpenET (N4) need Google Earth Engine, ECOSTRESS (N5) needs an Earthdata login: not connected."),
              L("Haqiqiy ET (A1) uchun Kcb = a·NDVI + b koeffitsientlari adabiyotdan, mahalliy kalibrlanmagan (T12).", "Kcb = a·NDVI + b coefficients for actual ET (A1) come from literature, not calibrated locally (T12)."),
              L("Kirill yozuvi avtomatik transliteratsiya: ba'zi so'zlar qo'lda tekshirilishi kerak.", "Cyrillic is automatic transliteration: some words still need a manual check."),
              L("JRC suv qatlami 2020 yilgacha. Yangi kanal yoki quduqlar ko'rinmasligi mumkin.", "The JRC water layer ends in 2020; new canals or wells may be missing."),
              L("Kc va ECe qiymatlari FAO-56 va FAO-29 asl jadvallari bilan qayta solishtirilishi kerak (T6).", "Kc and ECe values must be re-checked against the FAO-56 and FAO-29 originals (T6)."),
            ].map((x) => (
              <li key={x} className="max-w-[80ch] rounded-2xl border-l-[3px] border-[var(--level-medium)] bg-[var(--surface)] px-4 py-3 text-[14px] text-[var(--fg-2)] shadow-[var(--shadow-card)]">
                {x}
              </li>
            ))}
          </ul>
        </section>
        <section id="glossary">
          <h2 className="mb-3 text-[22px] font-semibold tracking-[-0.02em]">{L("Lug'at", "Glossary")}</h2>
          <dl className="grid gap-2 sm:grid-cols-2">
            {Object.entries(GLOSSARY).map(([k, g]) => (
              <div key={k} className={clsx("rounded-2xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]")}>
                <dt className="font-semibold">{g.term}</dt>
                <dd className="mt-1 text-[13.5px] leading-relaxed text-[var(--fg-2)]">{g.short[lang]}</dd>
                <dd className="mt-1 text-[12.5px] leading-relaxed text-[var(--fg-3)]">{g.long[lang]}</dd>
              </div>
            ))}
          </dl>
          <SourceBadge source="FAO-56 · FAO-29 · NASA" className="mt-3" />
        </section>
      </div>
    </div>
  );
}
