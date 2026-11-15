/**
 * Adaptive visual quality. Two tiers on <html data-perf>:
 *  - "high": full liquid glass (backdrop blur, refraction, drifting light).
 *  - "low":  same layout and springs, but no backdrop/filter blur and no
 *            ambient motion - the GPU-heavy parts that stall weak devices.
 * The initial tier is chosen before first paint (layout.tsx boot script);
 * this watchdog then measures real frame times and steps down if needed.
 */
export type Perf = "high" | "low";
const KEY = "fs:perf";

export const perf = (): Perf => (document.documentElement.dataset.perf === "low" ? "low" : "high");

export function setPerf(p: Perf, remember = true) {
  document.documentElement.dataset.perf = p;
  if (p === "low") document.documentElement.classList.remove("lg-refract");
  if (!remember) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ p, t: Date.now() }));
  } catch {}
}

let sampling = false;

/** Sample ~2.5 s of frames; sustained slowness downgrades to "low". */
export function sampleFrames(ms = 2500) {
  if (sampling || perf() === "low" || document.hidden) return;
  if (new URLSearchParams(location.search).get("perf")) return; // forced by URL
  sampling = true;
  const d: number[] = [];
  let last = performance.now();
  const end = last + ms;
  const f = (t: number) => {
    if (document.hidden) {
      sampling = false;
      return;
    }
    d.push(t - last);
    last = t;
    if (t < end) {
      requestAnimationFrame(f);
      return;
    }
    sampling = false;
    const xs = d.slice(5).sort((a, b) => a - b); // skip warm-up frames
    if (xs.length < 20) return;
    const median = xs[Math.floor(xs.length / 2)];
    const slow = xs.filter((x) => x > 50).length / xs.length;
    const late = xs.filter((x) => x > 34).length / xs.length;
    // under ~45 fps typical, or 1 in 5 frames missing two vsyncs, or many very late
    if (median > 22 || late > 0.2 || slow > 0.1) setPerf("low");
  };
  requestAnimationFrame(f);
}

/** Also measure while the user actually scrolls (where glass costs most). */
export function watchScroll(): () => void {
  let lastRun = 0;
  const on = () => {
    const now = performance.now();
    if (perf() === "low" || now - lastRun < 20_000) return;
    lastRun = now;
    sampleFrames(2000);
  };
  window.addEventListener("scroll", on, { passive: true });
  return () => window.removeEventListener("scroll", on);
}
