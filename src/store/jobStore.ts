import { create } from "zustand";

/** Live state of a backend analysis job (POST /api/analyze?async=true → GET /api/jobs/{id}). */
export type JobStage = "queued" | "climate" | "history" | "soil" | "water" | "strategies" | "forecast" | "done";
export const useJob = create<{ jobId: string | null; stage: JobStage | null; progress: number | null; set: (p: Partial<{ jobId: string | null; stage: JobStage | null; progress: number | null }>) => void; reset: () => void }>((set) => ({
  jobId: null,
  stage: null,
  progress: null,
  set: (p) => set(p),
  reset: () => set({ jobId: null, stage: null, progress: null }),
}));
