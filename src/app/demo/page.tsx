"use client";

import { m } from "motion/react";
import { ArrowRight, Beef, MapPin } from "lucide-react";
import { LIVE_DEMOS } from "@/api/fastapi";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AnalyzeResponse } from "@/types/api";
import { DEMO_FIELDS } from "@/data/demoFields";
import { num } from "@/lib/format";
import { useT, type Key } from "@/i18n";
import { LevelBadge, spring } from "@/components/ui";

export default function Demo() {
  const { t, lang } = useT();
  const [meta, setMeta] = useState<Record<string, AnalyzeResponse>>({});
  useEffect(() => {
    DEMO_FIELDS.forEach((f) =>
      fetch(`/demo/${f.id}.json`)
        .then((r) => r.json())
        .then((d: AnalyzeResponse) => setMeta((s) => ({ ...s, [f.id]: d })))
        .catch(() => {}),
    );
  }, []);
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <h1 className="text-[clamp(28px,4.5vw,40px)] font-semibold tracking-[-0.03em]">{t("demo.title")}</h1>
      <p className="mt-2 max-w-2xl text-[16px] text-[var(--fg-2)]">{t("demo.sub")}</p>
      {/* live: the team's FastAPI backend analyses its pre-cached fields right now */}
      <h2 className="mt-8 flex items-center gap-2 text-[18px] font-semibold tracking-[-0.01em]">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent-fill)] opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent-fill)]" />
        </span>
        {lang === "uz" ? "Jonli tahlil: TerraVision backend" : "Live analysis: TerraVision backend"}
      </h2>
      <p className="mt-1 max-w-[65ch] text-[14.5px] text-[var(--fg-2)]">
        {lang === "uz" ? "NASA POWER, Sentinel-2 va ECMWF ma'lumotlari serverda hozir hisoblanadi (bir necha soniya)." : "NASA POWER, Sentinel-2 and ECMWF data are computed on the server right now (a few seconds)."}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {Object.entries(LIVE_DEMOS).map(([id, d], i) => (
          <m.div key={id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.05 }}>
            <Link href={`/result/live-${id}`} className="press group flex h-full flex-col overflow-hidden rounded-[24px] bg-[var(--surface)] shadow-[var(--shadow-card)]">
              <MiniTile lat={d.lat} lon={d.lon} />
              <div className="flex flex-1 items-center gap-3 p-4">
                <span className="min-w-0 flex-1">
                  <b className="block text-[16px]">{lang === "uz" ? d.uz : d.en}</b>
                  <span className="text-[13px] text-[var(--fg-3)] tnum">
                    {d.lat.toFixed(3)}°N, {d.lon.toFixed(3)}°E · ≈4 {t("ha")}
                  </span>
                </span>
                <ArrowRight size={17} className="shrink-0 text-[var(--accent)] transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          </m.div>
        ))}
      </div>

      <h2 className="mt-10 text-[18px] font-semibold tracking-[-0.01em]">{lang === "uz" ? "Tayyor stsenariylar" : "Ready-made scenarios"}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          { href: "/result/demo-jizzax?module=livestock&tab=pasture", Icon: Beef, title: lang === "uz" ? "Chorvador: Jizzax yaylovi" : "Herder: Jizzax pasture", text: lang === "uz" ? "Yaylov holati 20 yillik me'yorga nisbatan, sig'im, issiqlik stressi, eng yaqin suv" : "Pasture vs 20-year norm, capacity, heat stress, nearest water" },
          { href: "/compare?demo=1", Icon: MapPin, title: lang === "uz" ? "Yer tanlash: 3 joy yonma-yon" : "Land selection: 3 places side by side", text: lang === "uz" ? "Sirdaryo, Jizzax, Farg'ona: qaysi biri bug'doy, paxta yoki yaylov uchun mos?" : "Sirdaryo, Jizzax, Fergana: which fits wheat, cotton or pasture?" },
        ].map((c, i) => (
          <m.div key={c.href} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.05 }}>
            <Link href={c.href} className="press group flex h-full items-center gap-4 rounded-[24px] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--fg-2)]" aria-hidden>
                <c.Icon size={20} strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-[16px] tracking-[-0.01em]">{c.title}</b>
                <span className="text-[13.5px] text-[var(--fg-2)]">{c.text}</span>
              </span>
              <ArrowRight size={17} className="shrink-0 text-[var(--accent)] transition-transform group-hover:translate-x-0.5" />
            </Link>
          </m.div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {DEMO_FIELDS.map((f, i) => {
          const d = meta[f.id];
          const best = d?.strategies.find((s) => s.id === d.summary.bestStrategyId);
          return (
            <m.div key={f.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.05 }}>
              <Link href={`/result/demo-${f.id}`} className="press group flex h-full flex-col overflow-hidden rounded-[24px] bg-[var(--surface)] shadow-[var(--shadow-card)]">
                <MiniTile lat={f.center[0]} lon={f.center[1]} />
                <div className="flex flex-1 flex-col gap-1.5 p-4">
                  <b className="text-[18px] tracking-[-0.01em]">{f.region[lang]}</b>
                  <span className="text-[13.5px] text-[var(--fg-2)]">
                    {t(`demo.${f.id}` as Key)}
                  </span>
                  {d && (
                    <div className="mt-1 grid gap-1 text-[12.5px] text-[var(--fg-3)]">
                      <span className="flex items-center gap-1.5">
                        {d.field.district} · {num(d.field.areaHa, 1)} {t("ha")} · <LevelBadge level={d.summary.salinity} />
                      </span>
                      {best && <span className="line-clamp-2">🏆 {best.name}</span>}
                    </div>
                  )}
                  <span className="mt-auto flex items-center gap-1 pt-2 text-[14px] font-semibold text-[var(--accent)]">
                    {t("demo.open")} <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            </m.div>
          );
        })}
      </div>
    </div>
  );
}

function MiniTile({ lat, lon }: { lat: number; lon: number }) {
  const z = 15;
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`} alt="" width={256} height={256} className="aspect-[16/10] w-full object-cover" loading="lazy" />;
}
