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
  if (!d) return <FieldFromSpace />;
  const list = d.strategies.map((s, i) => ({ s, i, score: s.score }));
  return (
    <div className="relative">
      <FieldTwin data={d} list={list} bestId={d.summary.bestStrategyId} autoPlay className="h-[clamp(360px,58vh,540px)]" />
      <Link href="/result/demo-sirdaryo" className="press lg absolute top-[58px] left-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13.5px] font-semibold sm:top-16">
        {lang === "uz" ? "Sirdaryo dalasi · natijani ochish" : "Sirdaryo field · open the result"} <ArrowRight size={15} />
      </Link>
    </div>
  );
}
