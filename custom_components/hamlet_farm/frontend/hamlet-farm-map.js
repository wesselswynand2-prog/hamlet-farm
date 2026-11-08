/* Hamlet Farm – shared satellite map (used by the panel and the dashboard card).
   Leaflet 1.9.4 is bundled in ./leaflet so nothing is loaded from a CDN; only the map tiles come from the internet. */
const BASE = new URL(".", import.meta.url).href;

export const TYPES = {
  pump: { label: "Borehole pump", icon: "mdi:water-pump", roles: ["control", "running", "power", "energy", "fault", "level", "pressure", "flow"] },
  booster: { label: "Pressure pump", icon: "mdi:pump", roles: ["control", "running", "power", "pressure", "flow", "fault"] },
  pivot: { label: "Centre pivot", icon: "mdi:sprinkler-variant", roles: ["control", "running", "angle", "power", "fault", "pressure"] },
  eskom: { label: "Eskom point", icon: "mdi:transmission-tower", roles: ["energy", "power", "supply", "control"] },
  transformer: { label: "Transformer", icon: "mdi:flash-triangle", roles: ["supply", "power", "energy", "fault"] },
  tank: { label: "Tank / dam", icon: "mdi:water", roles: ["level", "flow"] },
  valve: { label: "Valve", icon: "mdi:valve", roles: ["control", "flow", "pressure"] },
  gate: { label: "Gate", icon: "mdi:gate", roles: ["control", "running"] },
  camera: { label: "Camera", icon: "mdi:cctv", roles: [] },
  weather: { label: "Weather station", icon: "mdi:weather-partly-rainy", roles: [] },
  solar: { label: "Solar / inverter", icon: "mdi:solar-power-variant", roles: ["power", "energy", "supply", "fault"] },
  generator: { label: "Generator", icon: "mdi:engine", roles: ["control", "running", "power", "fault"] },
  building: { label: "Building", icon: "mdi:home-outline", roles: ["power", "energy", "control"] },
  other: { label: "Other", icon: "mdi:map-marker", roles: ["control", "running", "power", "energy", "supply", "fault", "level", "pressure", "flow"] },
};
export const ROLES = {
  control: { label: "Switch / relay", hint: "Shelly, Sonoff, contactor relay, valve or gate – gives On / Off buttons", domains: ["switch", "input_boolean", "light", "valve", "cover", "fan"] },
  running: { label: "Running signal", hint: "VFD running, pivot running contact – otherwise worked out from power", domains: ["binary_sensor", "sensor", "switch", "input_boolean"] },
  power: { label: "Power (W / kW)", hint: "Shelly / meter / VFD power", domains: ["sensor", "input_number", "number"] },
  energy: { label: "kWh meter (total)", hint: "The meter's total kWh reading – today and this month are counted from it", domains: ["sensor"] },
  supply: { label: "Supply present", hint: "Voltage, or a 'power on' input – below 150 V shows No power", domains: ["sensor", "binary_sensor", "input_boolean"] },
  fault: { label: "Fault / alarm", hint: "On, or a code other than 0 = fault", domains: ["binary_sensor", "sensor"] },
  level: { label: "Level (%)", hint: "Tank / dam level – 0-1 is read as a fraction", domains: ["sensor", "input_number", "number"] },
  pressure: { label: "Pressure", hint: "", domains: ["sensor", "number"] },
  flow: { label: "Flow", hint: "", domains: ["sensor", "number"] },
  angle: { label: "Pivot position (°)", hint: "0° = north, clockwise – draws the pivot arm", domains: ["sensor", "number", "input_number"] },
};
export const SHAPES = {
  pipe: { label: "Water pipe", color: "#5aaeff", weight: 3, dash: null },
  cable: { label: "Cable 1 000 V", color: "#ff6a00", weight: 3, dash: "14 5 3 5", info: "e.g. 95 mm² 4-core Cu SWA" },
  cable3300: { label: "Cable 3 300 V", color: "#c86bff", weight: 3.5, dash: "14 4 3 4 3 4", info: "e.g. 50 mm² 3-core Cu SWA 3.3 kV" },
  mv: { label: "MV cable", color: "#ff2d55", weight: 4, dash: "18 5", info: "e.g. 11 kV 70 mm² 3-core XLPE" },
  power: { label: "Overhead power line", color: "#ffcc33", weight: 2.5, dash: "8 6", info: "e.g. 22 kV Hare conductor" },
  fence: { label: "Fence", color: "#f2f2f2", weight: 1.5, dash: "2 5" },
  road: { label: "Road", color: "#e0cfa6", weight: 4, dash: null },
  field: { label: "Land / camp", color: "#8fd16a", weight: 2, dash: null },
  sketch: { label: "Drawing", color: "#ff3b30", weight: 4, dash: null },
};
export const SKETCH_COLORS = ["#ff3b30", "#ffcc00", "#ffffff", "#34c759", "#0a84ff", "#ff9500", "#000000"];

