"use client";

import { create } from "zustand";
import type { IrrigationMethod, Strategy } from "@/types/api";
import type { Weights } from "@/lib/scoring";

type UI = {
  fieldId: string | null;
  weights: Weights | null;
  method: IrrigationMethod;
  selected: string | null;
  whatIf: { dT: number; dP: number; strategies: Strategy[] | null; loading: boolean };
  init: (fieldId: string, weights: Weights, method: IrrigationMethod) => void;
  set: (patch: Partial<Omit<UI, "init" | "set">>) => void;
};

export const useResultUi = create<UI>()((set, get) => ({
  fieldId: null,
  weights: null,
  method: "furrow",
  selected: null,
  whatIf: { dT: 0, dP: 0, strategies: null, loading: false },
  init: (fieldId, weights, method) => {
    if (get().fieldId === fieldId) return;
    set({ fieldId, weights, method, selected: null, whatIf: { dT: 0, dP: 0, strategies: null, loading: false } });
  },
  set: (patch) => set(patch),
}));
