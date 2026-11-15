"use client";

import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { useEffect, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import { useLang } from "@/i18n";
import type * as Leaflet from "leaflet";

export const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const OSM = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const GREEN = "#43A047";

// Uzbekistan (+ margin): the map opens on the whole country and cannot drift away from it
const UZ_BOUNDS: [[number, number], [number, number]] = [[36.6, 55.4], [46.1, 73.7]];
/** Regional centres over the irrigated belts (zoom 10 shows individual fields). */
export const REGIONS: { id: string; uz: string; en: string; c: [number, number] }[] = [
  { id: "qq", uz: "Qoraqalpog'iston", en: "Karakalpakstan", c: [42.45, 59.6] },
  { id: "xo", uz: "Xorazm", en: "Khorezm", c: [41.45, 60.65] },
  { id: "bu", uz: "Buxoro", en: "Bukhara", c: [39.78, 64.42] },
  { id: "na", uz: "Navoiy", en: "Navoi", c: [40.1, 65.38] },
  { id: "sa", uz: "Samarqand", en: "Samarkand", c: [39.65, 66.95] },
  { id: "qa", uz: "Qashqadaryo", en: "Kashkadarya", c: [38.85, 65.8] },
  { id: "su", uz: "Surxondaryo", en: "Surkhandarya", c: [37.85, 67.55] },
  { id: "ji", uz: "Jizzax", en: "Jizzakh", c: [40.12, 67.85] },
  { id: "si", uz: "Sirdaryo", en: "Syrdarya", c: [40.5, 68.75] },
  { id: "to", uz: "Toshkent", en: "Tashkent", c: [41.05, 69.4] },
  { id: "na2", uz: "Namangan", en: "Namangan", c: [41.0, 71.65] },
  { id: "an", uz: "Andijon", en: "Andijan", c: [40.78, 72.35] },
  { id: "fa", uz: "Farg'ona", en: "Fergana", c: [40.4, 71.78] },
];

export type MapApi = { flyTo: (lat: number, lon: number, z?: number) => void; startDraw: () => void; toggleEdit: () => void; clear: () => void; fit: (maxZoom: number) => void };

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
  nav,
  navClassName,
  fitMaxZoom = 17,
}: {
  value: GeoJSON.Polygon | null;
  onChange?: (p: GeoJSON.Polygon | null) => void;
  basemap: "sat" | "map";
  apiRef?: React.MutableRefObject<MapApi | null>;
  readOnly?: boolean;
  overlay?: { url: string; opacity: number; maxNativeZoom?: number; attribution?: string; className?: string } | null;
  onMapClick?: (lat: number, lon: number) => void;
  extra?: { polygons?: { coords: GeoJSON.Polygon; label: string; color: string }[]; markers?: { lat: number; lon: number; label: string; color: string }[]; lines?: [number, number][][] };
  /** fit the view to the extra layers (+ the main polygon) whenever they change */
  fitExtra?: boolean;
  /** region picker + "my location" (defaults to on for editable maps) */
  nav?: boolean;
  navClassName?: string;
  /** cap for the automatic fit to the field (e.g. 11 for coarse NASA layers) */
  fitMaxZoom?: number;
}) {
  nav = nav ?? !readOnly;
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
      const m = Lmod.map(el.current, { zoomControl: false, attributionControl: true, maxBounds: UZ_BOUNDS, maxBoundsViscosity: 0.9, minZoom: 5 });
      m.fitBounds(UZ_BOUNDS, { padding: [8, 8] });
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
      applyOverlay();
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
          fit: (maxZoom) => {
            if (shape.current) m.flyToBounds(shape.current.getBounds(), { padding: [48, 48], maxZoom, duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1.1 });
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
    if (fit) m.flyToBounds(layer.getBounds(), { padding: [48, 48], duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1.1, maxZoom: fitMaxZoom });
  }
  function setBase(b: "sat" | "map") {
    const Lm = L.current, m = map.current;
    if (!Lm || !m) return;
    base.current?.remove();
    base.current = (b === "sat" ? Lm.tileLayer(ESRI, { maxZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }) : Lm.tileLayer(OSM, { maxZoom: 19, attribution: "© OpenStreetMap contributors" })).addTo(m);
    base.current.bringToBack();
  }

  useEffect(() => setBase(basemap), [basemap]);  
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
  // Overlay swaps cross-fade: the new date loads on top, the old layer leaves only once the new
  // tiles are in, so scrubbing the timeline never flashes the bare basemap.
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  function applyOverlay() {
    const Lm = L.current, m = map.current, o = overlayRef.current;
    if (!Lm || !m) return;
    const prev = over.current;
    if (!o) {
      prev?.remove();
      over.current = null;
      return;
    }
    const next = Lm.tileLayer(o.url, { opacity: o.opacity, maxNativeZoom: o.maxNativeZoom ?? 9, maxZoom: 19, attribution: o.attribution, crossOrigin: true, className: o.className });
    over.current = next;
    next.addTo(m);
    if (prev) {
      const drop = () => prev.remove();
      next.once("load", drop);
      setTimeout(drop, 2500); // never keep a stale layer if some tiles fail
    }
    shape.current?.bringToFront();
  }
  useEffect(applyOverlay, [overlay?.url]);  
  useEffect(() => {
    if (overlay) over.current?.setOpacity(overlay.opacity);
  }, [overlay?.opacity]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    // isolate: Leaflet's panes use z-index 400-1000; keep them inside the map so the page header stays on top
    <div className="relative isolate h-full w-full">
      <div ref={el} className="h-full w-full" role="region" aria-label="Map" />
      {nav && <MapNav map={map} L={L} className={navClassName} />}
    </div>
  );
}