/** Length of a line in metres and area of a closed shape in m² (good enough over a farm). */
export function lineLength(coords) {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += distM(coords[i - 1], coords[i]);
  return m;
}
export function distM(a, b) {
  const R = 6371008.8, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function areaM2(c) {
  const R = 6378137, r = Math.PI / 180; let a = 0;
  for (let i = 0; i < c.length; i++) { const [la1, lo1] = c[i]; const [la2, lo2] = c[(i + 1) % c.length];
    a += (lo2 - lo1) * r * (2 + Math.sin(la1 * r) + Math.sin(la2 * r)); }
  return Math.abs((a * R * R) / 2);
}
export const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 1 : 2)} km` : `${Math.round(m)} m`);
export const fmtArea = (m2) => (m2 >= 10000 ? `${(m2 / 10000).toFixed(m2 >= 1e6 ? 0 : 1)} ha` : `${Math.round(m2).toLocaleString()} m²`);
export const CLS_COLOR = {
  run: "#1baf7a", on: "#2a78d6", off: "#5f6368", warn: "#e08a00", bad: "#db4437", offline: "#8a8f96", info: "#ffffff",
};
export const clsColor = (cls, type) => (cls === "on" && (type === "eskom" || type === "transformer" || type === "solar" || type === "generator") ? "#eda100" : CLS_COLOR[cls] || CLS_COLOR.info);

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
export const fmtW = (w) => { w = num(w); if (w === null) return "–"; const a = Math.abs(w); return a >= 1000 ? `${(w / 1000).toFixed(a >= 10000 ? 0 : 1)} kW` : `${Math.round(w)} W`; };

/** One short value to show under the marker. */
export function shortValue(p, st) {
  const v = st?.values || {};
  if (p.type === "transformer") {
    const kva = p.specs?.kva;
    if (v.load_pct !== undefined) return kva ? `${Math.round(v.load_pct)}% · ${kva} kVA` : `${Math.round(v.load_pct)}%`;
    return kva ? `${kva} kVA` : "";
  }
  if (p.type === "pivot" && v.angle !== undefined) return `${Math.round(v.angle)}°`;
  if (v.level !== undefined && (p.type === "tank" || p.type === "pump")) return `${Math.round(v.level)}%`;
  if (v.power_w !== undefined && (st?.running || p.type === "eskom" || p.type === "solar")) return fmtW(v.power_w);
  if (v.level !== undefined) return `${Math.round(v.level)}%`;
  return "";
}

let _leaflet = null;
export function loadLeaflet() {
  if (_leaflet) return _leaflet;
  _leaflet = new Promise((resolve, reject) => {
    if (window.L && window.L.version && window.L.version.startsWith("1.")) { resolve(window.L); return; }
    const s = document.createElement("script");
    s.src = `${BASE}leaflet/leaflet.js`;
    s.onload = () => resolve(window.L);
    s.onerror = () => { _leaflet = null; reject(new Error("Could not load the map library")); };
    document.head.appendChild(s);
  });
  return _leaflet;
}

export const MAP_CSS = `
.hf-map { position: absolute; inset: 0; background: #1d2a1f; }
.leaflet-container { font: inherit; }
.leaflet-control-attribution { font-size: 10px; }
.hf-mk { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: var(--mc); border: 2px solid #fff; box-shadow: 0 1px 6px rgba(0,0,0,.55); color: #fff; position: relative; transition: transform .15s; }
.hf-mk ha-icon { --mdc-icon-size: 20px; }
.hf-mk.info { color: #333; }
.hf-mk.offline { border-style: dashed; opacity: .85; }
.hf-mk.run::after { content: ""; position: absolute; inset: -6px; border-radius: 50%; border: 2px solid var(--mc); animation: hf-ring 1.8s ease-out infinite; }
.hf-mk.bad::after, .hf-mk.warn::after { content: "!"; position: absolute; top: -6px; right: -6px; width: 16px; height: 16px; border-radius: 50%;
  background: #fff; color: var(--mc); font: 700 12px/16px system-ui, sans-serif; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.4); }
.hf-sel .hf-mk { transform: scale(1.25); box-shadow: 0 0 0 4px rgba(255,255,255,.55), 0 1px 8px rgba(0,0,0,.6); }
@keyframes hf-ring { 0% { transform: scale(.85); opacity: .9; } 100% { transform: scale(1.6); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .hf-mk.run::after { animation: none; opacity: .6; } }
.hf-lbl { position: absolute; top: 38px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: 12px; font-weight: 500; color: #fff;
  text-shadow: 0 0 3px #000, 0 0 3px #000, 0 1px 2px #000; pointer-events: none; text-align: center; line-height: 1.25; }
.hf-lbl small { display: block; font-size: 11px; font-weight: 400; opacity: .95; }
.hf-nolabels .hf-lbl { display: none; }
.hf-icon { background: none; border: 0; }
.hf-field-lbl { background: none; border: 0; box-shadow: none; color: #fff; font-size: 12px; font-weight: 500; text-shadow: 0 0 3px #000, 0 0 3px #000; }
.hf-field-lbl::before { display: none; }
.hf-handle { width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 3px solid #2a78d6; box-shadow: 0 1px 5px rgba(0,0,0,.6); cursor: grab; }
.hf-handle.move { width: 26px; height: 26px; background: #2a78d6; border-color: #fff; }
.leaflet-pane.leaflet-offline-pane img { image-rendering: auto; }
.hf-measure-lbl { background: rgba(20,24,28,.85); color: #fff; border: 0; border-radius: 6px; padding: 2px 6px; font-size: 12px; font-weight: 500; box-shadow: none; }
.hf-measure-lbl::before { display: none; }
.hf-field-lbl small { font-weight: 400; }
.hf-vertex { width: 10px; height: 10px; border-radius: 50%; background: #fff; border: 2px solid #2a78d6; }
`;

function destination(lat, lng, bearingDeg, metres) {
  const R = 6371000, br = (bearingDeg * Math.PI) / 180, d = metres / R;
  const la1 = (lat * Math.PI) / 180, lo1 = (lng * Math.PI) / 180;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br));
  const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return [(la2 * 180) / Math.PI, (lo2 * 180) / Math.PI];
}

/** Thin wrapper around a Leaflet map that draws farm points, pivots and lines from a hamlet_farm snapshot. */
export class FarmMap {
  constructor(L, container, { onSelect, onMove, onMapClick, onShapeClick, interactive = true } = {}) {
    this.L = L;
    this.cb = { onSelect, onMove, onMapClick, onShapeClick };
    this.map = L.map(container, { zoomControl: interactive, attributionControl: true, maxZoom: 21, tap: true, scrollWheelZoom: interactive, worldCopyJump: true });
    this.container = container;
    this.markers = new Map(); this.pivots = new Map(); this.shapes = new Map();
    this.shapeLayer = L.layerGroup().addTo(this.map);
    this.pivotLayer = L.layerGroup().addTo(this.map);
    this.markerLayer = L.layerGroup().addTo(this.map);
    this.drawLayer = L.layerGroup().addTo(this.map);
    this.editing = false; this.selected = null; this.base = null;
    this.map.createPane("offline").style.zIndex = 250;   // own photos: above the online map, under lines and points
    this.offline = new Map();
    this.previewLayer = L.layerGroup().addTo(this.map);
    this.map.on("click", (e) => this.cb.onMapClick && this.cb.onMapClick(e.latlng));
    this.setBase("satellite");
    this._ro = new ResizeObserver(() => this.map.invalidateSize());
    this._ro.observe(container);
  }

  destroy() { this._ro.disconnect(); this.map.remove(); }

  setBase(kind) {
    if (kind === this.base) return;
    const L = this.L;
    if (this._baseLayers) this._baseLayers.forEach((l) => this.map.removeLayer(l));
    const esri = (svc) => `https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`;
    const satAttr = "Imagery © Esri, Maxar, Earthstar Geographics";
    let layers;
    if (kind === "map") {
      layers = [L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxNativeZoom: 19, maxZoom: 21, attribution: "© OpenStreetMap contributors" })];
    } else {
      layers = [L.tileLayer(esri("World_Imagery"), { maxNativeZoom: 19, maxZoom: 21, attribution: satAttr })];
      if (kind === "hybrid") {
        layers.push(L.tileLayer(esri("Reference/World_Transportation"), { maxNativeZoom: 19, maxZoom: 21, opacity: 0.8 }));
        layers.push(L.tileLayer(esri("Reference/World_Boundaries_and_Places"), { maxNativeZoom: 19, maxZoom: 21 }));
      }
    }
    layers.forEach((l) => l.addTo(this.map).bringToBack());
    this._baseLayers = layers; this.base = kind;
  }

  setLabels(on) { this.container.classList.toggle("hf-nolabels", !on); }

  setView(view, points, shapes = [], home = null) {
    if (view) { this.map.setView([view.lat, view.lng], view.zoom); return; }
    if (this.fit(points, shapes)) return;
    if (home && (home.lat || home.lng)) this.map.setView([home.lat, home.lng], 16);
    else this.map.setView([-28.5, 24.7], 5);
  }

  fit(points, shapes = []) {
    const ll = [...points.map((p) => [p.lat, p.lng]), ...shapes.flatMap((s) => s.coords)];
    for (const p of points) {   // whole pivot circles
      if (p.type === "pivot" && p.radius > 0) ll.push(destination(p.lat, p.lng, 0, p.radius), destination(p.lat, p.lng, 90, p.radius), destination(p.lat, p.lng, 180, p.radius), destination(p.lat, p.lng, 270, p.radius));
    }
    if (!ll.length) return false;
    if (ll.length === 1) this.map.setView(ll[0], 17);
    else this.map.fitBounds(ll, { padding: [40, 40], maxZoom: 18 });
    return true;
  }

  flyTo(p) { this.map.flyTo([p.lat, p.lng], Math.max(this.map.getZoom(), 17), { duration: 0.6 }); }

  setEditing(on) {
    this.editing = on;
    for (const m of this.markers.values()) { if (on) m.dragging?.enable(); else m.dragging?.disable(); }
    this.container.style.cursor = on ? "crosshair" : "";
  }

  setSelected(id) {
    this.selected = id;
    for (const [pid, m] of this.markers) m.getElement()?.classList.toggle("hf-sel", pid === id);
  }

  _iconHtml(p, st) {
    const cls = st?.cls || "info";
    const val = shortValue(p, st);
    return `<div class="hf-mk ${cls}" style="--mc:${clsColor(cls, p.type)}"><ha-icon icon="${TYPES[p.type]?.icon || "mdi:map-marker"}"></ha-icon></div>
      <div class="hf-lbl">${esc(p.name)}${val ? `<small>${esc(val)}</small>` : ""}</div>`;
  }

  /** Draw / update everything from a snapshot. */
  update(snap) {
    const L = this.L;
    const st = snap.statuses || {};
    const seen = new Set();
    for (const p of snap.points || []) {
      seen.add(p.id);
      const html = this._iconHtml(p, st[p.id]);
      let m = this.markers.get(p.id);
      if (!m) {
        m = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "hf-icon", html, iconSize: [34, 34], iconAnchor: [17, 17] }), draggable: true, keyboard: true, title: p.name, riseOnHover: true });
        m._html = html;
        m.on("click", (e) => { L.DomEvent.stopPropagation(e); this.cb.onSelect && this.cb.onSelect(m._pid); });
        m.on("dragend", () => { const ll = m.getLatLng(); this.cb.onMove && this.cb.onMove(m._pid, ll.lat, ll.lng); });
        m.on("add", () => m.getElement()?.classList.toggle("hf-sel", m._pid === this.selected));
        m._pid = p.id;
        m.addTo(this.markerLayer);
        if (!this.editing) m.dragging?.disable();
        this.markers.set(p.id, m);
      } else {
        const cur = m.getLatLng();
        if (Math.abs(cur.lat - p.lat) > 1e-9 || Math.abs(cur.lng - p.lng) > 1e-9) m.setLatLng([p.lat, p.lng]);
        if (m._html !== html) { m.setIcon(L.divIcon({ className: "hf-icon", html, iconSize: [34, 34], iconAnchor: [17, 17] })); m._html = html; if (!this.editing) m.dragging?.disable(); m.getElement()?.classList.toggle("hf-sel", p.id === this.selected); }
        m.options.title = p.name;
      }
      m.setZIndexOffset(["bad", "warn", "offline"].includes(st[p.id]?.cls) ? 1000 : 0);
      this._pivot(p, st[p.id]);
    }
    for (const [id, m] of this.markers) if (!seen.has(id)) { this.markerLayer.removeLayer(m); this.markers.delete(id); }
    for (const [id, g] of this.pivots) if (!seen.has(id)) { this.pivotLayer.removeLayer(g); this.pivots.delete(id); }
    this._shapes(snap.shapes || []);
  }

  _pivot(p, st) {
    const L = this.L;
    const old = this.pivots.get(p.id);
    if (!(p.type === "pivot" && p.radius > 0)) { if (old) { this.pivotLayer.removeLayer(old); this.pivots.delete(p.id); } return; }
    const run = !!st?.running; const ang = st?.values?.angle;
    const key = `${p.lat},${p.lng},${p.radius},${run},${st?.cls},${ang}`;
    if (old && old._key === key) return;
    if (old) this.pivotLayer.removeLayer(old);
    const color = st?.cls === "bad" ? CLS_COLOR.bad : run ? CLS_COLOR.run : "#cfd8dc";
    const g = L.layerGroup([
      L.circle([p.lat, p.lng], { radius: p.radius, color, weight: 2, opacity: 0.9, fillColor: color, fillOpacity: run ? 0.18 : 0.06, dashArray: run ? null : "6 6", interactive: false }),
    ]);
    if (ang !== undefined && ang !== null) {
      const end = destination(p.lat, p.lng, ang, p.radius);
      g.addLayer(L.polyline([[p.lat, p.lng], end], { color: "#fff", weight: 4, opacity: 0.95, interactive: false }));
      g.addLayer(L.polyline([[p.lat, p.lng], end], { color, weight: 2, opacity: 1, interactive: false }));
      g.addLayer(L.circleMarker(end, { radius: 5, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1, interactive: false }));
    }
    g._key = key;
    g.addTo(this.pivotLayer);
    this.pivots.set(p.id, g);
  }

  // a tap on a line / drawing / land; while measuring or placing (passThrough) the tap goes to the map instead
  _shapeHit(e, id) {
    if (this.passThrough) return;
    this.L.DomEvent.stopPropagation(e);
    this.cb.onShapeClick && this.cb.onShapeClick(id);
  }

  _shapes(shapes) {
    const L = this.L;
    const seen = new Set();
    for (const s of shapes) {
      seen.add(s.id);
      const key = JSON.stringify([s.kind, s.name, s.coords, s.color, s.info]);
      const old = this.shapes.get(s.id);
      if (old && old._key === key + (s.color || "")) continue;
      if (old) this.shapeLayer.removeLayer(old);
      const d = SHAPES[s.kind] || SHAPES.pipe;
      const color = s.kind === "sketch" && s.color ? s.color : d.color;
      const opts = { color, weight: d.weight, dashArray: d.dash, opacity: 0.95, lineCap: "round", lineJoin: "round" };
      let layer;
      if (s.kind === "field") {
        layer = L.polygon(s.coords, { ...opts, fillColor: d.color, fillOpacity: 0.12 });
        layer.bindTooltip(`${esc(s.name)}<br><small>${fmtArea(areaM2(s.coords))}</small>`, { permanent: true, direction: "center", className: "hf-field-lbl" });
      } else if (s.kind === "sketch") {
        const casing = L.polyline(s.coords, { color: color === "#000000" ? "#fff" : "#000", weight: d.weight + 2, opacity: 0.3, interactive: false, lineCap: "round", lineJoin: "round" });
        const line = L.polyline(s.coords, opts);
        layer = L.layerGroup([casing, line]);
        line.on("click", (e) => this._shapeHit(e, s.id));
      } else {
        // dark casing underneath so lines read on satellite imagery
        const casing = L.polyline(s.coords, { color: "#000", weight: d.weight + 2.5, opacity: 0.35, interactive: false });
        const line = L.polyline(s.coords, opts);
        line.bindTooltip(`${esc(s.name)} · ${fmtDist(lineLength(s.coords))}${s.info ? `<br><small>${esc(s.info)}</small>` : ""}`, { sticky: true });
        layer = L.layerGroup([casing, line]);
        line.on("click", (e) => this._shapeHit(e, s.id));
      }
      if (s.kind === "field") layer.on("click", (e) => this._shapeHit(e, s.id));
      layer._key = key + (s.color || "");
      layer.addTo(this.shapeLayer);
      this.shapes.set(s.id, layer);
    }
    for (const [id, l] of this.shapes) if (!seen.has(id)) { this.shapeLayer.removeLayer(l); this.shapes.delete(id); }
  }

  /** Offline farm photos stored on Home Assistant. */
  setOffline(layers, tileUrl) {
    const L = this.L;
    const want = new Map((layers || []).filter((l) => l.visible !== false).map((l) => [l.id, l]));
    for (const [id, tl] of this.offline) if (!want.has(id)) { this.map.removeLayer(tl); this.offline.delete(id); }
    for (const [id, l] of want) {
      if (this.offline.has(id)) continue;
      const b = L.latLngBounds(l.bounds);
      const tl = L.tileLayer(`${tileUrl}/${id}/{z}/{x}/{y}`, {
        pane: "offline", minZoom: Math.max(0, l.minzoom - 3), maxZoom: 21, minNativeZoom: l.minzoom, maxNativeZoom: l.maxzoom,
        bounds: b.pad(0.02), keepBuffer: 4, attribution: esc(l.source || ""),
      });
      tl.addTo(this.map);
      this.offline.set(id, tl);
    }
  }

  /** Dashed outline (photo extent / area to keep). */
  outline(key, bounds, color = "#fff") {
    const L = this.L;
    this._outlines = this._outlines || {};
    if (this._outlines[key]) { this.previewLayer.removeLayer(this._outlines[key]); delete this._outlines[key]; }
    if (!bounds) return;
    this._outlines[key] = L.rectangle(bounds, { color, weight: 2, dashArray: "6 5", fill: key === "area", fillOpacity: 0.06, interactive: false }).addTo(this.previewLayer);
  }

  /** A plain photo laid over the map with two corner handles to line it up. onChange(bounds). */
  alignImage(url, bounds, onChange) {
    const L = this.L;
    this.clearAlign();
    const ov = L.imageOverlay(url, bounds, { opacity: 0.7, interactive: false }).addTo(this.previewLayer);
    const handle = (ll) => L.marker(ll, { draggable: true, icon: L.divIcon({ className: "hf-icon", html: '<div class="hf-handle"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(this.previewLayer);
    const nw = handle([bounds[1][0], bounds[0][1]]), se = handle([bounds[0][0], bounds[1][1]]);
    const mid = L.marker([(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2], { draggable: true,
      icon: L.divIcon({ className: "hf-icon", html: '<div class="hf-handle move"></div>', iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(this.previewLayer);
    const cur = () => { const a = nw.getLatLng(), b = se.getLatLng(); return [[Math.min(a.lat, b.lat), Math.min(a.lng, b.lng)], [Math.max(a.lat, b.lat), Math.max(a.lng, b.lng)]]; };
    const upd = () => { const b = cur(); ov.setBounds(b); mid.setLatLng([(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2]); onChange(b); };
    nw.on("drag", upd); se.on("drag", upd);
    let start;
    mid.on("dragstart", () => { start = { m: mid.getLatLng(), a: nw.getLatLng(), b: se.getLatLng() }; });
    mid.on("drag", () => {
      const m = mid.getLatLng(); const dl = m.lat - start.m.lat, dg = m.lng - start.m.lng;
      nw.setLatLng([start.a.lat + dl, start.a.lng + dg]); se.setLatLng([start.b.lat + dl, start.b.lng + dg]);
      const b = cur(); ov.setBounds(b); onChange(b);
    });
    this._align = { ov };
    onChange(cur());
  }
  setAlignOpacity(v) { this._align?.ov.setOpacity(v); }
  clearAlign() { this.previewLayer.clearLayers(); this._outlines = {}; this._align = null; }
  bounds() { const b = this.map.getBounds(); return [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]]; }

  /** Measuring: draws the line / shape with a distance at every corner. */
  measure(coords, closed) {
    const L = this.L;
    if (!this.measureLayer) this.measureLayer = L.layerGroup().addTo(this.map);
    this.measureLayer.clearLayers();
    if (!coords || !coords.length) return;
    const opts = { color: "#ffeb3b", weight: 3, dashArray: "8 6", interactive: false };
    if (closed && coords.length > 2) L.polygon(coords, { ...opts, fillColor: "#ffeb3b", fillOpacity: 0.15 }).addTo(this.measureLayer);
    else if (coords.length > 1) L.polyline(coords, opts).addTo(this.measureLayer);
    let total = 0;
    coords.forEach((c, i) => {
      if (i) total += distM(coords[i - 1], c);
      const m = L.circleMarker(c, { radius: 5, color: "#000", weight: 1.5, fillColor: "#ffeb3b", fillOpacity: 1, interactive: false }).addTo(this.measureLayer);
      if (i) m.bindTooltip(fmtDist(total), { permanent: true, direction: "right", offset: [8, 0], className: "hf-measure-lbl" });
    });
    if (closed && coords.length > 2) {
      const back = distM(coords[coords.length - 1], coords[0]);
      const mid = [(coords[coords.length - 1][0] + coords[0][0]) / 2, (coords[coords.length - 1][1] + coords[0][1]) / 2];
      L.tooltip({ permanent: true, direction: "center", className: "hf-measure-lbl" }).setLatLng(mid).setContent(fmtDist(back)).addTo(this.measureLayer);
    }
  }

  /** Freehand pen: drag on the map to draw. onStroke(coords) gets each finished stroke. */
  freehand(on, color, onStroke) {
    const L = this.L; const el = this.container; const map = this.map;
    if (this._fh) { el.removeEventListener("pointerdown", this._fh.down, true); window.removeEventListener("pointermove", this._fh.move, true); window.removeEventListener("pointerup", this._fh.up, true); this._fh = null; }
    this._penColor = color;
    if (!on) { map.dragging.enable(); el.style.cursor = this.editing ? "crosshair" : ""; return; }
    map.dragging.disable(); el.style.cursor = "crosshair";
    let pts = null; let live = null;
    const ll = (e) => { const r = el.getBoundingClientRect(); const p = map.containerPointToLatLng(L.point(e.clientX - r.left, e.clientY - r.top)); return [p.lat, p.lng]; };
    const down = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest && e.target.closest(".leaflet-control")) return;
      e.preventDefault(); e.stopPropagation();
      pts = [ll(e)];
      live = L.polyline(pts, { color: this._penColor, weight: 4, opacity: 0.95, lineCap: "round", lineJoin: "round", interactive: false }).addTo(this.drawLayer);
    };
    const move = (e) => {
      if (!pts) return;
      e.preventDefault();
      const p = ll(e); const last = pts[pts.length - 1];
      // skip points closer than ~3 screen pixels, so a stroke stays small
      const a = map.latLngToContainerPoint(last), b = map.latLngToContainerPoint(p);
      if (Math.hypot(a.x - b.x, a.y - b.y) < 3) return;
      pts.push(p); live.setLatLngs(pts);
    };
    const up = () => {
      if (!pts) return;
      const done = pts; pts = null;
      this.drawLayer.removeLayer(live); live = null;
      if (done.length > 1) onStroke(done.slice(0, 2000));
    };
    el.addEventListener("pointerdown", down, true); window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", up, true);
    this._fh = { down, move, up };
  }
  setPenColor(c) { this._penColor = c; }

  /** Line being drawn in edit mode. */
  drawPreview(kind, coords) {
    const L = this.L;
    this.drawLayer.clearLayers();
    if (!coords || !coords.length) return;
    const d = SHAPES[kind] || SHAPES.pipe;
    if (coords.length > 1) {
      (kind === "field" ? L.polygon(coords, { color: d.color, weight: 2, dashArray: "4 4", fillOpacity: 0.1, interactive: false })
        : L.polyline(coords, { color: d.color, weight: d.weight + 1, dashArray: "4 4", interactive: false })).addTo(this.drawLayer);
    }
    coords.forEach((c) => L.marker(c, { icon: L.divIcon({ className: "hf-icon", html: '<div class="hf-vertex"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }), interactive: false }).addTo(this.drawLayer));
  }
  centre() { const c = this.map.getCenter(); return { lat: c.lat, lng: c.lng, zoom: this.map.getZoom() }; }
}
