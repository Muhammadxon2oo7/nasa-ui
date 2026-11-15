"use client";

import { AnimatePresence, m } from "motion/react";
import { Shield } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";
import { spring } from "../ui";
import { G } from "@/components/Glyph";

/** "❓" + reason on tap (ADR-10): an unknown value is never shown as 0. */
export function UnknownValue({ reason }: { reason: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    addEventListener("pointerdown", on);
    return () => removeEventListener("pointerdown", on);
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`${t("unk.title")}: ${reason}`} className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[12.5px] font-medium text-[var(--fg-2)] hover:bg-[var(--surface-3,var(--hairline))]">
        <G e="❓" /> {t("unk.title")}
      </button>
      <AnimatePresence>
        {open && (
          <m.span role="tooltip" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={spring} className="lg lg-strong absolute top-7 left-1/2 z-40 w-[min(260px,75vw)] -translate-x-1/2 rounded-2xl p-3 text-left text-[12.5px] leading-snug font-normal text-[var(--fg-2)]">
            <b className="mb-0.5 block text-[var(--fg)]">{t("unk.title")}</b>
            {reason}
          </m.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** 🛡️ robustness: "does it still work in a bad year?" */
export function RobustnessBadge({ score, worst }: { score: number; worst: number }) {
  const { t } = useT();
  const color = score >= 70 ? "var(--level-low)" : score >= 50 ? "var(--level-medium)" : "var(--level-high)";
  const fg = score >= 70 ? "var(--level-low-fg)" : score >= 50 ? "var(--level-medium-fg)" : "var(--level-high-fg)";
  return (
    <span title={t("rob.title")} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ color: fg, background: `color-mix(in oklab, ${color} 13%, transparent)` }}>
      <Shield size={12} /> {t("rob.worst", { w: worst })}
    </span>
  );
}
