"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AnalyzeResponse } from "@/types/api";
import { useT } from "@/i18n";
import { FieldTwin } from "../twin/FieldTwin";
import { FieldFromSpace } from "./FieldFromSpace";

/** Landing hero: a real pilot field in 3D, its recommended rotation playing month by month. */
export function HeroTwin() {
  const { lang } = useT();
  const [d, setD] = useState<AnalyzeResponse | null>(null);
  // The 3D engine (~1 MB) boots only once the page is idle or the visitor interacts,
  // so the hero text and the first tap never wait for WebGL.
  const [boot, setBoot] = useState(false);
  useEffect(() => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      setBoot(true);
    };
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
    const start = () => ric(go, { timeout: 2500 });
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    const opts = { once: true, passive: true } as const;
    window.addEventListener("pointerdown", go, opts);
    window.addEventListener("scroll", go, opts);
    return () => {
      done = true;
      window.removeEventListener("load", start);
      window.removeEventListener("pointerdown", go);
      window.removeEventListener("scroll", go);
    };
  }, []);
  useEffect(() => {
    let dead = false;
    fetch("/demo/sirdaryo.json")
      .then((r) => r.json())
      .then((j) => !dead && setD(j))
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, []);
  if (!d || !boot) return <FieldFromSpace />;
  const label = lang === "uz" ? "Sirdaryo dalasi · natijani ochish" : "Sirdaryo field · open the result";
  const list = d.strategies.map((s, i) => ({ s, i, score: s.score }));
  return (
    <div className="relative">
      <FieldTwin data={d} list={list} bestId={d.summary.bestStrategyId} autoPlay className="h-[clamp(360px,58vh,540px)]" />
      <Link href="/result/demo-sirdaryo" className="press lg absolute top-16 left-3 hidden min-h-11 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13.5px] font-semibold sm:inline-flex">
        {label} <ArrowRight size={15} />
      </Link>
      <Link href="/result/demo-sirdaryo" className="press mt-3 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-[var(--accent)] sm:hidden">
        {label} <ArrowRight size={16} />
      </Link>
    </div>
  );
}
