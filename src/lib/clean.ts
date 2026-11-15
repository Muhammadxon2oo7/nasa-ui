/**
 * House style for any text that reaches the screen: plain hyphens instead of en/em dashes, and no
 * emoji (icons are drawn by the UI from structured fields, so the copy stays calm and consistent).
 */
const EMOJI = /\s?(?:(?![\u00A9\u00AE\u2122\u2194-\u2199\u2605])\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}])\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*\s?/gu;
export function dashes<T>(v: T): T {
  if (typeof v === "string") return v.replace(/ — /g, " - ").replace(/[—–]/g, "-").replace(EMOJI, (m) => (m.startsWith(" ") && m.endsWith(" ") ? " " : "")).trim() as T;
  if (Array.isArray(v)) return v.map(dashes) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dashes(x)])) as T;
  return v;
}
