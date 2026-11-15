"use client";

import { useEffect, useState } from "react";
import type { BacktestResult } from "@/types/api";
import { num } from "@/lib/format";
import { useT } from "@/i18n";
import { Card } from "./ui";

/** A6: backtest results (live API, offline fallback to the archived JSON). */
export function BacktestSection() {
  const { lang } = useT();
  const L = (uz: string, en: string) => (lang === "uz" ? uz : en);
  const [rows, setRows] = useState<BacktestResult[] | null>(null);
  useEffect(() => {
    let dead = false;
    fetch(`/api/backtest?lang=${lang}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .catch(() => fetch(lang === "en" ? "/demo/backtest.en.json" : "/demo/backtest.json").then((r) => r.json()))
      .then((d) => !dead && Array.isArray(d) && setRows(d))
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [lang]);
  if (!rows) return <Card className="text-[14px] text-[var(--fg-3)]">…</Card>;
  const held = rows.filter((r) => r.recommendedHeld).length;
  const rho = rows.map((r) => r.spearman).filter((v): v is number => v != null);
  const avgRho = rho.length ? Math.round((rho.reduce((a, b) => a + b, 0) / rho.length) * 100) / 100 : null;
  const curOver = rows.filter((r) => r.rows.find((x) => x.isCurrent)?.overLimit).length;
  const recOver = rows.filter((r) => r.rows.find((x) => x.predictedRank === 1 && !x.isCurrent)?.overLimit).length;
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          [L("Sinovlar", "Tests"), `${rows.length}`, L("4 dala × 3 yil", "4 fields × 3 years")],
          [L("Tavsiya top-2 da qoldi", "Advice stayed in top 2"), `${held}/${rows.length}`, L("haqiqiy ob-havoda", "under real weather")],
          [L("O'rtacha Spearman ρ", "Mean Spearman ρ"), avgRho == null ? "-" : String(avgRho), L("bashorat va haqiqiy reyting", "predicted vs realized rank")],
          [L("Limitdan oshdi", "Went over the limit"), `${curOver} / ${recOver}`, L("hozirgi / tavsiya", "current / advised")],
        ].map(([a, b, c]) => (
          <Card key={a} className="flex flex-col gap-1">
            <span className="text-[12.5px] text-[var(--fg-3)]">{a}</span>
            <b className="text-[26px] tracking-[-0.02em] tnum">{b}</b>
            <span className="text-[12px] text-[var(--fg-3)]">{c}</span>
          </Card>
        ))}
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-[13.5px]">
          <thead>
            <tr className="border-b border-[var(--separator)] text-left text-[var(--fg-3)]">
              <th className="p-3 font-medium">{L("Dala · yil", "Field · year")}</th>
              <th className="p-3 font-medium">{L("Ob-havo", "Weather")}</th>
              <th className="p-3 font-medium">{L("Hozirgi", "Current")}</th>
              <th className="p-3 font-medium">{L("Tavsiya", "Advised")}</th>
              <th className="p-3 font-medium">ρ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cur = r.rows.find((x) => x.isCurrent);
              const rec = r.rows.filter((x) => !x.isCurrent).sort((a, b) => a.predictedRank - b.predictedRank)[0];
              return (
                <tr key={r.fieldId + r.evalYear} className="border-b border-[var(--separator)] last:border-0 align-top">
                  <td className="p-3 whitespace-nowrap">
                    <b>{r.name}</b> · {r.evalYear}
                  </td>
                  <td className="p-3 text-[var(--fg-2)] tnum">
                    🌧️ {r.weather.precipPct > 0 ? "+" : ""}
                    {r.weather.precipPct}% · ET0 {r.weather.et0Pct > 0 ? "+" : ""}
                    {r.weather.et0Pct}% · 🔥 {r.weather.heatDays}/{r.weather.normalHeatDays}
                  </td>
                  <td className="p-3 tnum">{cur ? `${num(cur.realizedWater)} ${cur.overLimit ? "❌" : "✅"}` : "-"}</td>
                  <td className="p-3 tnum">
                    {rec ? (
                      <>
                        {rec.strategyId}: {num(rec.realizedWater)} {rec.overLimit ? "❌" : "✅"} · {L(`${rec.realizedRank}-o'rin`, `rank ${rec.realizedRank}`)}
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="p-3 tnum">{r.spearman ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="max-w-[32rem] text-[13.5px] text-[var(--fg-2)]">
        {L(
          "Usul: tizimga faqat kesish sanasigacha (oldingi yilning 1-oktabri) bo'lgan NASA POWER, ERA5 va Sentinel-2 ma'lumotlari beriladi. Tavsiyalar shu holatda tuziladi, keyin har bir strategiya keyingi yilning HAQIQIY ob-havosi bilan qayta hisoblanadi (suv talabi va limit qoidasi). Cheklov: bu sinov faqat suv va limitni tekshiradi, hosil ma'lumoti (stat.uz) hali ulanmagan. Natijalar qanday chiqqan bo'lsa, shunday ko'rsatilgan.",
          "Method: the system only gets NASA POWER, ERA5 and Sentinel-2 data up to the cutoff (1 October of the previous year). It recommends plans from that, then each plan is re-scored with the REAL weather of the next year (water need and the limit rule). Limitation: this only tests water and the limit; yield statistics (stat.uz) are not connected yet. Results are shown as they came out.",
        )}
      </p>
    </div>
  );
}

/** N1 validation (snow vs flow) + N4 status. */
export function ValidationNotes({ snow }: { snow: { basin: string; r: number | null; years: string | null }[] }) {
  const { lang } = useT();
  const L = (uz: string, en: string) => (lang === "uz" ? uz : en);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <h3 className="text-[16px] font-semibold">🏔️ {L("Qor va daryo oqimi (N1)", "Snow vs river flow (N1)")}</h3>
        <ul className="mt-2 grid gap-1 text-[14px] tnum">
          {snow.map((s) => (
            <li key={s.basin} className="flex justify-between">
              <span>{s.basin}</span>
              <b>r = {s.r ?? "-"} <span className="font-normal text-[var(--fg-3)]">({s.years})</span></b>
            </li>
          ))}
        </ul>
        <p className="mt-2 max-w-[34rem] text-[13px] text-[var(--fg-2)]">
          {L(
            "MODIS MOD10A2 bo'yicha bahorgi (mart-aprel) qor qoplami tog'li havzada va GloFAS yozgi (iyun-avgust) oqimi. Bog'liqlik kuchsiz: To'xtag'ul, Norak kabi suv omborlari va suv olish oqimni tartibga soladi. Shuning uchun signal tavsiyaga avtomatik ta'sir qilmaydi, faqat ko'rsatiladi.",
            "Spring (Mar-Apr) snow cover over the mountain basin from MODIS MOD10A2 vs GloFAS summer (Jun-Aug) flow. The link is weak: reservoirs (Toktogul, Nurek) and withdrawals regulate the flow, so the signal is shown but does not change the advice automatically.",
          )}
        </p>
      </Card>
      <Card>
        <h3 className="text-[16px] font-semibold">🇺🇸 {L("AQSh ma'lumotlarida tekshiruv (N4)", "Check on US data (N4)")}</h3>
        <p className="mt-2 max-w-[34rem] text-[13.5px] text-[var(--fg-2)]">
          {L(
            "Reja: Kaliforniya va Arizonadagi paxta, bug'doy va beda dalalarida bizning Sentinel-2 → Kcb → ET usulini OpenET ansambli bilan solishtirish (RMSE, bias, R²). Holat: hali qilinmagan. OpenET va CropScape Google Earth Engine orqali olinadi, GEE ulanmagan. Natija bo'lmaguncha raqam ko'rsatilmaydi.",
            "Plan: compare our Sentinel-2 → Kcb → ET method with the OpenET ensemble on cotton, wheat and alfalfa fields in California and Arizona (RMSE, bias, R²). Status: not done yet. OpenET and CropScape come through Google Earth Engine, which is not connected. No numbers are shown until there is a result.",
          )}
        </p>
        <p className="mt-2 max-w-[34rem] text-[13.5px] text-[var(--fg-2)]">
          {L(
            "Hozircha mavjud mustaqil tekshiruv: MODIS MOD16 yillik ET bilan solishtirish (Suv tabida). ECOSTRESS (N5) uchun NASA Earthdata login kerak, WaPOR uchun GEE: ikkalasi ham ulanmagan.",
            "Available independent check for now: MODIS MOD16 annual ET (in the Water tab). ECOSTRESS (N5) needs a NASA Earthdata login and WaPOR needs GEE: neither is connected.",
          )}
        </p>
      </Card>
    </div>
  );
}

/** Which NASA (and partner) dataset feeds which feature. */
export function NasaDataUsageTable() {
  const { lang } = useT();
  const L = (uz: string, en: string) => (lang === "uz" ? uz : en);
  const rows: [string, string][] = [
    ["NASA POWER", L("Iqlim, ET0, GDD, sovuq, jazirama, SPI, THI, backtest", "Climate, ET0, GDD, frost, heat, SPI, THI, backtest")],
    ["MODIS MOD13Q1 NDVI", L("Yaylov holati (20 yillik me'yor)", "Pasture condition (20-year norm)")],
    ["MODIS MOD17A3HGF NPP", L("Yaylov sig'imi", "Grazing capacity")],
    ["MODIS MOD16A3GF ET", L("Haqiqiy suv iste'molini tekshirish (A1)", "Check of actual water use (A1)")],
    ["MODIS MOD10A2 snow", L("Suv ta'minoti signali (N1)", "Water-supply signal (N1)")],
    ["SRTM", L("Balandlik, qiyalik, yer tanlash", "Elevation, slope, land selection")],
    ["SMAP L4 · GPM IMERG · MODIS (GIBS)", L("Xarita qatlamlari, Worldview (N12)", "Map layers, Worldview (N12)")],
    ["Sentinel-2 (ESA)", L("Dala tarixi, sho'rlanish, haqiqiy ET (Kcb)", "Field history, salinity, actual ET (Kcb)")],
    ["ERA5 / ERA5-Land (ECMWF)", L("ET0 ansambli, tuproq harorati: ekish va muzlash (N2, N8)", "ET0 ensemble, soil temperature: sowing and frozen soil (N2, N8)")],
    ["GloFAS (Copernicus)", L("Yozgi daryo oqimi (N1)", "Summer river flow (N1)")],
    ["FAO GAEZ v4", L("Hududga moslik, potensial hosil (N9)", "Regional suitability, potential yield (N9)")],
    ["JRC Global Surface Water", L("Eng yaqin suv manbai", "Nearest water source")],
  ];
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-[13.5px]">
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a} className="border-b border-[var(--separator)] last:border-0">
              <td data-no-translit className="p-3 font-semibold whitespace-nowrap">{a}</td>
              <td className="p-3 text-[var(--fg-2)]">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
