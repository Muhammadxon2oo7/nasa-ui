"use client";

import { m } from "motion/react";
import { ArrowRight, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useT, type Key } from "@/i18n";
import type { Profile } from "@/types/api";
import { PROFILE_ICON, useMode, useProfile } from "@/store/platformStore";
import { STATS } from "@/data/stats";
import { HeroTwin } from "@/components/landing/HeroTwin";
import { Button, spring } from "@/components/ui";
import { useRouter } from "next/navigation";

const PROFILES: Profile[] = ["farmer", "herder", "land_seeker", "expert"];
const DATA = ["NASA POWER", "SMAP", "MODIS", "GPM IMERG", "SRTM", "Sentinel-2", "ERA5", "ECMWF SEAS5", "SoilGrids", "FAO-56"];

export default function Landing() {
  const { t, lang } = useT();
  const router = useRouter();
  const { profile, setProfile } = useProfile();
  const setMode = useMode((s) => s.setMode);
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="grid items-center gap-8 pt-6 pb-10 md:grid-cols-[1.1fr_0.9fr] md:gap-12 md:pt-14">
        <div>
          <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--secondary-soft)] px-3 py-1 text-[12.5px] font-semibold text-[var(--secondary)]">
            🛰️ NASA Space Apps 2026 · Field Shift
          </m.div>
          <m.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }} className="text-[clamp(34px,6vw,58px)] leading-[1.02] font-semibold tracking-[-0.035em] text-balance">
            {t("landing.title2")}
          </m.h1>
          <m.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }} className="mt-4 max-w-xl text-[18px] leading-relaxed text-[var(--fg-2)]">
            {t("landing.sub2")}
          </m.p>
          <m.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.15 }} className="mt-7">
            <div className="mb-2.5 text-[13px] font-semibold tracking-wide text-[var(--fg-3)] uppercase">{t("landing.who")}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PROFILES.map((p, i) => (
                <m.button
                  key={p}
                  type="button"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0, transition: { ...spring, delay: 0.18 + i * 0.05 } }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setProfile(p);
                    setMode(p === "expert" ? "expert" : "simple");
                    router.push(p === "land_seeker" ? "/compare" : "/analyze");
                  }}
                  className={`press flex flex-col items-start gap-1 rounded-[20px] p-3.5 text-left shadow-[var(--shadow-card)] transition-colors ${profile === p ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]" : "bg-[var(--surface)] hover:bg-[var(--surface-2)]"}`}
                >
                  <span className="text-[24px]" aria-hidden>{PROFILE_ICON[p]}</span>
                  <b className="text-[15px]">{t(`pr.${p}` as Key)}</b>
                  <span className="text-[12.5px] leading-snug text-[var(--fg-3)]">{t(`pr.${p}Q` as Key)}</span>
                </m.button>
              ))}
            </div>
            <Button size="md" variant="secondary" className="mt-3" onClick={() => router.push("/demo")}>
              <PlayCircle size={17} /> {t("openDemo")}
            </Button>
          </m.div>
        </div>
        <HeroTwin />
      </section>

      <section className="py-10">
        <h2 className="mb-5 text-[26px] font-semibold tracking-[-0.02em]">{t("landing.how")}</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <li key={i} className="flex gap-3 rounded-[22px] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] font-semibold text-[var(--accent)]">{i}</span>
              <span>
                <b className="block text-[16px]">{t(`landing.step${i}` as "landing.step1")}</b>
                <span className="text-[14px] text-[var(--fg-3)]">{t(`landing.step${i}d` as "landing.step1d")}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="py-10">
        <h2 className="mb-5 text-[26px] font-semibold tracking-[-0.02em]">{t("landing.problem")}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {STATS.map((s) => (
            <div key={s.source} className="rounded-[22px] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
              <div className="text-[40px] leading-none font-semibold tracking-[-0.03em] tnum">
                {s.value}
                <span className="ml-1 text-[18px] font-medium text-[var(--fg-3)]">{s.unit[lang]}</span>
              </div>
              <div className="mt-2 text-[15px] text-[var(--fg-2)]">{s.label[lang]}</div>
              <div className="mt-2 text-[12px] text-[var(--fg-3)]">{s.source}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="py-10">
        <h2 className="mb-4 text-[20px] font-semibold tracking-[-0.02em]">{t("landing.data")}</h2>
        <div className="flex flex-wrap gap-2">
          {DATA.map((d) => (
            <span key={d} className="rounded-full bg-[var(--surface)] px-3.5 py-1.5 text-[13.5px] font-medium shadow-[var(--shadow-card)]">
              {d}
            </span>
          ))}
        </div>
        <Link href="/about#sources" className="mt-5 inline-flex items-center gap-1 text-[14px] font-semibold text-[var(--secondary)]">
          {t("nav.about")} <ArrowRight size={15} />
        </Link>
      </section>
    </div>
  );
}
