"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { uz } from "./uz";
import { en } from "./en";

export type Lang = "uz" | "en";
export type Key = keyof typeof uz;
const DICT: Record<Lang, Record<Key, string>> = { uz, en };

/** script: Uzbek Latin or Cyrillic (B4). Data and API calls always use "uz"; Cyrillic is a display layer. */
export const useLang = create<{ lang: Lang; script: "latn" | "cyrl"; setLang: (l: Lang) => void; setScript: (s: "latn" | "cyrl") => void }>()(
  persist((set) => ({ lang: "uz", script: "latn", setLang: (lang) => set({ lang }), setScript: (script) => set({ script }) }), {
    name: "fs:lang",
    storage: createJSONStorage(() => localStorage),
  }),
);

export function translate(lang: Lang, k: Key, vars?: Record<string, string | number>) {
  let s = DICT[lang][k] ?? uz[k] ?? k;
  if (vars) for (const [a, b] of Object.entries(vars)) s = s.replaceAll(`{${a}}`, String(b));
  return s;
}

export function useT() {
  const lang = useLang((s) => s.lang);
  return { lang, t: (k: Key, vars?: Record<string, string | number>) => translate(lang, k, vars) };
}
