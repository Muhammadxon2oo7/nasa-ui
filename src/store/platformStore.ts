"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Mode, Profile } from "@/types/api";

/** Profile and mode live in localStorage (fs:profile, fs:mode) - FRONTEND_REJASI §3.0A. */
export const useProfile = create<{ profile: Profile; setProfile: (p: Profile) => void }>()(
  persist((set) => ({ profile: "farmer", setProfile: (profile) => set({ profile }) }), { name: "fs:profile", storage: createJSONStorage(() => localStorage) }),
);
export const useMode = create<{ mode: Mode; setMode: (m: Mode) => void }>()(
  persist((set) => ({ mode: "simple", setMode: (mode) => set({ mode }) }), { name: "fs:mode", storage: createJSONStorage(() => localStorage) }),
);
export const PROFILE_ICON: Record<Profile, string> = { farmer: "🌾", herder: "🐄", land_seeker: "📍", expert: "🔬" };
