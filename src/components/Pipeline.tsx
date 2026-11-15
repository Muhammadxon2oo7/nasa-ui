"use client";

import { Calculator, CloudSun, Droplets, FileText, Layers, Mountain, Satellite, ScrollText, ShieldCheck, Sprout, Thermometer, CalendarDays } from "lucide-react";
import { useT } from "@/i18n";

/** Data → Computation → Decision: the whole method in one picture (challenge: explainable, evidence-based). */
export function Pipeline() {
  const { lang } = useT();
  const L = (uz: string, en: string) => (lang === "en" ? en : uz);
  const cols = [
    {
      head: L("1. Kosmosdan ma'lumot", "1. Data from space"),
      sub: L("Har bir dala uchun avtomatik yig'iladi", "Collected automatically for every field"),
      items: [
        [Thermometer, "NASA POWER", L("20 yillik kunlik iqlim", "20 years of daily climate")],
        [Satellite, "Landsat · Sentinel-2 · MODIS", L("30 m dala surati, tarix, o'simlik", "30 m field imagery, history, vegetation")],
        [Droplets, "SMAP · GPM · GRACE", L("Tuproq namligi, yog'in, suv zaxirasi", "Soil moisture, rain, water storage")],
        [Mountain, "SRTM", L("Relyef va qiyalik", "Terrain and slope")],
      ],
    },
    {
      head: L("2. Ilmiy hisob", "2. Scientific model"),
      sub: L("Ochiq formulalar, har raqamning manbasi bor", "Open formulas, every number sourced"),
      items: [
        [Droplets, "FAO-56", L("Ekinning suv talabi", "Crop water need")],
        [Layers, "FAO-29", L("Sho'rga chidamlilik", "Salt tolerance")],
        [Calculator, L("Qoidalar R1-R8", "Rules R1-R8"), L("Mavsum, limit, tanaffus", "Season, limit, breaks")],
        [CloudSun, L("3 ssenariy", "3 scenarios"), L("Odatiy, qurg'oqchil, issiq yil", "Normal, dry, hot year")],
      ],
    },
    {
      head: L("3. Fermerga qaror", "3. Decision for the farmer"),
      sub: L("Oddiy tilda, sababi bilan", "In plain words, with the why"),
      items: [
        [Sprout, L("3+ strategiya", "3+ strategies"), L("Hozirgisi bilan solishtirib", "Compared with the current one")],
        [CalendarDays, L("Ish kalendari", "Work calendar"), L("Ekish, sug'orish, yuvish", "Sowing, irrigation, leaching")],
        [ShieldCheck, L("Xavflar", "Risks"), L("Sovuq, jazirama, suv tanqisligi", "Frost, heat, water shortage")],
        [FileText, L("Yer pasporti", "Land passport"), L("Bank va klaster uchun", "For banks and clusters")],
      ],
    },
  ] as const;
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
      {cols.map((c, i) => (
        <div key={c.head} className="contents">
          <div className="rounded-[22px] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
            <b className="block text-[16px] tracking-[-0.01em]">{c.head}</b>
            <span className="text-[13px] text-[var(--fg-3)]">{c.sub}</span>
            <ul className="mt-4 grid gap-2.5">
              {c.items.map(([Icon, name, what]) => (
                <li key={name as string} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--accent)]">
                    <Icon size={17} strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0 leading-tight">
                    <b className="block text-[14px] font-semibold">{name as string}</b>
                    <span className="text-[12.5px] text-[var(--fg-3)]">{what as string}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {i < cols.length - 1 && (
            <div className="flex items-center justify-center py-1 md:py-0" aria-hidden>
              <svg width="56" height="24" viewBox="0 0 56 24" className="rotate-90 text-[var(--accent)] md:rotate-0">
                <line x1="2" y1="12" x2="44" y2="12" stroke="currentColor" strokeWidth="2" strokeDasharray="5 5" className="pipe-flow" />
                <path d="M42 5l9 7-9 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export { ScrollText };