/** Jump to a region or to the user's own position — nobody should hunt for Uzbekistan by hand. */
function MapNav({ map, L, className }: { map: React.MutableRefObject<Leaflet.Map | null>; L: React.MutableRefObject<typeof Leaflet | null>; className?: string }) {
  const lang = useLang((s) => s.lang);
  const T = (uz: string, en: string) => (lang === "en" ? en : uz);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const here = useRef<Leaflet.Layer | null>(null);
  const fly = (lat: number, lon: number, z: number) => map.current?.flyTo([lat, lon], z, { duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1.2 });
  const locate = () => {
    if (!("geolocation" in navigator)) return setMsg(T("Brauzer joylashuvni aniqlay olmaydi", "This browser cannot locate you"));
    setBusy(true);
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setBusy(false);
        const { latitude: la, longitude: lo } = coords;
        if (la < UZ_BOUNDS[0][0] || la > UZ_BOUNDS[1][0] || lo < UZ_BOUNDS[0][1] || lo > UZ_BOUNDS[1][1]) return setMsg(T("Siz O'zbekistondan tashqaridasiz. Viloyatni ro'yxatdan tanlang", "You are outside Uzbekistan. Pick a region from the list"));
        fly(la, lo, 15);
        const Lm = L.current, m = map.current;
        if (Lm && m) {
          here.current?.remove();
          here.current = Lm.circleMarker([la, lo], { radius: 8, color: "#fff", weight: 3, fillColor: "#1E88E5", fillOpacity: 1 }).addTo(m).bindTooltip(T("Siz shu yerdasiz", "You are here"), { direction: "top" });
        }
      },
      (e) => {
        setBusy(false);
        setMsg(e.code === 1 ? T("Joylashuvga ruxsat berilmadi. Brauzer sozlamalarida ruxsat bering yoki viloyatni tanlang", "Location permission denied. Allow it in the browser or pick a region") : T("Joylashuv aniqlanmadi. Viloyatni tanlang", "Could not get your location. Pick a region"));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };
  return (
    <div className={`absolute z-[500] flex flex-col items-end gap-1.5 ${className ?? "top-3 right-3"}`}>
      <div className="lg flex items-center gap-1 rounded-full p-1">
        <label className="sr-only" htmlFor="region-pick">{T("Viloyat", "Region")}</label>
        <select
          id="region-pick"
          defaultValue=""
          onChange={(e) => {
            const r = REGIONS.find((x) => x.id === e.target.value);
            if (r) fly(r.c[0], r.c[1], 10);
          }}
          className="h-9 max-w-[150px] cursor-pointer rounded-full bg-transparent pr-1 pl-3 text-[13.5px] font-semibold text-[var(--fg)] outline-none"
        >
          <option value="" disabled>
            {T("Viloyat…", "Region…")}
          </option>
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {lang === "en" ? r.en : r.uz}
            </option>
          ))}
        </select>
        <button type="button" onClick={locate} disabled={busy} className="press flex h-9 items-center gap-1.5 rounded-full bg-[var(--fg)] px-3 text-[13px] font-semibold text-[var(--bg)] disabled:opacity-60">
          <LocateFixed size={15} className={busy ? "animate-pulse" : ""} /> {T("Joylashuvim", "My location")}
        </button>
      </div>
      {msg && <p className="lg max-w-[280px] rounded-2xl px-3 py-2 text-right text-[12.5px] font-medium text-[var(--level-high-fg)]">{msg}</p>}
    </div>
  );
}
