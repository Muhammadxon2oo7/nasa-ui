/**
 * Minimum time an analysis screen stays up. Cached answers can arrive in under a second, which reads
 * as "nothing was computed"; showing the stages for a few seconds lets people see what the analysis
 * actually covers. Real work that takes longer is never padded beyond its own duration.
 */
export const thinkMs = () => {
  if (typeof window === "undefined") return 7000;
  return matchMedia("(prefers-reduced-motion: reduce)").matches ? 4000 : 7000;
};

/** Resolve with the promise's value, but not before `ms` have passed since `t0`. */
export async function atLeast<T>(p: Promise<T>, t0: number, ms = thinkMs()): Promise<T> {
  const v = await p;
  const rest = ms - (Date.now() - t0);
  if (rest > 0) await new Promise((r) => setTimeout(r, rest));
  return v;
}

const KEY = "fs:think";
/** Ask the result page to show its analysis screen until `until` (used when Compare opens a cached field). */
export function requestThink(fieldId: string, until = Date.now() + thinkMs()) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ fieldId, until }));
  } catch {}
}
/** Remaining ms of a requested analysis screen for this field (0 when none). Clears it once read. */
export function takeThink(fieldId: string): number {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { fieldId: string; until: number } | null;
    if (!v || v.fieldId !== fieldId) return 0;
    sessionStorage.removeItem(KEY);
    return Math.max(0, Math.min(10_000, v.until - Date.now()));
  } catch {
    return 0;
  }
}

/** Wall-clock time, kept out of components so render-purity lint rules stay meaningful. */
export const now = () => Date.now();
