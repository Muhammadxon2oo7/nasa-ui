"use client";

import { clsx } from "clsx";
import { AnimatePresence, m } from "motion/react";
import { AlertTriangle, Info, RefreshCw, Satellite, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { CropId, Level } from "@/types/api";
import { GLOSSARY, type GlossaryKey } from "@/data/glossary";
import { cropColor, cropIcon, cropName } from "@/lib/format";
import { useT } from "@/i18n";

export const spring = { type: "spring", bounce: 0, duration: 0.45 } as const;
export const springPop = { type: "spring", bounce: 0.3, duration: 0.5 } as const;

/* ------------------------------------------------------------- surfaces */

export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} data-card className={clsx("min-w-0 rounded-[22px] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] sm:p-5", className)}>
      {children}
    </section>
  );
}

export function CardTitle({ children, info, source, className }: { children: ReactNode; info?: GlossaryKey; source?: string; className?: string }) {
  return (
    <div className={clsx("mb-3 flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--fg)]">{children}</h3>
      {info && <InfoTooltip term={info} />}
      {source && <SourceBadge source={source} className="ml-auto" />}
    </div>
  );
}

/* ------------------------------------------------------------- controls */

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className,
  type = "button",
  size = "md",
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: "primary" | "secondary" | "glass" | "ghost";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  size?: "sm" | "md" | "lg";
  ariaLabel?: string;
}) {
  return (
    <m.button
      type={type}
      aria-label={ariaLabel}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={spring}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-[background-color,opacity,box-shadow] duration-200 disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" && "h-9 px-3.5 text-[13px]",
        size === "md" && "h-11 px-5 text-[15px]",
        size === "lg" && "h-12 px-6 text-[16px]",
        variant === "primary" && "bg-[var(--accent-fill)] text-white shadow-[0_8px_22px_-8px_rgb(46_125_50/0.55)] hover:brightness-[1.06]",
        variant === "secondary" && "bg-[var(--surface)] text-[var(--fg)] shadow-[var(--shadow-card)] ring-1 ring-[var(--hairline)] hover:bg-[var(--surface-2)]",
        variant === "glass" && "lg text-[var(--fg)]",
        variant === "ghost" && "text-[var(--accent)] hover:bg-[var(--accent-soft)]",
        className,
      )}
    >
      {children}
    </m.button>
  );
}

/** iOS segmented control with a sliding lens (glassEffectID-like morph). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  className,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  const id = useId();
  return (
    <div role="tablist" aria-label={ariaLabel} className={clsx("relative flex w-max max-w-full rounded-full bg-[var(--surface-3)]/70 p-0.5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const i = options.findIndex((x) => x.value === value);
              if (e.key === "ArrowRight") onChange(options[(i + 1) % options.length].value);
              if (e.key === "ArrowLeft") onChange(options[(i - 1 + options.length) % options.length].value);
            }}
            className={clsx(
              "relative z-0 flex flex-1 items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors duration-200",
              size === "sm" ? "h-8 px-3 text-[12.5px]" : "h-9 px-4 text-[14px]",
              on ? "text-[var(--fg)]" : "text-[var(--fg-2)] hover:text-[var(--fg)]",
            )}
          >
            {on && (
              <m.span
                layoutId={`seg-${id}`}
                transition={{ type: "spring", bounce: 0.22, duration: 0.42 }}
                className="absolute inset-0 -z-10 rounded-full bg-[var(--surface)] shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)]"
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Slider({ id, label, value, min, max, step = 1, onChange, format, icon }: { id?: string; label: ReactNode; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; icon?: ReactNode }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block min-w-0" htmlFor={id}>
      <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
        <span className="flex items-center gap-1.5 text-[var(--fg-2)]">
          {icon}
          {label}
        </span>
        <span className="font-semibold tnum text-[var(--fg)]">{format ? format(value) : value}</span>
      </div>
      <input id={id} type="range" className="slider" min={min} max={max} step={step} value={value} style={{ ["--p" as string]: `${pct}%` }} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/* ------------------------------------------------------------- badges */

export function SourceBadge({ source, className }: { source: string; className?: string }) {
  return (
    <span data-no-translit className={clsx("inline-flex max-w-full items-center gap-1 truncate rounded-full bg-[var(--secondary-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--secondary)]", className)} title={source}>
      <Satellite size={11} className="shrink-0" />
      <span className="truncate">{source}</span>
    </span>
  );
}

