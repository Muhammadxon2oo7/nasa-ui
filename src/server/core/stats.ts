export const mean = (a: number[]) => {
  const v = a.filter(Number.isFinite);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN;
};
export const sum = (a: number[]) => a.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);

export function quantile(a: number[], q: number) {
  const v = a.filter(Number.isFinite).sort((x, y) => x - y);
  if (!v.length) return NaN;
  const p = (v.length - 1) * q;
  const lo = Math.floor(p), hi = Math.ceil(p);
  return v[lo] + (v[hi] - v[lo]) * (p - lo);
}
export const median = (a: number[]) => quantile(a, 0.5);

/** Theil–Sen slope (per unit x). */
export function theilSen(x: number[], y: number[]) {
  const s: number[] = [];
  for (let i = 0; i < x.length; i++)
    for (let j = i + 1; j < x.length; j++) if (x[j] !== x[i] && Number.isFinite(y[i]) && Number.isFinite(y[j])) s.push((y[j] - y[i]) / (x[j] - x[i]));
  return s.length ? median(s) : 0;
}

/* ---- gamma / normal for SPI (McKee et al. 1993; Thom 1958 MLE approximation) ---- */

function lnGamma(z: number): number {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Regularized lower incomplete gamma P(a, x). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let sumv = 1 / a, del = sumv, ap = a;
    for (let n = 0; n < 200; n++) {
      ap++;
      del *= x / ap;
      sumv += del;
      if (Math.abs(del) < Math.abs(sumv) * 1e-12) break;
    }
    return sumv * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

/** Inverse standard normal (Acklam). */
export function normInv(p: number): number {
  p = Math.min(1 - 1e-9, Math.max(1e-9, p));
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Fit gamma to positive samples (Thom 1958) and return SPI for x, with zero-probability q. */
export function spiTransform(sample: number[]) {
  const pos = sample.filter((v) => v > 0);
  const q = (sample.length - pos.length) / Math.max(1, sample.length);
  if (pos.length < 4) return () => 0;
  const m = mean(pos);
  const A = Math.log(m) - mean(pos.map(Math.log));
  const alpha = (1 + Math.sqrt(1 + (4 * A) / 3)) / (4 * A);
  const beta = m / alpha;
  return (x: number) => {
    const H = q + (1 - q) * (x > 0 ? gammaP(alpha, x / beta) : 0);
    return normInv(H);
  };
}

export const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));
export const round = (v: number, d = 0) => {
  const k = 10 ** d;
  return Math.round(v * k) / k;
};
