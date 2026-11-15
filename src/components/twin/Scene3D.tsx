"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, { type Map as MlMap } from "maplibre-gl";
import { useEffect, useRef } from "react";

export type SceneState = {
  color: string;
  heightM: number; // extrusion height in metres
  ghostHeightM?: number | null; // translucent "limit" box
  label: string;
  sub?: string;
};

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const DEM = "https://tiles.mapterhorn.com/tilejson.json"; // terrarium, CORS-enabled (AWS terrarium tiles send no CORS header)

/**
 * 3D field twin: Esri imagery draped on Mapterhorn terrain, the field extruded on top.
 * Camera orbits slowly (paused off-screen, on interaction and under reduced motion).
 */
export default function Scene3D({ polygon, state, onReady }: { polygon: GeoJSON.Polygon; state: SceneState; onReady?: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const label = useRef<HTMLDivElement | null>(null);
  const ready = useRef(false);
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    if (!el.current) return;
    const ring = polygon.coordinates[0];
    const lons = ring.map((p) => p[0]), lats = ring.map((p) => p[1]);
    const bounds: [[number, number], [number, number]] = [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
    const center: [number, number] = [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2];
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const m = new maplibregl.Map({
      container: el.current,
      center,
      zoom: 15,
      pitch: 62,
      bearing: -20,
      maxPitch: 80,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          sat: { type: "raster", tiles: [ESRI], tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri, Maxar" },
          dem: { type: "raster-dem", url: DEM, attribution: "Terrain © Mapterhorn" },
        },
        layers: [{ id: "sat", type: "raster", source: "sat" }],
        terrain: { source: "dem", exaggeration: 1.6 },
        sky: { "sky-color": "#bfe3ff", "horizon-color": "#f3efe6", "sky-horizon-blend": 0.6, "atmosphere-blend": 0.4 },
      },
    });
    map.current = m;
    m.on("error", (e) => console.warn("[twin]", (e as { error?: Error }).error?.message ?? e));
    m.fitBounds(bounds, { padding: 90, pitch: 62, bearing: -20, duration: 0, maxZoom: 16.5 });

    let inited = false;
    const init = () => {
      if (inited || !m.isStyleLoaded()) return;
      inited = true;
      const f = { type: "Feature" as const, properties: {}, geometry: polygon };
      m.addSource("field", { type: "geojson", data: f });
      m.addSource("ghost", { type: "geojson", data: f });
      m.addLayer({ id: "field-x", type: "fill-extrusion", source: "field", paint: { "fill-extrusion-color": latest.current.color, "fill-extrusion-height": latest.current.heightM, "fill-extrusion-opacity": 0.9, "fill-extrusion-height-transition": { duration: 700, delay: 0 }, "fill-extrusion-color-transition": { duration: 500, delay: 0 } } });
      m.addLayer({ id: "ghost-x", type: "fill-extrusion", source: "ghost", paint: { "fill-extrusion-color": "#ffffff", "fill-extrusion-height": latest.current.ghostHeightM ?? 0, "fill-extrusion-opacity": latest.current.ghostHeightM ? 0.22 : 0, "fill-extrusion-height-transition": { duration: 700, delay: 0 } } });
      m.addLayer({ id: "field-line", type: "line", source: "field", paint: { "line-color": "#ffffff", "line-width": 2, "line-opacity": 0.9 } });
      const div = document.createElement("div");
      div.className = "twin-label";
      div.style.cssText = "pointer-events:none;display:flex;flex-direction:column;align-items:center;padding:6px 12px;border-radius:14px;background:rgba(11,18,16,.62);color:#fff;backdrop-filter:blur(10px) saturate(1.4);-webkit-backdrop-filter:blur(10px) saturate(1.4);box-shadow:0 8px 24px -10px rgba(0,0,0,.5);white-space:nowrap;line-height:1.25";
      label.current = div;
      new maplibregl.Marker({ element: div, anchor: "bottom", offset: [0, -8] }).setLngLat(center).addTo(m);
      ready.current = true;
      apply();
      onReady?.();
    };
    // add our layers as soon as the style is parsed (the full "load" waits for every terrain tile)
    m.on("styledata", init);
    m.on("load", init);

    // slow orbit
    let raf = 0, last = 0, visible = true, user = false;
    const spin = (t: number) => {
      raf = requestAnimationFrame(spin);
      if (!visible || user || reduce || !ready.current) return (last = t);
      const dt = last ? Math.min(64, t - last) : 16;
      last = t;
      m.setBearing(m.getBearing() + dt * 0.004);
    };
    raf = requestAnimationFrame(spin);
    const stop = () => (user = true);
    m.on("dragstart", stop);
    m.on("rotatestart", stop);
    m.on("zoomstart", (e) => e.originalEvent && stop());
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el.current);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      m.remove();
      map.current = null;
      ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one map per polygon
  }, [JSON.stringify(polygon.coordinates[0][0])]);

  function apply() {
    const m = map.current;
    if (!m || !ready.current) return;
    const s = latest.current;
    m.setPaintProperty("field-x", "fill-extrusion-color", s.color);
    m.setPaintProperty("field-x", "fill-extrusion-height", Math.max(1, s.heightM));
    m.setPaintProperty("ghost-x", "fill-extrusion-height", s.ghostHeightM ?? 0);
    m.setPaintProperty("ghost-x", "fill-extrusion-opacity", s.ghostHeightM ? 0.22 : 0);
    if (label.current) label.current.innerHTML = `<b style="font-size:15px;font-weight:600">${esc(s.label)}</b>${s.sub ? `<span style="font-size:11.5px;opacity:.8">${esc(s.sub)}</span>` : ""}`;
  }
  useEffect(apply, [state.color, state.heightM, state.ghostHeightM, state.label, state.sub]); // eslint-disable-line react-hooks/exhaustive-deps

  // MapLibre sets position:relative on its container, so the container fills an absolute wrapper
  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" />
    </div>
  );
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
