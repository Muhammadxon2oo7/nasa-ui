"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AnalyzeRequest, LivestockInput, Priority } from "@/types/api";

type Form = Omit<AnalyzeRequest, "lang" | "polygon"> & { polygon: GeoJSON.Polygon | null; demoId?: string | null };
export const DEFAULT_LS: LivestockInput = { herd: { cattle: 25, smallRuminants: 120, horses: 0 }, grazingFrom: 4, grazingTo: 10, pastureType: "natural", hasWaterOnSite: false, priorities: ["conserve"] };

type Wizard = Form & {
  step: 1 | 2 | 3;
  setPolygon: (p: GeoJSON.Polygon | null, demoId?: string | null, placeType?: "polygon" | "point_buffer") => void;
  togglePriority: (p: Priority) => void;
  set: (patch: Partial<Form & { step: 1 | 2 | 3 }>) => void;
  reset: () => void;
};

const initial: Form & { step: 1 } = {
  step: 1,
  polygon: null,
  demoId: null,
  rotation: [2023, 2024, 2025].map((year) => ({ year, crop: null, secondCrop: null })),
  priorities: [],
  water: { availability: "medium", method: "furrow" },
  soil: {},
  constraints: { equipment: [], hasLivestock: false },
  placeType: "polygon",
  livestock: DEFAULT_LS,
};

export const useWizard = create<Wizard>()(
  persist(
    (set, get) => ({
      ...initial,
      setPolygon: (polygon, demoId = null, placeType = "polygon") => set({ polygon, demoId, placeType }),
      togglePriority: (p) => {
        const cur = get().priorities;
        if (cur.includes(p)) set({ priorities: cur.filter((x) => x !== p) });
        else if (cur.length < 3) set({ priorities: [...cur, p] });
      },
      set: (patch) => set(patch),
      reset: () => set(initial),
    }),
    { name: "fs:wizard", storage: createJSONStorage(() => sessionStorage) },
  ),
);
