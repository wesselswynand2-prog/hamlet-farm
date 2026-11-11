/* Hamlet Farm – shared satellite map (used by the panel and the dashboard card).
   Leaflet 1.9.4 is bundled in ./leaflet so nothing is loaded from a CDN; only the map tiles come from the internet. */
const BASE = new URL(".", import.meta.url).href;

export const TYPES = {
  pump: { label: "Borehole pump", icon: "mdi:water-pump", roles: ["control", "running", "power", "energy", "fault", "level", "pressure", "flow", "temperature"] },
  booster: { label: "Pressure pump", icon: "mdi:pump", roles: ["control", "running", "power", "pressure", "flow", "fault", "temperature"] },
  pivot: { label: "Centre pivot", icon: "mdi:sprinkler-variant", roles: ["control", "running", "angle", "power", "fault", "pressure", "temperature"] },
  irrigation: { label: "Irrigation", icon: "mdi:sprinkler", roles: ["control", "running", "power", "pressure", "flow", "fault", "temperature"] },
  eskom: { label: "Eskom point", icon: "mdi:transmission-tower", roles: ["energy", "power", "supply", "control"] },
  transformer: { label: "Transformer", icon: "mdi:flash-triangle", roles: ["supply", "power", "energy", "fault", "temperature"] },
  tank: { label: "Tank / dam", icon: "mdi:water", roles: ["level", "flow", "temperature"] },
  valve: { label: "Valve", icon: "mdi:valve", roles: ["control", "flow", "pressure"] },
  gate: { label: "Gate", icon: "mdi:gate", roles: ["control", "running"] },
  camera: { label: "Camera", icon: "mdi:cctv", roles: [] },
  weather: { label: "Weather station", icon: "mdi:weather-partly-rainy", roles: ["temperature", "humidity"] },
  probe: { label: "Temperature probe", icon: "mdi:thermometer", roles: ["temperature", "humidity"] },
  solar: { label: "Solar / inverter", icon: "mdi:solar-power-variant", roles: ["power", "energy", "supply", "fault"] },
  generator: { label: "Generator", icon: "mdi:engine", roles: ["control", "running", "power", "fault", "temperature"] },
  building: { label: "Building", icon: "mdi:home-outline", roles: ["power", "energy", "control", "temperature"] },
  other: { label: "Other", icon: "mdi:map-marker", roles: ["control", "running", "power", "energy", "supply", "fault", "level", "pressure", "flow", "temperature", "humidity"] },
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
  temperature: { label: "Temperature (°C)", hint: "Outside probe, motor / panel / transformer temperature – shown on the map", domains: ["sensor", "number", "input_number"] },
  humidity: { label: "Humidity (%)", hint: "", domains: ["sensor", "number"] },
};
export const SHAPES = {
  pipe: { label: "Water pipe", color: "#5aaeff", weight: 3, dash: null },
  cable400: { label: "Cable 400 V", color: "#c6ff00", weight: 3, dash: "10 5", info: "e.g. 16 mm² 4-core Cu SWA" },
  cable: { label: "Cable 1 000 V", color: "#ff6a00", weight: 3, dash: "14 5 3 5", info: "e.g. 95 mm² 4-core Cu SWA" },
  cable3300: { label: "Cable 3 300 V", color: "#c86bff", weight: 3.5, dash: "14 4 3 4 3 4", info: "e.g. 50 mm² 3-core Cu SWA 3.3 kV" },
  mv: { label: "MV cable", color: "#ff2d55", weight: 4, dash: "18 5", info: "e.g. 11 kV 70 mm² 3-core XLPE" },
  power: { label: "Overhead power line", color: "#ffcc33", weight: 2.5, dash: "8 6", info: "e.g. 22 kV Hare conductor" },
  fence: { label: "Fence", color: "#f2f2f2", weight: 1.5, dash: "2 5" },
  road: { label: "Road", color: "#e0cfa6", weight: 4, dash: null },
  field: { label: "Land / camp", color: "#8fd16a", weight: 2, dash: null },
  sketch: { label: "Drawing", color: "#ff3b30", weight: 4, dash: null },
  sticky: { label: "Sticky note", color: "#fff176", weight: 0, dash: null },
};
export const WATER_COLOR = "#2f8fff";
export const SKETCH_COLORS = ["#ff3b30", "#ffcc00", "#ffffff", "#34c759", "#0a84ff", "#ff9500", "#000000"];
export const STICKY_COLORS = ["#fff176", "#ffcc80", "#f48fb1", "#a5d6a7", "#90caf9", "#ce93d8", "#ffffff"];

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

