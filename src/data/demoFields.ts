export type DemoField = { id: "sirdaryo" | "xorazm" | "fargona" | "jizzax"; region: { uz: string; en: string }; center: [number, number]; polygon: GeoJSON.Polygon; icon: string };

const sq = (lat: number, lon: number, w = 0.0045, h = 0.0028): GeoJSON.Polygon => ({ type: "Polygon", coordinates: [[[lon, lat], [lon + w, lat], [lon + w, lat + h], [lon, lat + h], [lon, lat]]] });

export const DEMO_FIELDS: DemoField[] = [
  { id: "sirdaryo", region: { uz: "Sirdaryo", en: "Syrdarya" }, center: [40.5034, 68.6883], polygon: sq(40.502, 68.686), icon: "🧂" },
  { id: "xorazm", region: { uz: "Xorazm", en: "Khorezm" }, center: [41.4974, 60.6163], polygon: sq(41.496, 60.614), icon: "💧" },
  { id: "fargona", region: { uz: "Farg'ona", en: "Fergana" }, center: [40.5014, 71.6883], polygon: sq(40.5, 71.686), icon: "🔄" },
  { id: "jizzax", region: { uz: "Jizzax", en: "Jizzakh" }, center: [39.9714, 67.5523], polygon: sq(39.97, 67.55), icon: "🌾" },
];
