"use client";

import { m } from "motion/react";
import { ArrowRight, Beef, MapPin, Microscope, PlayCircle, Wheat } from "lucide-react";
import Link from "next/link";
import { useT, type Key } from "@/i18n";
import type { Profile } from "@/types/api";
import { useMode, useProfile } from "@/store/platformStore";
import { STATS } from "@/data/stats";
import { HeroTwin } from "@/components/landing/HeroTwin";
import { Pipeline } from "@/components/Pipeline";
import { spring } from "@/components/ui";
import { useRouter } from "next/navigation";

const PROFILES: Profile[] = ["farmer", "herder", "land_seeker", "expert"];
const ROLE_ICON = { farmer: Wheat, herder: Beef, land_seeker: MapPin, expert: Microscope } as const;
const DATA = ["NASA POWER", "SMAP", "MODIS", "Landsat/Sentinel-2 HLS", "GPM IMERG", "GRACE/GRACE-FO", "SRTM", "ERA5", "ECMWF SEAS5", "SoilGrids", "FAO-56"];

export default function Landing() {
  const { t, lang } = useT();
  const router = useRouter();
  const { profile, setProfile } = useProfile();
  const setMode = useMode((s) => s.setMode);
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="grid items-center gap-8 pt-6 pb-12 md:grid-cols-[1.05fr_0.95fr] md:gap-12 md:pt-14">
        <div>
          <m.h1 initial={{ y: 10 }} animate={{ y: 0 }} transition={spring} className="text-[clamp(34px,6vw,58px)] leading-[1.02] font-semibold tracking-[-0.035em] text-balance">
            {t("landing.title2")}
          </m.h1>
          <m.p initial={{ y: 10 }} animate={{ y: 0 }} transition={{ ...spring, delay: 0.06 }} className="mt-4 max-w-[52ch] text-[18px] leading-relaxed text-[var(--fg-2)]">
            {t("landing.sub2")}
          </m.p>
          <m.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.12 }} className="mt-8">
            <p className="mb-3 text-[15px] font-medium text-[var(--fg-2)]">{t("landing.who")}</p>
            <div data-guide="roles" className="grid gap-1.5 sm:grid-cols-2">
              {PROFILES.map((p) => {
                const Icon = ROLE_ICON[p];
                const on = profile === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setProfile(p);
                      setMode(p === "expert" ? "expert" : "simple");
                      router.push(p === "land_seeker" ? "/compare" : "/analyze");
                    }}
                    className={`press group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors ${on ? "bg-[var(--accent-soft)]" : "bg-[var(--surface)] hover:bg-[var(--surface-2)]"}`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${on ? "bg-[var(--accent-fill)] text-white" : "bg-[var(--surface-2)] text-[var(--fg-2)]"}`}>
                      <Icon size={19} strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block text-[15px] font-semibold">{t(`pr.${p}` as Key)}</b>
                      <span className="block truncate text-[13px] text-[var(--fg-3)]">{t(`pr.${p}Q` as Key)}</span>
                    </span>
                    <ArrowRight size={16} className="shrink-0 text-[var(--fg-3)] transition-transform group-hover:translate-x-0.5" />
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => router.push("/demo")} className="press mt-4 inline-flex items-center gap-2 text-[15px] font-semibold text-[var(--accent)]">
              <PlayCircle size={18} /> {t("openDemo")}
            </button>
          </m.div>
        </div>
        <HeroTwin />
      </section>

      {/* how it works: one line of three verbs, not three cards */}
      <section className="border-t border-[var(--separator)] py-12">
        <h2 className="text-[24px] font-semibold tracking-[-0.02em]">{t("landing.how")}</h2>
        <div className="mt-6">
          <Pipeline />
        </div>
      </section>

      {/* why it matters: figures inside sentences, each with its source */}
      <section className="grid gap-6 border-t border-[var(--separator)] py-12 md:grid-cols-[0.8fr_1.2fr] md:gap-12">
        <h2 className="text-[24px] font-semibold tracking-[-0.02em]">{t("landing.problem")}</h2>
        <ul className="divide-y divide-[var(--separator)]">
          {STATS.map((x) => (
            <li key={x.source} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4 first:pt-0">
              <span className="text-[17px] leading-snug">
                <b className="font-semibold tnum">
                  {x.value} {x.unit[lang]}
                </b>{" "}
                <span className="text-[var(--fg-2)]">{x.label[lang]}</span>
              </span>
              <span className="text-[12.5px] text-[var(--fg-3)]">{x.source}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-[var(--separator)] py-10">
        <p className="max-w-[80ch] text-[14px] leading-relaxed text-[var(--fg-3)]">
          <span className="font-medium text-[var(--fg-2)]">{t("landing.data")}:</span> {DATA.join(" · ")}.{" "}
          <Link href="/about#sources" className="font-semibold text-[var(--accent)] underline">
            {t("nav.about")}
          </Link>
        </p>
      </section>
    </div>
  );
}
