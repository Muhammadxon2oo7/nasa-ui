/**
 * B4: Uzbek Latin → Cyrillic (QOSHIMCHA_FUNKSIYALAR B4). Automatic, with an exceptions dictionary.
 * Acronyms (NASA, MODIS, ET0), CamelCase brands (SoilGrids, GloFAS) and listed names stay Latin.
 */
const APOS = "'ʻʼ’`";
const MAP: Record<string, string> = { a: "а", b: "б", d: "д", e: "е", f: "ф", g: "г", h: "ҳ", i: "и", j: "ж", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", q: "қ", r: "р", s: "с", t: "т", u: "у", v: "в", x: "х", y: "й", z: "з", c: "с", w: "в" };
const EXC: Record<string, string> = {
  yanvar: "январь", fevral: "февраль", mart: "март", aprel: "апрель", may: "май", iyun: "июнь", iyul: "июль", avgust: "август", sentabr: "сентябрь", oktabr: "октябрь", noyabr: "ноябрь", dekabr: "декабрь",
  yan: "янв", fev: "фев", apr: "апр", iyn: "июн", iyl: "июл", avg: "авг", sen: "сен", okt: "окт", noy: "ноя", dek: "дек",
  rayon: "район", rayoni: "райони", traktor: "трактор", kalendar: "календарь", kalendari: "календари", aksiya: "акция", sentner: "центнер", senariy: "сценарий", ssenariy: "сценарий", ssenariysini: "сценарийсини", ssenariylar: "сценарийлар",
  modul: "модуль", profil: "профиль", fermer: "фермер", agronom: "агроном", internet: "интернет", eksport: "экспорт", eroziya: "эрозия", ekspert: "эксперт", element: "элемент",
};
const KEEP = new Set(["Sentinel", "Planetary", "Computer", "Copernicus", "Esri", "Maxar", "Earthstar", "Geographics", "Leaflet", "Worldview", "Theil", "Sen", "Penman", "Monteith", "Maas", "Hoffman", "Field", "Shift", "Space", "Apps", "Open", "Meteo", "Presto", "Harvest", "Remelgado", "Nominatim", "OpenStreetMap", "Claude", "Google", "Earth", "Engine", "Microsoft", "Telegram", "Landsat", "Aqua", "Terra", "Ky", "Kc", "Kcb", "pH"]);

function core(w: string) {
  let out = "";
  for (let i = 0; i < w.length; i++) {
    const c = w[i], lc = c.toLowerCase(), up = c !== lc;
    const n1 = w[i + 1]?.toLowerCase() ?? "", n2 = w[i + 2] ?? "";
    const isApos = (ch: string | undefined) => !!ch && APOS.includes(ch);
    const U = (s: string) => (up ? s.toUpperCase() : s);
    if ((lc === "o" || lc === "g") && isApos(w[i + 1])) { out += U(lc === "o" ? "ў" : "ғ"); i++; continue; }
    if (lc === "y" && n1 === "o" && isApos(n2)) { out += U("й"); continue; }
    if (lc === "s" && n1 === "h") { out += U("ш"); i++; continue; }
    if (lc === "c" && n1 === "h") { out += U("ч"); i++; continue; }
    if (lc === "y" && "oaue".includes(n1) && n1) { out += U({ o: "ё", a: "я", u: "ю", e: "е" }[n1]!); i++; continue; }
    if (lc === "e") { out += U(i === 0 || "aeiouAEIOU".includes(w[i - 1] ?? "") ? "э" : "е"); continue; }
    if (isApos(c)) { out += i > 0 && i < w.length - 1 ? "ъ" : ""; continue; }
    out += MAP[lc] ? U(MAP[lc]) : c;
  }
  return out;
}

export function toCyrillicWord(w: string) {
  if (/^[A-D]$/.test(w)) return w; // strategy ids A–D
  if (KEEP.has(w) || KEEP.has(w.replace(/['ʻʼ’`]$/, ""))) return w;
  if (/^[A-Z]{2,}$/.test(w) || /[a-z][A-Z]/.test(w)) return w; // acronyms, CamelCase brands
  const lw = w.toLowerCase().replace(/[ʻʼ’`]/g, "'");
  if (EXC[lw]) return w[0] !== w[0].toLowerCase() ? EXC[lw][0].toUpperCase() + EXC[lw].slice(1) : EXC[lw];
  const r = core(w);
  return w.length > 1 && w === w.toUpperCase() ? r.toUpperCase() : r;
}

const WORD = /[A-Za-z]+(?:['ʻʼ’`][A-Za-z]+)*['ʻʼ’`]?/g;
export const toCyrillic = (s: string) => s.replace(WORD, (w, at: number) => (s[at - 1] === "°" || s[at - 1] === "." ? w : toCyrillicWord(w)));