/** Colours a point can be given (Edit → point → Colour). */
export const POINT_COLORS = ["#2a78d6", "#03a9f4", "#00a99d", "#1baf7a", "#8bc34a", "#f5c400", "#ff8a00", "#e53935", "#e91e63", "#8e44ad", "#8d6e63", "#607d8b", "#222222", "#ffffff"];
/** Light colours get a dark icon, dark colours a white one. */
export function inkOn(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ""); if (!m) return "#fff";
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#222" : "#fff";
}
/**
 * The marker colour for a point. A colour picked for the point replaces the normal / on / off colours;
 * running, attention, fault and offline keep their status colour so a problem is never hidden.
 */
export function pointColor(p, cls) {
  if (p?.color && ["info", "on", "off"].includes(cls || "info")) return p.color;
  return clsColor(cls || "info", p?.type);
}
export const pointIcon = (p) => p?.icon || TYPES[p?.type]?.icon || "mdi:map-marker";

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
  if ((p.type === "probe" || p.type === "weather") && v.temp !== undefined) return `${v.temp.toFixed(1)} °C${v.humidity !== undefined ? ` · ${v.humidity}%` : ""}`;
  if (p.type === "pivot" && v.angle !== undefined) return `${Math.round(v.angle)}°`;
  if (p.type === "irrigation" && v.zones) { const i = v.zones.findIndex((z) => z.open); if (i >= 0) return `Zone ${i + 1} watering`; }
  if (v.level !== undefined && (p.type === "tank" || p.type === "pump")) return `${Math.round(v.level)}%`;
  if (v.power_w !== undefined && (st?.running || p.type === "eskom" || p.type === "solar")) return fmtW(v.power_w);
  if (v.level !== undefined) return `${Math.round(v.level)}%`;
  if (v.temp !== undefined) return `${v.temp.toFixed(1)} °C`;
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
.leaflet-interactive:focus { outline: none; }
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
.hf-watering { animation: hf-water 2.4s ease-in-out infinite; }
@keyframes hf-water { 50% { fill-opacity: .2; } }
.hf-field-lbl .hf-zone.on { color: #bfe0ff; font-weight: 500; }
@media (prefers-reduced-motion: reduce) { .hf-watering { animation: none; } }
.hf-handle { width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 3px solid #2a78d6; box-shadow: 0 1px 5px rgba(0,0,0,.6); cursor: grab; }
.hf-handle.move { width: 26px; height: 26px; background: #2a78d6; border-color: #fff; }
.leaflet-pane.leaflet-offline-pane img { image-rendering: auto; }
.hf-measure-lbl { background: rgba(20,24,28,.85); color: #fff; border: 0; border-radius: 6px; padding: 2px 6px; font-size: 12px; font-weight: 500; box-shadow: none; }
.hf-measure-lbl::before { display: none; }
.hf-sticky-wrap { background: none; border: 0; }
.hf-sticky { position: absolute; left: -6px; top: -6px; width: max-content; max-width: 170px; min-width: 60px; padding: 7px 9px 8px; border-radius: 2px 2px 10px 2px;
  color: #222; font: 12px/1.3 system-ui, sans-serif; box-shadow: 1px 3px 8px rgba(0,0,0,.45); transform: rotate(-2deg); cursor: pointer; white-space: pre-wrap; word-break: break-word; }
.hf-sticky::before { content: ""; position: absolute; left: 1px; top: 1px; width: 10px; height: 10px; border-radius: 50%; background: #d32f2f; box-shadow: 0 1px 2px rgba(0,0,0,.5); }
.hf-sticky b { display: block; font-size: 12.5px; margin: 0 0 2px 6px; }
.hf-sticky span { display: block; max-height: 9.2em; overflow: hidden; }
.hf-sticky.plan { opacity: .82; outline: 2px dashed rgba(0,0,0,.45); outline-offset: -3px; }
.hf-sticky.plan::after { content: "planning"; position: absolute; right: 4px; bottom: -15px; font-size: 10px; color: #fff; text-shadow: 0 0 3px #000; }
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
  constructor(L, container, { onSelect, onMove, onMapClick, onShapeClick, onShapeMove, interactive = true } = {}) {
    this.L = L;
    this.cb = { onSelect, onMove, onMapClick, onShapeClick, onShapeMove };
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
      // Esri street map: OpenStreetMap's own servers block Home Assistant (no Referer header is sent) – "403 Access blocked"
      layers = [L.tileLayer(esri("World_Street_Map"), { maxNativeZoom: 18, maxZoom: 21, attribution: "Map © Esri, HERE, Garmin, OpenStreetMap contributors" })];
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
    for (const m of [...this.markers.values(), ...[...this.shapes.values()].filter((x) => x._sticky)]) { if (on) m.dragging?.enable(); else m.dragging?.disable(); }
    this.container.style.cursor = on ? "crosshair" : "";
  }

  setSelected(id) {
    this.selected = id;
    for (const [pid, m] of this.markers) m.getElement()?.classList.toggle("hf-sel", pid === id);
  }

  _iconHtml(p, st) {
    const cls = st?.cls || "info";
    const val = shortValue(p, st);
    const col = pointColor(p, cls); const custom = col !== clsColor(cls, p.type);
    return `<div class="hf-mk ${custom ? "custom" : cls}" style="--mc:${col};${custom ? `color:${inkOn(col)}` : ""}"><ha-icon icon="${esc(pointIcon(p))}"></ha-icon></div>
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
    this._shapes(snap.shapes || [], snap.watering || {});
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

  _shapes(shapes, watering = {}) {
    const L = this.L;
    const seen = new Set();
    for (const s of shapes) {
      if (this.shapeFilter && !this.shapeFilter(s)) continue;
      seen.add(s.id);
      const wz = s.kind === "field" ? watering[s.id] : null;   // an irrigation zone on this land
      const key = JSON.stringify([s.kind, s.name, s.coords, s.color, s.info, s.show_len, s.hidden, s.kind === "sticky" ? s.notes : "", wz ? [wz.name, wz.open] : null]);
      const old = this.shapes.get(s.id);
      if (old && old._key === key + (s.color || "")) continue;
      if (old) this.shapeLayer.removeLayer(old);
      if (s.kind === "sticky") { this._sticky(s, key); continue; }
      const d = SHAPES[s.kind] || SHAPES.pipe;
      const color = s.kind === "sketch" && s.color ? s.color : d.color;
      const opts = { color, weight: d.weight, dashArray: d.dash, opacity: s.hidden ? 0.6 : 0.95, lineCap: "round", lineJoin: "round" };
      // wide invisible line on top, so a thin line is easy to tap
      const hit = () => { const h = L.polyline(s.coords, { opacity: 0, weight: 20, lineCap: "round" }); h.on("click", (e) => this._shapeHit(e, s.id)); return h; };
      let layer;
      if (s.kind === "field") {
        if (wz && wz.open) {
          // zone watering now: blue, gently pulsing
          layer = L.polygon(s.coords, { ...opts, color: WATER_COLOR, weight: 3, fillColor: WATER_COLOR, fillOpacity: 0.38, className: "hf-watering" });
        } else {
          layer = L.polygon(s.coords, { ...opts, fillColor: d.color, fillOpacity: 0.12, ...(wz ? { dashArray: "6 4" } : {}) });
        }
        const zn = `Zone ${wz ? wz.zone + 1 : ""}${wz && wz.name && wz.name.toLowerCase() !== s.name.toLowerCase() && wz.name !== `Zone ${wz.zone + 1}` ? ` · ${esc(wz.name)}` : ""}`;
        const zl = wz ? `<br><small class="hf-zone ${wz.open ? "on" : ""}">${zn}${wz.open ? " · watering" : ""}</small>` : "";
        layer.bindTooltip(`${esc(s.name)}<br><small>${fmtArea(areaM2(s.coords))}</small>${zl}`, { permanent: true, direction: "center", className: "hf-field-lbl" });
      } else if (s.kind === "sketch") {
        const casing = L.polyline(s.coords, { color: color === "#000000" ? "#fff" : "#000", weight: d.weight + 2, opacity: 0.3, interactive: false, lineCap: "round", lineJoin: "round" });
        const line = L.polyline(s.coords, { ...opts, interactive: false });
        const h = hit();
        h.bindTooltip(`${esc(s.name)}${s.hidden ? " (planning)" : ""} · ${fmtDist(lineLength(s.coords))}`, { sticky: true });
        layer = L.layerGroup([casing, line, h]);
      } else {
        // dark casing underneath so lines read on satellite imagery
        const casing = L.polyline(s.coords, { color: "#000", weight: d.weight + 2.5, opacity: 0.35, interactive: false });
        const line = L.polyline(s.coords, { ...opts, interactive: false });
        const h = hit();
        h.bindTooltip(`${esc(s.name)}${s.hidden ? " (planning)" : ""} · ${fmtDist(lineLength(s.coords))}${s.info ? `<br><small>${esc(s.info)}</small>` : ""}`, { sticky: true });
        layer = L.layerGroup([casing, line, h]);
      }
      if (s.kind === "field") layer.on("click", (e) => this._shapeHit(e, s.id));
      if (s.show_len && s.kind !== "field" && s.coords.length > 1) {
        // length written at the end of the line
        L.tooltip({ permanent: true, direction: "right", offset: [8, 0], className: "hf-measure-lbl", interactive: false })
          .setLatLng(s.coords[s.coords.length - 1]).setContent(fmtDist(lineLength(s.coords))).addTo(layer);
      }
      layer._key = key + (s.color || "");
      layer.addTo(this.shapeLayer);
      this.shapes.set(s.id, layer);
    }
    for (const [id, l] of this.shapes) if (!seen.has(id)) { this.shapeLayer.removeLayer(l); this.shapes.delete(id); }
  }

  /** A sticky note pinned on the map (top-left corner on its spot). Dragged to move while editing. */
  _sticky(s, key) {
    const L = this.L;
    const title = s.name && s.name !== "Sticky note" ? s.name : "";
    const txt = (s.notes || "").length > 220 ? `${s.notes.slice(0, 220)}…` : s.notes || "";
    const html = `<div class="hf-sticky${s.hidden ? " plan" : ""}" style="background:${esc(s.color || STICKY_COLORS[0])}">${title ? `<b>${esc(title)}</b>` : ""}${txt ? `<span>${esc(txt)}</span>` : ""}</div>`;
    const m = L.marker(s.coords[0], { icon: L.divIcon({ className: "hf-sticky-wrap", html, iconSize: [0, 0] }), draggable: true, keyboard: true, title: title || txt.slice(0, 60), zIndexOffset: 500 });
    if (!this.editing) m.dragging?.disable();
    m.on("add", () => { if (!this.editing) m.dragging?.disable(); });
    m.on("click", (e) => this._shapeHit(e, s.id));
    m.on("dragend", () => { const ll = m.getLatLng(); this.cb.onShapeMove && this.cb.onShapeMove(s.id, ll.lat, ll.lng); });
    m._key = key + (s.color || ""); m._sticky = true;
    m.addTo(this.shapeLayer);
    this.shapes.set(s.id, m);
  }

  /** Offline farm photos stored on Home Assistant. */
  setOffline(layers, tileUrl, show = true) {
    const L = this.L;
    const want = new Map((show ? layers || [] : []).filter((l) => l.visible !== false).map((l) => [l.id, l]));
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
  freehand(on, color, onStroke, showLen = () => false) {
    const L = this.L; const el = this.container; const map = this.map;
    if (this._fh) { el.removeEventListener("pointerdown", this._fh.down, true); window.removeEventListener("pointermove", this._fh.move, true); window.removeEventListener("pointerup", this._fh.up, true); this._fh = null; }
    this._penColor = color;
    if (!on) { map.dragging.enable(); el.style.cursor = this.editing ? "crosshair" : ""; return; }
    map.dragging.disable(); el.style.cursor = "crosshair";
    let pts = null; let live = null; let liveLbl = null;
    const ll = (e) => { const r = el.getBoundingClientRect(); const p = map.containerPointToLatLng(L.point(e.clientX - r.left, e.clientY - r.top)); return [p.lat, p.lng]; };
    const down = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest && e.target.closest(".leaflet-control")) return;
      e.preventDefault(); e.stopPropagation();
      pts = [ll(e)];
      live = L.polyline(pts, { color: this._penColor, weight: 4, opacity: 0.95, lineCap: "round", lineJoin: "round", interactive: false }).addTo(this.drawLayer);
      liveLbl = showLen() ? L.tooltip({ permanent: true, direction: "right", offset: [12, 0], className: "hf-measure-lbl" }).setLatLng(pts[0]).setContent("0 m").addTo(this.drawLayer) : null;
    };
    const move = (e) => {
      if (!pts) return;
      e.preventDefault();
      const p = ll(e); const last = pts[pts.length - 1];
      // skip points closer than ~3 screen pixels, so a stroke stays small
      const a = map.latLngToContainerPoint(last), b = map.latLngToContainerPoint(p);
      if (Math.hypot(a.x - b.x, a.y - b.y) < 3) return;
      pts.push(p); live.setLatLngs(pts);
      if (liveLbl) liveLbl.setLatLng(p).setContent(fmtDist(lineLength(pts)));
    };
    const up = () => {
      if (!pts) return;
      const done = pts; pts = null;
      this.drawLayer.removeLayer(live); live = null;
      if (liveLbl) { this.drawLayer.removeLayer(liveLbl); liveLbl = null; }
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

/**
 * Read GPS coordinates typed or pasted in any common form. Returns { lat, lng } or null.
 *  -25.861234, 28.103456   |   -25.861234 28.103456
 *  25°51'40.4"S 28°06'12.4"E   |   S25 51 40.4 E28 06 12.4   |   S 25° 51.673' E 28° 6.207'
 *  a Google Maps link (…/@-25.86,28.10,15z or ?q=-25.86,28.10)
 */
export function parseGPS(text) {
  let s = String(text || "").trim();
  if (!s) return null;
  const ok = (lat, lng) => (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null);
  // plain decimal pair
  let m = s.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
  if (m && (!(m[1].includes(",") && m[2].includes(",")) || s.includes(";"))) return ok(Number(m[1].replace(",", ".")), Number(m[2].replace(",", ".")));
  // a link or text with "lat,lng" inside
  if (/https?:|maps|@/i.test(s)) {
    m = s.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
    if (m) return ok(Number(m[1]), Number(m[2]));
  }
  // degrees / minutes / seconds with N S E W
  s = s.toUpperCase().replace(/[°º˚]/g, " ").replace(/[′'’]/g, " ").replace(/[″"”]/g, " ").replace(/,/g, " ");
  if (/^[NSEW]/.test(s)) s = s.replace(/([NSEW])\s*([^NSEW]+)/g, "$2$1 ");   // letter before the numbers -> after
  const parts = s.split(/(?<=[NSEW])/).map((x) => x.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const val = (p) => {
    const hemi = p.slice(-1); const nums = (p.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (!nums.length || nums.length > 3 || !"NSEW".includes(hemi)) return null;
    const v = nums[0] + (nums[1] || 0) / 60 + (nums[2] || 0) / 3600;
    return { hemi, v: hemi === "S" || hemi === "W" ? -v : v };
  };
  const a = val(parts[0]), b = val(parts[1]);
  if (!a || !b) return null;
  const lat = "NS".includes(a.hemi) ? a : b, lng = "EW".includes(a.hemi) ? a : b;
  if (lat === lng) return null;
  return ok(+lat.v.toFixed(7), +lng.v.toFixed(7));
}
