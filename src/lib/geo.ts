import area from "@turf/area";
import centroid from "@turf/centroid";
import kinks from "@turf/kinks";
import { polygon as turfPolygon } from "@turf/helpers";

const UZ_BBOX = { minLon: 55.9, maxLon: 73.2, minLat: 37.1, maxLat: 45.6 };

export type PolyErr = "tooSmall" | "tooLarge" | "selfIntersect" | "outsideUz";

export function analyzePolygon(p: GeoJSON.Polygon) {
  const poly = turfPolygon(p.coordinates);
  const areaHa = area(poly) / 10_000;
  const [lon, lat] = centroid(poly).geometry.coordinates;
  const errors: PolyErr[] = [];
  if (areaHa < 0.1) errors.push("tooSmall");
  if (areaHa > 500) errors.push("tooLarge");
  if (kinks(poly).features.length) errors.push("selfIntersect");
  if (lon < UZ_BBOX.minLon || lon > UZ_BBOX.maxLon || lat < UZ_BBOX.minLat || lat > UZ_BBOX.maxLat) errors.push("outsideUz");
  return { areaHa: Math.round(areaHa * 10) / 10, centroid: [lat, lon] as [number, number], errors };
}

/** ~circle of radius rM around a point (32 segments) — "tap to add a place". */
export function circlePolygon(lat: number, lon: number, rM: number): GeoJSON.Polygon {
  const ring: [number, number][] = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * 2 * Math.PI;
    ring.push([lon + (rM / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (rM / 110574) * Math.sin(a)]);
  }
  ring[32] = ring[0];
  return { type: "Polygon", coordinates: [ring] };
}
