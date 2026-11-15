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
