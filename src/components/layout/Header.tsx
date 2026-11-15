"use client";

import { clsx } from "clsx";
import { AnimatePresence, m } from "motion/react";
import { Beef, Check, ChevronDown, MapPin, Menu, Microscope, Moon, Sun, Wheat, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Profile } from "@/types/api";
import { useLang, useT, type Key } from "@/i18n";
import { useTheme } from "@/lib/theme";
import { useMode, useProfile } from "@/store/platformStore";

const ROLE_ICON = { farmer: Wheat, herder: Beef, land_seeker: MapPin, expert: Microscope } as const;
import { Segmented, spring, springPop } from "../ui";

const NAV = [
  { href: "/analyze", key: "nav.analyze" },
  { href: "/compare", key: "nav.compare" },
  { href: "/demo", key: "nav.demo" },
  { href: "/fields", key: "nav.fields" },
  { href: "/about", key: "nav.about" },
  { href: "/guide", key: "nav.guide" },
] as const;
const PROFILES: Profile[] = ["farmer", "herder", "land_seeker", "expert"];

function ProfileSwitcher({ compact }: { compact?: boolean }) {
  const { t } = useT();
  const { profile, setProfile } = useProfile();
  const setMode = useMode((s) => s.setMode);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    addEventListener("pointerdown", on);
    return () => removeEventListener("pointerdown", on);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label={t(`pr.${profile}` as Key)} className="press flex h-10 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold hover:bg-[var(--surface)]/60">
        {(() => {
          const I = ROLE_ICON[profile];
          return <I size={17} strokeWidth={1.8} aria-hidden />;
        })()}
        {!compact && <span>{t(`pr.${profile}` as Key)}</span>}
        <ChevronDown size={14} className={clsx("text-[var(--fg-3)] transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <m.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={spring} style={{ transformOrigin: "top right" }} className="lg lg-strong absolute top-12 right-0 z-50 w-56 rounded-[20px] p-1.5" role="menu">
            {PROFILES.map((p) => (
              <button
                key={p}
                type="button"
                role="menuitemradio"
                aria-checked={profile === p}
                onClick={() => {
                  setProfile(p);
                  setMode(p === "expert" ? "expert" : "simple");
                  setOpen(false);
                  if (p === "land_seeker") router.push("/compare");
                }}
                className="press flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left hover:bg-[var(--surface)]/70"
              >
                {(() => {
                  const I = ROLE_ICON[p];
                  return <I size={18} strokeWidth={1.8} className="text-[var(--fg-2)]" aria-hidden />;
                })()}
                <span className="flex-1">
                  <b className="block text-[14px]">{t(`pr.${p}` as Key)}</b>
                  <span className="text-[12px] text-[var(--fg-3)]">{t(`pr.${p}Q` as Key)}</span>
                </span>
                {profile === p && <Check size={15} className="text-[var(--accent)]" />}
              </button>
            ))}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ModeToggle({ size = "sm" }: { size?: "sm" | "md" }) {
  const { t } = useT();
  const { mode, setMode } = useMode();
  return <Segmented size={size} value={mode} onChange={setMode} options={[{ value: "simple", label: t("mode.simple") }, { value: "expert", label: t("mode.expert") }]} ariaLabel="mode" />;
}

export function Header() {
  const { t, lang } = useT();
  const setLang = useLang((s) => s.setLang);
  const script = useLang((s) => s.script);
  const setScript = useLang((s) => s.setScript);
  const { theme, toggle } = useTheme();
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [compact, setCompact] = useState(false);

  // shrink on scroll down (tabBarMinimizeBehavior), rAF-throttled with hysteresis
  useEffect(() => {
    let last = scrollY, raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = scrollY;
        if (Math.abs(y - last) < 6) return;
        setCompact(y > 80 && y > last);
        last = y;
      });
    };
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  // close the menu on navigation
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) {
    setLastPath(path);
    setMenu(false);
  }

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pt-[max(10px,env(safe-area-inset-top))] sm:px-5">
        <m.nav animate={{ scale: compact ? 0.96 : 1, y: compact ? -2 : 0 }} transition={spring} className="lg pointer-events-auto mx-auto flex h-14 max-w-6xl items-center gap-1 rounded-full pr-2 pl-2.5" aria-label="Main">
          <Link href="/" aria-label="TerraVision" className="press flex shrink-0 items-center gap-2 rounded-full py-1 pr-2 pl-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
            <img src="/brand/mark.png" alt="" width={50} height={30} className="h-[30px] w-auto" />
            <span className="hidden text-[16.5px] font-bold tracking-[-0.025em] sm:inline" aria-hidden>
              <span className="text-[var(--brand-navy)]">Terra</span>
              <span className="text-[var(--brand-green)]">Vision</span>
            </span>
          </Link>
          <div className="mx-auto hidden items-center gap-0.5 lg:flex">
            {NAV.map((n) => {
              const on = path?.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} className={clsx("relative rounded-full px-3 py-1.5 text-[14px] font-medium transition-colors", on ? "text-[var(--fg)]" : "text-[var(--fg-2)] hover:text-[var(--fg)]")}>
                  {on && <m.span layoutId="nav-pill" transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} className="absolute inset-0 -z-10 rounded-full bg-[var(--surface)] shadow-[0_1px_3px_rgb(0_0_0/0.1)]" />}
                  {t(n.key)}
                </Link>
              );
            })}
          </div>
          <div data-guide="header-controls" className="ml-auto flex items-center gap-0.5 lg:ml-0">
            <div className="hidden md:block">
              <ModeToggle />
            </div>
            <ProfileSwitcher compact />
            {/* B4: Lotin → Кирилл → EN (shows the current one) */}
            <button
              type="button"
              data-no-translit
              onClick={() => {
                if (lang === "uz" && script === "latn") setScript("cyrl");
                else if (lang === "uz") (setScript("latn"), setLang("en"));
                else setLang("uz");
              }}
              className="press flex h-10 min-w-10 items-center justify-center rounded-full px-2.5 text-[13px] font-semibold hover:bg-[var(--surface)]/60"
              aria-label={lang === "en" ? "EN - Language: English" : script === "cyrl" ? "ЎЗ - Ўзбекча (кирилл)" : "UZ - O'zbekcha (lotin)"}
              title="O'zbekcha · Ўзбекча · English"
            >
              {lang === "en" ? "EN" : script === "cyrl" ? "ЎЗ" : "UZ"}
            </button>
            <button type="button" onClick={(e) => toggle({ x: e.clientX, y: e.clientY })} className="press flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--surface)]/60" aria-label="Theme">
              <AnimatePresence mode="popLayout" initial={false}>
                <m.span key={theme} initial={{ scale: 0.4, rotate: -60, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.4, rotate: 60, opacity: 0 }} transition={springPop}>
                  {theme === "dark" ? <Moon size={17} /> : <Sun size={17} />}
                </m.span>
              </AnimatePresence>
            </button>
            <button type="button" onClick={() => setMenu(true)} className="press flex h-10 w-10 items-center justify-center rounded-full lg:hidden" aria-label="Menu" aria-expanded={menu}>
              <Menu size={19} />
            </button>
          </div>
        </m.nav>
      </header>
      <AnimatePresence>
        {menu && (
          <>
            <m.div className="fixed inset-0 z-50 bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenu(false)} />
            <m.aside
              initial={{ x: "105%" }}
              animate={{ x: 0 }}
              exit={{ x: "105%" }}
              transition={{ type: "spring", bounce: 0.1, duration: 0.45 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0, right: 0.6 }}
              onDragEnd={(_, i) => (i.offset.x > 80 || i.velocity.x > 450) && setMenu(false)}
              className="lg lg-strong fixed top-2 right-2 bottom-2 z-50 flex w-[min(300px,82vw)] flex-col gap-1 rounded-[28px] p-3"
              role="dialog"
              aria-label="Menu"
            >
              <button type="button" onClick={() => setMenu(false)} className="press mb-2 ml-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface)]/70" aria-label={t("close")}>
                <X size={18} />
              </button>
              {NAV.map((n, i) => (
                <m.div key={n.href} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0, transition: { ...spring, delay: 0.04 * i } }}>
                  <Link href={n.href} className="press block rounded-2xl px-4 py-3 text-[17px] font-semibold hover:bg-[var(--surface)]/70">
                    {t(n.key)}
                  </Link>
                </m.div>
              ))}
              <div className="mt-auto px-1 pb-1">
                <ModeToggle size="md" />
              </div>
            </m.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
