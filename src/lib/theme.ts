"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

export type Theme = "light" | "dark";
const KEY = "fs:theme";

function current(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]:not([media])')?.setAttribute("content", t === "dark" ? "#000000" : "#f5f5f7");
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with the pre-paint boot script
    setTheme(current());
    // Follow the OS while the user hasn't picked a theme explicitly.
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(KEY);
      } catch {}
      if (stored === "light" || stored === "dark") return;
      const t: Theme = mq.matches ? "dark" : "light";
      apply(t);
      setTheme(t);
    };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  /** Circular reveal from the toggle (View Transitions API), cross-fade fallback. */
  const toggle = (origin?: { x: number; y: number }) => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {}

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };

    if (!doc.startViewTransition || reduce) {
      const html = document.documentElement;
      html.classList.add("theme-fade");
      apply(next);
      setTheme(next);
      setTimeout(() => html.classList.remove("theme-fade"), 320);
      return;
    }

    const x = origin?.x ?? innerWidth - 40;
    const y = origin?.y ?? 40;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = doc.startViewTransition(() => {
      flushSync(() => {
        apply(next);
        setTheme(next);
      });
    });
    vt.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 560, easing: "cubic-bezier(0.32, 0.72, 0, 1)", pseudoElement: "::view-transition-new(root)" },
        );
      })
      .catch(() => {});
  };

  return { theme, toggle };
}
