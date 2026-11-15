"use client";

import { LazyMotion, domMax, MotionConfig } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { sampleFrames, watchScroll } from "@/lib/perf";
import { useLang } from "@/i18n";
import { CyrillicLayer } from "./Cyrillic";

export function Providers({ children }: { children: ReactNode }) {
  const lang = useLang((s) => s.lang);
  const script = useLang((s) => s.script);
  useEffect(() => {
    document.documentElement.lang = lang === "uz" && script === "cyrl" ? "uz-Cyrl" : lang;
  }, [lang, script]);
  // adaptive glass quality: measure real frames, step down on weak devices
  useEffect(() => {
    const id = setTimeout(() => sampleFrames(), 1500);
    const off = watchScroll();
    return () => {
      clearTimeout(id);
      off();
    };
  }, []);
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
        {children}
        <CyrillicLayer />
      </MotionConfig>
    </LazyMotion>
  );
}
