"use client";

import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";

export const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const OSM = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const GREEN = "#43A047";

export type MapApi = { flyTo: (lat: number, lon: number, z?: number) => void; startDraw: () => void; toggleEdit: () => void; clear: () => void };

/** One polygon at a time; area updates live while editing (FRONTEND_REJASI §3.2.1). */
export default function FieldMap({
  value,
  onChange,
  basemap,
  apiRef,
  readOnly,
  overlay,
  onMapClick,
  extra,
  fitExtra,
}: {
  value: GeoJSON.Polygon | null;
  onChange?: (p: GeoJSON.Polygon | null) => void;
  basemap: "sat" | "map";
  apiRef?: React.MutableRefObject<MapApi | null>;
  readOnly?: boolean;
  overlay?: { url: string; opacity: number; maxNativeZoom?: number; attribution?: string } | null;
  onMapClick?: (lat: number, lon: number) => void;
  extra?: { polygons?: { coords: GeoJSON.Polygon; label: string; color: string }[]; markers?: { lat: number; lon: number; label: string; color: string }[]; lines?: [number, number][][] };
  /** fit the view to the extra layers (+ the main polygon) whenever they change */
  fitExtra?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const base = useRef<Leaflet.TileLayer | null>(null);
  const over = useRef<Leaflet.TileLayer | null>(null);
  const shape = useRef<Leaflet.Polygon | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const extraLayer = useRef<Leaflet.LayerGroup | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      const Lmod = (await import("leaflet")).default;
      (window as unknown as { L: typeof Leaflet }).L = Lmod;
      if (!readOnly) await import("@geoman-io/leaflet-geoman-free");
      if (dead || !el.current) return;
      L.current = Lmod;
      const m = Lmod.map(el.current, { center: [41.3, 64.5], zoom: 6, zoomControl: false, attributionControl: true });
      Lmod.control.zoom({ position: "bottomright" }).addTo(m);
      map.current = m;
      setBase(basemap);
      m.on("click", (e) => clickRef.current?.(e.latlng.lat, e.latlng.lng));
      if (!readOnly) {
        m.pm.setGlobalOptions({ pathOptions: { color: GREEN, weight: 3, fillOpacity: 0.15 }, snappable: true });
        m.on("pm:create", (e) => {
          shape.current?.remove();
          shape.current = e.layer as Leaflet.Polygon;
          emit();
          e.layer.on("pm:edit", emit);
          e.layer.on("pm:markerdrag", emit);
        });
      }
      if (value) draw(value, true);
      drawExtra(); // after the main polygon so fitExtra can include it
      if (apiRef)
        apiRef.current = {
          flyTo: (lat, lon, z = 15) => m.flyTo([lat, lon], z, { duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1.1 }),
          startDraw: () => m.pm.enableDraw("Polygon", { finishOn: "dblclick" as never }),
          toggleEdit: () => shape.current?.pm.toggleEdit({ allowSelfIntersection: true }),
          clear: () => {
            shape.current?.remove();
            shape.current = null;
            cb.current?.(null);
          },
        };
    })();
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create once
  }, []);

  function emit() {
    const s = shape.current;
    if (!s) return;
    cb.current?.((s.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>).geometry);
  }
  function draw(p: GeoJSON.Polygon, fit: boolean) {
    const Lm = L.current, m = map.current;
    if (!Lm || !m) return;
    shape.current?.remove();
    const layer = Lm.polygon(p.coordinates[0].map(([lon, lat]) => [lat, lon] as [number, number]), { color: GREEN, weight: 3, fillOpacity: 0.15 }).addTo(m);
    shape.current = layer;
    if (!readOnly) {
      layer.on("pm:edit", emit);
      layer.on("pm:markerdrag", emit);
    }
    if (fit) m.flyToBounds(layer.getBounds(), { padding: [48, 48], duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1.1, maxZoom: 17 });
  }
  function setBase(b: "sat" | "map") {
    const Lm = L.current, m = map.current;
    if (!Lm || !m) return;
    base.current?.remove();
    base.current = (b === "sat" ? Lm.tileLayer(ESRI, { maxZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }) : Lm.tileLayer(OSM, { maxZoom: 19, attribution: "© OpenStreetMap contributors" })).addTo(m);
    base.current.bringToBack();
  }

  useEffect(() => setBase(basemap), [basemap]); // eslint-disable-line react-hooks/exhaustive-deps
  function drawExtra() {
    const Lm = L.current, m = map.current;
    if (!Lm || !m) return;
    extraLayer.current?.remove();
    if (!extra) return;
    const g = Lm.layerGroup();
    for (const p of extra.polygons ?? []) {
      const layer = Lm.polygon(p.coords.coordinates[0].map(([lo, la]) => [la, lo] as [number, number]), { color: p.color, weight: 2.5, fillOpacity: 0.12 });
      layer.bindTooltip(p.label, { permanent: true, direction: "center", className: "fs-tip" });
      g.addLayer(layer);
    }
    for (const l of extra.lines ?? []) g.addLayer(Lm.polyline(l, { color: "#0288D1", weight: 2, dashArray: "6 6" }));
    for (const mk of extra.markers ?? []) g.addLayer(Lm.circleMarker([mk.lat, mk.lon], { radius: 8, color: "#fff", weight: 2, fillColor: mk.color, fillOpacity: 1 }).bindTooltip(mk.label));
    g.addTo(m);
    extraLayer.current = g;
    if (fitExtra && g.getLayers().length) {
      const b = Lm.featureGroup(g.getLayers()).getBounds();
      if (shape.current) b.extend(shape.current.getBounds());
      m.flyToBounds(b, { padding: [56, 56], maxZoom: 15, duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1 });
    }
  }
  useEffect(drawExtra, [JSON.stringify(extra)]); // eslint-disable-line react-hooks/exhaustive-deps  
  // external polygon (demo field picked / cleared)
  const lastKey = useRef("");
  useEffect(() => {
    const key = value ? JSON.stringify(value.coordinates[0][0]) + value.coordinates[0].length : "";
    if (!map.current) return;
    const own = shape.current ? JSON.stringify((shape.current.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>).geometry.coordinates[0][0]) + (shape.current.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>).geometry.coordinates[0].length : "";
    if (key && key !== own && key !== lastKey.current) draw(value!, true);
    if (!value && shape.current && readOnly) shape.current.remove();
    lastKey.current = key;
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const Lm = L.current, m = map.current;
    if (!Lm || !m) return;
    over.current?.remove();
    over.current = overlay ? Lm.tileLayer(overlay.url, { opacity: overlay.opacity, maxNativeZoom: overlay.maxNativeZoom ?? 9, maxZoom: 19, attribution: overlay.attribution }).addTo(m) : null;
    shape.current?.bringToFront();
  }, [overlay?.url, overlay?.opacity]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="h-full w-full" role="region" aria-label="Map" />;
}
