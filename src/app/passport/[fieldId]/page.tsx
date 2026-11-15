"use client";

import qrcode from "qrcode-generator";
import { Printer } from "lucide-react";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { AnalyzeResponse } from "@/types/api";
import { useAnalysis } from "@/lib/useAnalysis";
import { cropName, dayMonth, monthShort, num } from "@/lib/format";
import { useT } from "@/i18n";
import { Button, EmptyState, Skeleton } from "@/components/ui";

export default function PassportPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[80dvh] max-w-[210mm]" />}>
      <Passport />
    </Suspense>
  );
}

function hash6(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(-6);
}

function Qr({ text }: { text: string }) {
  const path = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
    return { d, n };
  }, [text]);
  return (
    <svg viewBox={`-2 -2 ${path.n + 4} ${path.n + 4}`} className="h-[30mm] w-[30mm]" role="img" aria-label="QR">
      <rect x={-2} y={-2} width={path.n + 4} height={path.n + 4} fill="#fff" />
      <path d={path.d} fill="#000" shapeRendering="crispEdges" />
    </svg>
  );
}

/** Satellite image of the field with its outline (Esri export in EPSG:4326, so the polygon maps linearly). */
function FieldImage({ data }: { data: AnalyzeResponse }) {
  const ring = data.field.polygon.coordinates[0];
  const lons = ring.map((p) => p[0]), lats = ring.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const pad = Math.max(x1 - x0, y1 - y0) * 0.6;
  const W = 640, H = 300;
  // keep the aspect ratio of the image in degrees (cos(lat) correction)
  const k = Math.cos(((y0 + y1) / 2) * (Math.PI / 180));
  let bx0 = x0 - pad, bx1 = x1 + pad, by0 = y0 - pad, by1 = y1 + pad;
  const wantW = ((by1 - by0) * W) / H / k;
  if (bx1 - bx0 < wantW) {
    const c = (bx0 + bx1) / 2;
    bx0 = c - wantW / 2;
    bx1 = c + wantW / 2;
  } else {
    const c = (by0 + by1) / 2, h = ((bx1 - bx0) * H * k) / W;
    by0 = c - h / 2;
    by1 = c + h / 2;
  }
  const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${bx0},${by0},${bx1},${by1}&bboxSR=4326&imageSR=4326&size=${W},${H}&format=jpg&f=image`;
  const pts = ring.map(([lo, la]) => `${((lo - bx0) / (bx1 - bx0)) * W},${((by1 - la) / (by1 - by0)) * H}`).join(" ");
  return (
    <div className="relative overflow-hidden rounded-[3mm]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" width={W} height={H} className="block h-auto w-full" />
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full">
        <polygon points={pts} fill="rgb(46 125 50 / 0.18)" stroke="#43A047" strokeWidth={3} />
      </svg>
      <span className="absolute right-1 bottom-0.5 text-[7pt] text-white/80">Imagery © Esri, Maxar</span>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid border-t border-black/10 pt-[2.5mm]">
      <h2 className="mb-[1.5mm] text-[11pt] font-semibold">
        {n}. {title}
      </h2>
      <div className="text-[9.5pt] leading-[1.45]">{children}</div>
    </section>
  );
}

function Passport() {
  const { fieldId } = useParams<{ fieldId: string }>();
  const { data, status } = useAnalysis(fieldId);
  const { t, lang } = useT();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(location.origin), []); // eslint-disable-line react-hooks/set-state-in-effect -- origin is client-only
  // backend-issued passport number and online URL (FastAPI fields)
  const [official, setOfficial] = useState<{ passportNo: string; onlineUrl: string } | null>(null);
  useEffect(() => {
    if (data?.backend !== "fastapi" || !data.sourceId) return;
    let dead = false;
    fetch(`/py/api/passport/${data.sourceId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => !dead && j?.passportNo && setOfficial({ passportNo: j.passportNo, onlineUrl: j.onlineUrl }))
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [data?.backend, data?.sourceId]);
  if (status === "loading") return <Skeleton className="mx-auto h-[80dvh] max-w-[210mm]" />;
  if (!data) return <EmptyState title="-" />;
  const f = data.field;
  const L = (uz: string, en: string) => (lang === "uz" ? uz : en);
  const no = official?.passportNo ?? `TV-${new Date(data.generatedAt).getUTCFullYear()}-${hash6(data.fieldId)}`;
  const issued = new Date(data.generatedAt);
  const best = data.strategies.find((s) => s.id === data.summary.bestStrategyId) ?? data.strategies[0];
  const cur = data.strategies.find((s) => s.isCurrent);
  const c = data.climate;
  const lvl = (l: string) => (lang === "uz" ? { low: "past", medium: "o'rta", high: "yuqori" } : { low: "low", medium: "medium", high: "high" })[l as "low"] ?? l;
  const heat5 = c.heatDays40.slice(-5);
  const heatNow = heat5.length ? Math.round(heat5.reduce((a, h) => a + h.days, 0) / heat5.length) : null;
  const leach = data.calendar?.leaching;
  const aw = data.actualWater;

  return (
    <div className="px-3 pb-10 print:p-0">
      <div className="no-print mx-auto mb-3 flex max-w-[210mm] justify-end">
        <Button onClick={() => print()}>
          <Printer size={16} /> {t("passport.print")}
        </Button>
      </div>
      <article className="passport mx-auto flex max-w-[210mm] flex-col gap-[3mm] bg-white p-[12mm] text-[#111] shadow-[var(--shadow-card)] print:shadow-none">
        <header className="flex items-start gap-[4mm]">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-[3mm]">
              {/* eslint-disable-next-line @next/next/no-img-element -- print needs a plain image */}
              <img src="/brand/mark.png" alt="TerraVision" className="h-[11mm] w-auto" />
              <div>
                <div className="text-[18pt] leading-none font-bold tracking-[-0.01em]">{t("passport.title")}</div>
                <div className="mt-[1mm] text-[9pt] font-semibold"><span style={{ color: "#0E2F6E" }}>Terra</span><span style={{ color: "#23913F" }}>Vision</span></div>
              </div>
            </div>
            <div className="text-[10pt] text-black/70">
              № {no} · {t("passport.date")}: {issued.toLocaleDateString(lang === "uz" ? "ru-RU" : "en-GB")}
            </div>
            <div className="mt-[2mm] text-[10pt]">
              <b>{t("passport.place")}:</b> {[f.region, f.district].filter(Boolean).join(", ") || "-"} · {num(f.areaHa, 1)} {t("ha")} · {f.centroid[0].toFixed(4)}°N {f.centroid[1].toFixed(4)}°E
              {f.elevationM != null && ` · ${Math.round(f.elevationM)} m`}
              {f.slopeDeg != null && ` · ${L("qiyalik", "slope")} ${f.slopeDeg}°`}
            </div>
          </div>
          {origin && <Qr text={official?.onlineUrl ?? `${origin}/result/${data.fieldId}`} />}
        </header>
        <FieldImage data={data} />

        <Section n={1} title={t("passport.s1")}>
          <p>{data.summary.text}</p>
        </Section>
        <Section n={2} title={t("passport.s2")}>
          <p>
            {data.history.seasons
              .slice(-9)
              .map((s) => `${s.year}: ${s.crops.length ? s.crops.map((x) => `${cropName(x.crop, lang)} (${Math.round(x.confidence * 100)}%)`).join(" + ") : "-"}`)
              .join(" · ")}
          </p>
          {data.history.bareWindows.length > 0 && <p className="text-black/70">{L("Yozgi bo'sh davrlar", "Summer bare periods")}: {data.history.bareWindows.slice(-4).map((b) => `${b.start.slice(0, 4)} (${b.days} ${L("kun", "d")})`).join(", ")}</p>}
        </Section>
        <Section n={3} title={t("passport.s3")}>
          <p>
            {L("Sho'rlanish", "Salinity")}: <b>{lvl(data.soil.salinityLevel)}</b>
            {data.soil.salinityTrendPct != null && ` (${L("trend", "trend")} ${data.soil.salinityTrendPct > 0 ? "+" : ""}${data.soil.salinityTrendPct}%)`} · {data.soil.isEstimated ? L("sun'iy yo'ldosh bahosi (Sentinel-2)", "satellite estimate (Sentinel-2)") : L("laboratoriya tahlili", "lab test")}
            {data.soil.texture && ` · ${L("gil", "clay")} ${data.soil.texture.clay}%, ${L("qum", "sand")} ${data.soil.texture.sand}%`}
            {data.soil.ph != null && ` · pH ${data.soil.ph}`}
          </p>
          {data.gaez && <p className="text-black/70">FAO GAEZ: {data.gaez.crops.filter((g) => (g.suitability ?? 0) >= 70).map((g) => cropName(g.crop, lang)).join(", ") || "-"} {L("uchun moslik yuqori", "highly suitable")}</p>}
        </Section>
        <Section n={4} title={t("passport.s4")}>
          <p>
            {L("Tavsiya qilingan rotatsiya ehtiyoji", "Need of the recommended rotation")}: <b>{num(best.waterM3PerHa)} {t("m3ha")}</b>
            {cur && ` · ${L("hozirgi", "current")} ${num(cur.waterM3PerHa)}`}
            {data.water.limitM3PerHa && ` · ${L("limit", "limit")} ${num(data.water.limitM3PerHa)}`}
          </p>
          {aw && <p className="text-black/70">{L(`${aw.year}-yil: ekin ehtiyoji ${(aw.needM3PerHa != null ? num(aw.needM3PerHa) : "?")}, haqiqiy iste'mol ${num(aw.consumedM3PerHa)} m³/ga (Sentinel-2)`, `${aw.year}: crop need ${(aw.needM3PerHa != null ? num(aw.needM3PerHa) : "?")}, actual use ${num(aw.consumedM3PerHa)} m³/ha (Sentinel-2)`)}</p>}
          {data.waterSupply && <p className="text-black/70">🏔️ {data.waterSupply.basinName}: {L("o'tgan qish qor", "last winter snow")} {data.waterSupply.lastSeason.snowAnomalyPct > 0 ? "+" : ""}{data.waterSupply.lastSeason.snowAnomalyPct}% (MODIS)</p>}
        </Section>
        <Section n={5} title={t("passport.s5")}>
          <p>
            {L("Oxirgi bahorgi sovuq (median)", "Last spring frost (median)")}: {dayMonth(c.lastSpringFrost.median, lang)} · {L("birinchi kuzgi sovuq", "first autumn frost")}: {dayMonth(c.firstAutumnFrost.median, lang)} · {L("sovuqsiz davr", "frost-free")} {c.frostFreeDays} {L("kun", "days")}
            {heatNow != null && ` · 40°C+ ${heatNow} ${L("kun/yil", "days/yr")}`} · {L("yog'in trendi", "rain trend")} {c.precipTrendPct > 0 ? "+" : ""}{c.precipTrendPct}% · {L("asosiy xavf", "main risk")}: <b>{data.summary.mainRisk}</b>
          </p>
        </Section>
        <Section n={6} title={t("passport.s6")}>
          {leach && <p>🧂 {leach.recommended ? `${leach.reason}: ${leach.stages.map((s, i) => `${i + 1}) ${dayMonth(s.date.slice(5, 10), lang)} ~${num(s.m3PerHa)} m³/ga`).join(", ")}` : leach.reason}</p>}
          {data.calendar?.soilTempSowing?.map((s) => (
            <p key={s.crop}>🌱 {cropName(s.crop, lang)}: {dayMonth(s.windowFrom, lang)} - {dayMonth(s.windowTo, lang)} ({L("tuproq", "soil")} ≥ {s.thresholdC}°C)</p>
          ))}
          {data.calendar && <p className="text-black/70">{data.calendar.next90Days.slice(0, 5).map((e) => `${dayMonth(e.date.slice(5, 10), lang)}: ${e.title}`).join(" · ")}</p>}
        </Section>
        <Section n={7} title={t("passport.s7")}>
          <table className="w-full border-collapse text-[9pt]">
            <tbody>
              {data.strategies.map((s) => (
                <tr key={s.id} className="border-b border-black/10 align-top">
                  <td className="py-[1mm] pr-[2mm] font-bold">{s.id}{s.id === best.id ? " ★" : ""}</td>
                  <td className="py-[1mm] pr-[2mm]">{s.name}{s.isCurrent ? ` (${L("hozirgi", "current")})` : ""}</td>
                  <td className="py-[1mm] pr-[2mm] text-right whitespace-nowrap tnum">{s.score} {L("ball", "pts")}</td>
                  <td className="py-[1mm] text-right whitespace-nowrap tnum">{num(s.waterM3PerHa)} m³/ga</td>
                </tr>
              ))}
            </tbody>
          </table>
          {best.explanation.risks.length > 0 && <p className="mt-[1mm] text-black/70">{best.explanation.risks.slice(0, 2).join(" · ")}</p>}
        </Section>
        <Section n={8} title={t("passport.s8")}>
          <p className="text-black/70">{data.sources.map((s) => s.name).join(" · ")}</p>
          <p className="text-black/70">{L("Cheklovlar: sho'rlanish chegaralari kalibrlanmagan; narxlar va rasmiy me'yorlar ulanmagan; NASA POWER katagi ~50 km.", "Limits: salinity thresholds not calibrated; prices and official norms not connected; NASA POWER cell ~50 km.")}</p>
          <p className="text-black/70">{monthShort(issued.getUTCMonth() + 1, lang)} {issued.getUTCFullYear()} · TerraVision · NASA Space Apps 2026</p>
        </Section>
        <footer className="mt-[2mm] rounded-[2mm] border border-black/20 p-[3mm] text-[8.5pt] text-black/75">{t("passport.disclaimer")}</footer>
      </article>
    </div>
  );
}