export function LevelBadge({ level, big }: { level: Level; big?: boolean }) {
  const { t } = useT();
  const color = { low: "var(--level-low)", medium: "var(--level-medium)", high: "var(--level-high)" }[level];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full font-semibold uppercase", big ? "px-2.5 py-1 text-[13px]" : "px-2 py-0.5 text-[11px]")} style={{ color, background: `color-mix(in oklab, ${color} 14%, transparent)` }}>
      <i className="h-2 w-2 rounded-full" style={{ background: color }} />
      {t(`lvl.${level}`)}
    </span>
  );
}

export function CropChip({ crop, faded, size = "md" }: { crop: CropId; faded?: boolean; size?: "sm" | "md" }) {
  const { lang } = useT();
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full font-medium", size === "sm" ? "px-1.5 py-0.5 text-[11.5px]" : "px-2 py-0.5 text-[12.5px]", faded && "opacity-55")} style={{ background: `color-mix(in oklab, ${cropColor(crop)} 22%, transparent)` }}>
      <span aria-hidden>{cropIcon(crop)}</span>
      {cropName(crop, lang)}
    </span>
  );
}

/** ℹ️ plain-language explanation of a term (plan §9 glossary). */
export function InfoTooltip({ term }: { term: GlossaryKey }) {
  const { lang } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("pointerdown", on);
    addEventListener("keydown", key);
    return () => {
      removeEventListener("pointerdown", on);
      removeEventListener("keydown", key);
    };
  }, [open]);
  const g = GLOSSARY[term];
  return (
    <span ref={ref} className="relative inline-flex">
      <button type="button" aria-label={g.term} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--fg-3)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)]">
        <Info size={14} />
      </button>
      <AnimatePresence>
        {open && (
          <m.span
            role="tooltip"
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={spring}
            className="lg lg-strong absolute top-7 left-1/2 z-40 w-[min(280px,80vw)] -translate-x-1/2 rounded-2xl p-3 text-left text-[12.5px] leading-snug font-normal text-[var(--fg-2)]"
          >
            <b className="mb-0.5 block text-[13px] text-[var(--fg)]">{g.term}</b>
            {g.short[lang]}
          </m.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/* ------------------------------------------------------------- states */

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-[var(--hairline-strong)] px-5 py-8 text-center">
      <div className="text-[28px]" aria-hidden>
        {icon ?? "🛰️"}
      </div>
      <div className="text-[15px] font-semibold">{title}</div>
      {text && <p className="max-w-sm text-[13.5px] text-[var(--fg-3)]">{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry, onDemo }: { message: string; onRetry?: () => void; onDemo?: () => void }) {
  const { t } = useT();
  return (
    <div role="alert" className="rounded-[22px] bg-[var(--danger-bg)] p-5 text-[var(--danger-fg)]">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle size={18} /> {message}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            <RefreshCw size={14} /> {t("retry")}
          </Button>
        )}
        {onDemo && (
          <Button size="sm" variant="secondary" onClick={onDemo}>
            {t("openDemo")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function DegradedNotice({ items }: { items: string[] }) {
  if (!items.length) return null;
  // quiet, factual note - a data gap is information, not an alarm
  return (
    <p role="status" className="flex items-start gap-2 px-1 text-[13px] leading-snug text-[var(--fg-3)]">
      <Info size={14} className="mt-[2px] shrink-0" />
      <span>{items.join(" · ")}</span>
    </p>
  );
}

export function DisclaimerBanner({ dismissible = true }: { dismissible?: boolean }) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  return (
    <AnimatePresence initial={false}>
      {open && (
        <m.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={spring}
          className="overflow-hidden"
        >
          <div role="note" className="flex items-center gap-2 rounded-2xl border border-[var(--warn-border)] bg-[var(--warn-bg)] px-3.5 py-2.5 text-[13.5px] text-[var(--warn-fg)]">
            <AlertTriangle size={16} className="shrink-0" />
            <span className="flex-1">{t("disclaimer")}</span>
            {dismissible && (
              <button type="button" aria-label={t("close")} onClick={() => setOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/5">
                <X size={15} />
              </button>
            )}
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("shimmer rounded-2xl bg-[var(--surface-2)]", className)} />;
}

/** Bar that grows from the left (compositor-only). */
export function ScoreBar({ value, color = "var(--accent-fill)", className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]", className)}>
      <div className="h-full origin-left rounded-full transition-transform duration-500 ease-[var(--ease-out)]" style={{ background: color, transform: `scaleX(${Math.max(0.02, Math.min(1, value / 100))})` }} />
    </div>
  );
}
