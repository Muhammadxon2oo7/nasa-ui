export type DemoField = { id: "sirdaryo" | "xorazm" | "fargona" | "jizzax"; region: { uz: string; en: string }; center: [number, number]; polygon: GeoJSON.Polygon; icon: string };

// Field boundaries digitised from Esri World Imagery (z17): each ring follows real ditches, roads and tree lines.
const poly = (ring: number[][]): GeoJSON.Polygon => ({ type: "Polygon", coordinates: [ring] });

export const DEMO_FIELDS: DemoField[] = [
  { id: "sirdaryo", region: { uz: "Sirdaryo", en: "Syrdarya" }, center: [40.50115, 68.6867], polygon: poly([[68.6846, 40.4994], [68.6888, 40.4994], [68.6888, 40.5029], [68.6846, 40.5029], [68.6846, 40.4994]]), icon: "🧂" },
  { id: "xorazm", region: { uz: "Xorazm", en: "Khorezm" }, center: [41.49589, 60.61674], polygon: poly([[60.61679, 41.49802], [60.6182, 41.49771], [60.61767, 41.49601], [60.61668, 41.49369], [60.6152, 41.49431], [60.61679, 41.49802]]), icon: "💧" },
  { id: "fargona", region: { uz: "Farg'ona", en: "Fergana" }, center: [40.50134, 71.68842], polygon: poly([[71.68703, 40.5019], [71.68908, 40.5021], [71.68989, 40.50094], [71.68776, 40.50049], [71.68703, 40.5019]]), icon: "🔄" },
  { id: "jizzax", region: { uz: "Jizzax", en: "Jizzakh" }, center: [39.97105, 67.55239], polygon: poly([[67.55023, 39.97217], [67.55533, 39.97059], [67.55533, 39.97013], [67.55023, 39.97095], [67.55023, 39.97217]]), icon: "🌾" },
];
