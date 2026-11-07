/* Hamlet Farm – sidebar panel for Home Assistant: satellite map of the farm with live points. No build step. */
import { TYPES, ROLES, SHAPES, SKETCH_COLORS, MAP_CSS, FarmMap, loadLeaflet, clsColor, esc, num, fmtW, shortValue, lineLength, areaM2, fmtDist, fmtArea } from "./hamlet-farm-map.js";

const fmtMB = (b) => { b = num(b) || 0; return b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(0.1, b / 1e6).toFixed(b >= 1e8 ? 0 : 1)} MB`; };
const fmtKm = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const TILE_KB = 22;   // rough size of one saved tile, for the estimate

const DOMAIN = "hamlet_farm";
const BASE = new URL(".", import.meta.url).href;
const CLS_LABEL = { run: "Running", on: "On", off: "Off", warn: "Attention", bad: "Fault", offline: "Offline", info: "" };
const tstr = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
const dstr = (iso) => { if (!iso) return ""; const d = new Date(iso); return d.toDateString() === new Date().toDateString() ? tstr(iso)
  : `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} ${tstr(iso)}`; };
const fmtKwh = (v) => { v = num(v); return v === null ? "–" : `${v >= 100 ? Math.round(v) : v.toFixed(1)} kWh`; };
const fmtN = (v, d = 1) => { v = num(v); return v === null ? "–" : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString(); };

const STYLE = `
:host {
  display: block; height: 100%;
  background: var(--primary-background-color);
  color: var(--primary-text-color);
  font-family: var(--paper-font-body1_-_font-family, Roboto, system-ui, sans-serif);
  --gap: 16px; --radius: var(--ha-card-border-radius, 12px);
  --card: var(--card-background-color, #fff);
  --muted: var(--secondary-text-color, #6b6b6b);
  --line: var(--divider-color, rgba(127,127,127,.2));
  --accent: var(--primary-color, #03a9f4);
  --c-run: #1baf7a; --c-water: #2a78d6; --c-power: #eda100;
  --c-ok: var(--success-color, #2e9e4f); --c-warn: var(--warning-color, #e08a00); --c-bad: var(--error-color, #db4437);
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.wrap { display: flex; flex-direction: column; height: 100vh; }
.toolbar { display: flex; align-items: center; gap: 8px; height: var(--header-height, 56px); padding: 0 12px; flex: none;
  background: var(--app-header-background-color, var(--primary-color)); color: var(--app-header-text-color, #fff);
  border-bottom: var(--app-header-border-bottom, none); z-index: 2; }
.toolbar .title { font-size: 20px; font-weight: 400; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tabs { display: flex; gap: 4px; overflow-x: auto; }
.tabs button { background: transparent; border: 0; color: inherit; opacity: .7; padding: 8px 12px; font: inherit; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; }
.tabs button[aria-selected="true"] { opacity: 1; border-bottom-color: currentColor; }
.tbtn { font: inherit; font-size: 14px; background: transparent; color: inherit; border: 1px solid color-mix(in srgb, currentColor 45%, transparent);
  border-radius: 999px; padding: 6px 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.tbtn ha-icon { --mdc-icon-size: 18px; }
.tbtn[aria-pressed="true"] { background: var(--app-header-text-color, #fff); color: var(--app-header-background-color, var(--primary-color)); }
.body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 380px; }
@media (max-width: 899px) { .wrap { height: auto; min-height: 100vh; } .body { grid-template-columns: 1fr; grid-template-rows: 58vh auto; } }
.mapbox { position: relative; min-height: 300px; }
.side { overflow-y: auto; padding: var(--gap); display: flex; flex-direction: column; gap: var(--gap); border-left: 1px solid var(--line); }
@media (max-width: 899px) { .side { border-left: 0; overflow: visible; } }
.card { background: var(--card); border-radius: var(--radius); box-shadow: var(--ha-card-box-shadow, none);
  border: 1px solid var(--ha-card-border-color, var(--line)); padding: 16px; min-width: 0; }
h2 { font-size: 16px; font-weight: 500; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; }
h2 .sub { margin-left: auto; font-size: 13px; font-weight: 400; color: var(--muted); }
h3 { font-size: 14px; font-weight: 500; margin: 16px 0 6px; }
.muted { color: var(--muted); } .small { font-size: 13px; }
.loading { padding: 64px; text-align: center; color: var(--muted); }

/* map overlay controls */
.ovl { position: absolute; z-index: 500; display: flex; gap: 6px; }
.ovl.tr { top: 10px; right: 10px; flex-direction: column; align-items: flex-end; }
.ovl.tl { top: 10px; left: 56px; right: 64px; }
@media (max-width: 599px) { .ovl.tl { right: 10px; } .ovl.tr { top: 52px; } }
.ovl.bl { bottom: 22px; left: 10px; right: 10px; justify-content: center; pointer-events: none; }
.ovl.bl > * { pointer-events: auto; }
.mseg { display: inline-flex; background: rgba(20,24,28,.82); border-radius: 10px; overflow: hidden; backdrop-filter: blur(4px); box-shadow: 0 1px 6px rgba(0,0,0,.4); }
.mseg button, .mbtn { font: inherit; font-size: 13px; padding: 7px 11px; border: 0; background: transparent; color: #fff; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
.mseg button[aria-pressed="true"] { background: rgba(255,255,255,.22); }
.mbtn { background: rgba(20,24,28,.82); border-radius: 10px; box-shadow: 0 1px 6px rgba(0,0,0,.4); backdrop-filter: blur(4px); }
.mbtn ha-icon, .mseg ha-icon { --mdc-icon-size: 18px; }
.mbtn[aria-pressed="true"] { background: #ffeb3b; color: #000; }
.banner .big { font-size: 16px; font-weight: 500; font-variant-numeric: tabular-nums; }
.pen { width: 24px; height: 24px; border-radius: 50%; border: 2px solid rgba(255,255,255,.5); cursor: pointer; padding: 0; }
.pen[aria-pressed="true"] { border-color: #fff; box-shadow: 0 0 0 2px rgba(255,255,255,.6); transform: scale(1.1); }
.search { display: flex; flex: 1; max-width: 360px; background: rgba(20,24,28,.82); border-radius: 10px; box-shadow: 0 1px 6px rgba(0,0,0,.4); overflow: hidden; }
.search input { flex: 1; min-width: 0; font: inherit; font-size: 13px; color: #fff; background: transparent; border: 0; padding: 7px 10px; outline: none; }
.search input::placeholder { color: rgba(255,255,255,.65); }
.banner { background: rgba(20,24,28,.88); color: #fff; border-radius: 12px; padding: 10px 12px; font-size: 13px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
  box-shadow: 0 2px 10px rgba(0,0,0,.45); max-width: 640px; }
.banner b { font-weight: 500; }
.banner .btn { background: rgba(255,255,255,.12); color: #fff; border-color: rgba(255,255,255,.3); }
.banner .btn.primary { background: var(--accent); border-color: var(--accent); }
.toast { position: absolute; z-index: 600; left: 50%; top: 56px; transform: translateX(-50%); background: rgba(20,24,28,.9); color: #fff; padding: 8px 14px; border-radius: 10px; font-size: 13px; }

/* summary */
.tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.tile { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tile .lab { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }
.tile .lab ha-icon { --mdc-icon-size: 18px; color: var(--ic, var(--muted)); }
.tile .v { font-size: 22px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile .note { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { font: inherit; font-size: 13px; padding: 5px 11px; border-radius: 999px; border: 1px solid var(--line); background: transparent; color: var(--primary-text-color); cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
.chip ha-icon { --mdc-icon-size: 16px; }
.chip[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }

/* point list */
.list { display: flex; flex-direction: column; }
.row { display: flex; align-items: center; gap: 10px; padding: 9px 4px; border: 0; border-bottom: 1px solid var(--line); background: none; font: inherit;
  color: inherit; text-align: left; cursor: pointer; width: 100%; border-radius: 0; }
.row:last-child { border-bottom: 0; }
.row:hover { background: color-mix(in srgb, var(--accent) 6%, transparent); }
.dot { width: 30px; height: 30px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; background: var(--mc); color: #fff; }
.dot.info { color: #333; border: 1px solid var(--line); }
.dot.offline { opacity: .7; }
.dot ha-icon { --mdc-icon-size: 18px; }
.row .nm { flex: 1; min-width: 0; }
.row .nm div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; }
.row .nm .st { font-size: 12px; color: var(--muted); }
.row .nm .st.bad { color: var(--c-bad); } .row .nm .st.warn { color: var(--c-warn); }
.row .val { font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.empty { padding: 24px 0; text-align: center; color: var(--muted); font-size: 14px; }

/* details */
.dhead { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.dhead .dot { width: 44px; height: 44px; } .dhead .dot ha-icon { --mdc-icon-size: 26px; }
.dhead .t { flex: 1; min-width: 0; } .dhead .t b { display: block; font-size: 18px; font-weight: 500; } .dhead .t span { font-size: 13px; color: var(--muted); }
.iconbtn { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 6px; border-radius: 50%; display: inline-flex; }
.iconbtn:hover { background: color-mix(in srgb, var(--muted) 12%, transparent); }
.badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-size: 14px; font-weight: 500;
  background: color-mix(in srgb, var(--bc, var(--muted)) 14%, transparent); }
.badge .bd { width: 8px; height: 8px; border-radius: 50%; background: var(--bc, var(--muted)); }
.badge.pulse .bd { animation: pulse 1.6s ease-in-out infinite; } @keyframes pulse { 50% { opacity: .3; } }
.reason { font-size: 13px; color: var(--muted); margin-top: 6px; }
.ctl { display: grid; grid-template-columns: repeat(auto-fit, minmax(70px, 1fr)); gap: 6px; margin-top: 14px; }
.ctl button { font: inherit; font-size: 14px; padding: 10px 4px; border-radius: 10px; cursor: pointer; background: transparent; color: var(--primary-text-color);
  border: 1px solid var(--line); display: flex; flex-direction: column; align-items: center; gap: 4px; }
.ctl button ha-icon { --mdc-icon-size: 22px; }
.ctl button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--text-primary-color, #fff); }
.ctl button.confirm { border-color: var(--c-warn); color: var(--c-warn); }
.kv { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.kv:last-child { border-bottom: 0; } .kv span:last-child { font-variant-numeric: tabular-nums; text-align: right; }
.kv button { font: inherit; font-size: 13px; }
.cam { width: 100%; border-radius: 8px; display: block; margin-top: 8px; background: #000; aspect-ratio: 16/9; object-fit: cover; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
.btn { font: inherit; font-size: 14px; padding: 7px 16px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--primary-text-color); cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px; text-decoration: none; }
.btn ha-icon { --mdc-icon-size: 18px; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--text-primary-color, #fff); }
.btn.danger { color: var(--c-bad); border-color: color-mix(in srgb, var(--c-bad) 50%, transparent); }
.btn:disabled { opacity: .5; cursor: default; }
button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.progress { height: 8px; border-radius: 4px; background: var(--line); overflow: hidden; margin: 10px 0 6px; }
.progress i { display: block; height: 100%; background: var(--accent); transition: width .3s; }
.drop { border: 2px dashed var(--line); border-radius: 12px; padding: 16px; text-align: center; font-size: 14px; color: var(--muted); cursor: pointer; display: block; }
.drop:hover { border-color: var(--accent); color: var(--accent); }
.drop input { display: none; }
.photo { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.photo:last-child { border-bottom: 0; } .photo .nm { flex: 1; min-width: 0; } .photo .nm div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.photo .nm .small { color: var(--muted); }
input[type=range] { width: 100%; accent-color: var(--accent); }
.note { font-size: 13px; color: var(--muted); line-height: 1.45; }
.note a { color: var(--accent); }

/* point page ("next screen") */
.body { position: relative; }
.page { position: absolute; inset: 0; z-index: 1100; overflow-y: auto; background: var(--primary-background-color); }
@media (max-width: 899px) { .page { position: fixed; inset: 0; z-index: 1200; } }
.pgwrap { max-width: 1180px; margin: 0 auto; padding: var(--gap); display: flex; flex-direction: column; gap: var(--gap); }
.pghead { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.pghead .dot { width: 48px; height: 48px; } .pghead .dot ha-icon { --mdc-icon-size: 28px; }
.pghead .t { flex: 1; min-width: 160px; } .pghead .t b { display: block; font-size: 22px; font-weight: 500; } .pghead .t span { color: var(--muted); font-size: 14px; }
.pggrid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--gap); align-items: start; }
.pggrid .col { display: flex; flex-direction: column; gap: var(--gap); min-width: 0; }
@media (max-width: 899px) { .pggrid { grid-template-columns: 1fr; } }
.erow { cursor: pointer; } .erow:hover span:first-child { color: var(--accent); }
.composer textarea { min-height: 70px; }
.composer .prev { position: relative; display: inline-block; margin-top: 8px; }
.composer .prev img { max-height: 120px; border-radius: 8px; display: block; }
.composer .prev button { position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,.6); color: #fff; border: 0; border-radius: 50%; width: 26px; height: 26px; cursor: pointer; }
.note { display: flex; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.note:last-child { border-bottom: 0; }
.av { width: 34px; height: 34px; border-radius: 50%; flex: none; background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent);
  display: flex; align-items: center; justify-content: center; font-weight: 500; font-size: 14px; }
.note .nb { flex: 1; min-width: 0; } .note .who { font-size: 14px; } .note .who b { font-weight: 500; } .note .who span { color: var(--muted); font-size: 12px; margin-left: 6px; }
.note p { margin: 4px 0 0; font-size: 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
.note img { margin-top: 8px; max-width: 100%; max-height: 260px; border-radius: 8px; cursor: zoom-in; display: block; }
.ncount { display: inline-flex; align-items: center; gap: 2px; font-size: 12px; color: var(--muted); margin-left: 6px; }
.ncount ha-icon { --mdc-icon-size: 14px; }
.lightbox { position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,.88); display: flex; align-items: center; justify-content: center; cursor: zoom-out; padding: 20px; }
.lightbox img { max-width: 100%; max-height: 100%; border-radius: 6px; }

/* events */
.ev { display: flex; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.ev:last-child { border-bottom: 0; }
.ev i { width: 12px; height: 12px; border-radius: 3px; flex: none; margin-top: 4px; }
.ev .when { font-size: 12px; color: var(--muted); }

/* forms */
.form { display: grid; gap: 2px; }
.field { display: flex; flex-direction: column; gap: 4px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.field.inline { flex-direction: row; align-items: center; justify-content: space-between; }
.field.inline > span { white-space: nowrap; }
.field label { font-size: 14px; } .field .hint { font-size: 12px; color: var(--muted); }
input[type=number], input[type=text], select, textarea { font: inherit; font-size: 14px; padding: 7px 9px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--secondary-background-color, transparent); color: var(--primary-text-color); color-scheme: inherit; width: 100%; }
input[type=number] { width: 100px; } textarea { resize: vertical; min-height: 60px; }
.ent { display: flex; gap: 6px; align-items: center; } .ent input { flex: 1; } .ent .now { font-size: 12px; color: var(--muted); white-space: nowrap; max-width: 90px; overflow: hidden; text-overflow: ellipsis; }
.ent .now.bad { color: var(--c-bad); }
details summary { cursor: pointer; font-size: 14px; color: var(--accent); padding: 10px 0 4px; }
.switch { position: relative; width: 40px; height: 22px; flex: none; display: inline-block; }
.switch input { opacity: 0; width: 0; height: 0; position: absolute; }
.switch span { position: absolute; inset: 0; border-radius: 11px; background: var(--line); cursor: pointer; transition: background .2s; }
.switch span::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .2s; box-shadow: 0 1px 2px rgba(0,0,0,.3); }
.switch input:checked + span { background: var(--accent); } .switch input:checked + span::after { transform: translateX(18px); }
.err { color: var(--c-bad); font-size: 13px; margin-top: 8px; }
.typegrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.typegrid button { font: inherit; font-size: 12px; padding: 8px 2px; border-radius: 10px; border: 1px solid var(--line); background: transparent; color: var(--primary-text-color);
  cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.typegrid button ha-icon { --mdc-icon-size: 20px; }
.typegrid button[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
`;

const ICON = (t) => TYPES[t]?.icon || "mdi:map-marker";

class HamletFarmPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._entries = []; this._entryId = null; this._snap = null; this._sel = null; this._edit = false;
    this._draft = null; this._draw = null; this._filter = "all"; this._labels = true; this._unsub = null; this._confirm = null;
    this._pumps = []; this._isAdmin = false; this._baseOverride = null;
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (this._menuBtn) this._menuBtn.hass = hass;
    if (first) this._init();
    else if (this._snap && this._page) this._renderPage();   // live entity values on the point page
    if (this._pumpCard) this._pumpCard.hass = hass;
  }
  get hass() { return this._hass; }
  set narrow(v) { this._narrow = v; if (this._menuBtn) this._menuBtn.narrow = v; }
  set panel(v) { this._panel = v; }
  set route(v) { this._route = v; }

  connectedCallback() { if (this._hass && !this._unsub && this._entryId) this._subscribe(); }
  disconnectedCallback() { this._unsubscribe(); }
  $(id) { return this.shadowRoot.getElementById(id); }
  _setHTML(el, html) { if (!el || el._html === html) return; el._html = html; el.innerHTML = html; }

  async _init() {
    const root = this.shadowRoot;
    root.innerHTML = `<style>${STYLE}</style><link rel="stylesheet" href="${BASE}leaflet/leaflet.css"><style>${MAP_CSS}</style>
      <div class="wrap">
        <div class="toolbar"><span id="menu"></span><div class="title">Farm map</div><div class="tabs" role="tablist"></div>
          <button class="tbtn" id="editbtn" data-act="edit" hidden aria-pressed="false"><ha-icon icon="mdi:pencil"></ha-icon>Edit</button></div>
        <div class="body">
          <div class="mapbox">
            <div class="hf-map" id="map"></div>
            <div class="ovl tl"><form class="search" id="search"><input id="q" type="text" placeholder="Go to place or GPS: -25.75, 28.19" aria-label="Search place or coordinates"><button class="mbtn" type="submit" aria-label="Search"><ha-icon icon="mdi:magnify"></ha-icon></button></form></div>
            <div class="ovl tr">
              <div class="mseg" id="base"></div>
              <button class="mbtn" data-act="fit" title="Show the whole farm"><ha-icon icon="mdi:fit-to-screen-outline"></ha-icon></button>
              <button class="mbtn" data-act="labels" title="Names on / off"><ha-icon icon="mdi:label-outline"></ha-icon></button>
              <button class="mbtn" data-act="locate" title="My location"><ha-icon icon="mdi:crosshairs-gps"></ha-icon></button>
              <button class="mbtn" data-act="measure" id="measurebtn" title="Measure distance / area" aria-pressed="false"><ha-icon icon="mdi:ruler"></ha-icon></button>
            </div>
            <div class="ovl bl" id="banner"></div>
            <div class="toast" id="toast" hidden></div>
          </div>
          <div class="side" id="side"><div class="card loading">Loading…</div></div>
          <div class="page" id="page" hidden></div>
        </div>
        <div class="lightbox" id="lightbox" hidden><img alt=""></div>
      </div>`;
    const mb = document.createElement("ha-menu-button");
    mb.hass = this._hass; mb.narrow = this._narrow;
    root.getElementById("menu").appendChild(mb);
    this._menuBtn = mb;
    root.addEventListener("click", (ev) => this._click(ev));
    root.getElementById("lightbox").addEventListener("click", (ev) => { ev.currentTarget.hidden = true; });
    root.addEventListener("input", (ev) => this._input(ev));
    root.addEventListener("change", (ev) => this._input(ev));
    root.getElementById("search").addEventListener("submit", (ev) => { ev.preventDefault(); this._search(); });
    try {
      this._entries = await this._hass.callWS({ type: `${DOMAIN}/list` });
    } catch (e) {
      this.$("side").innerHTML = `<div class="card loading">Could not reach the farm integration: ${esc(e.message)}</div>`;
      return;
    }
    if (!this._entries.length) {
      this.$("side").innerHTML = `<div class="card loading">No farm set up yet. Go to Settings → Devices &amp; services → Add integration → Hamlet Farm.</div>`;
      return;
    }
    let L;
    try { L = await loadLeaflet(); } catch (e) { this.$("side").innerHTML = `<div class="card loading">${esc(e.message)}</div>`; return; }
    this._fm = new FarmMap(L, this.$("map"), {
      onSelect: (id) => this._select(id),
      onMove: (id, lat, lng) => this._move(id, lat, lng),
      onMapClick: (ll) => this._mapClick(ll),
      onShapeClick: (id) => this._shapeClick(id),
    });
    let saved = null;
    try { saved = localStorage.getItem("hamlet_farm_entry"); this._labels = localStorage.getItem("hamlet_farm_labels") !== "0"; this._baseOverride = localStorage.getItem("hamlet_farm_base"); } catch (e) { /* storage blocked */ }
    this._fm.setLabels(this._labels);
    await this._selectFarm(this._entries.some((e) => e.entry_id === saved) ? saved : this._entries[0].entry_id);
    const want = new URLSearchParams(location.search).get("point");
    if (want && this._point(want)) { this._fm.flyTo(this._point(want)); this._openPage("point", want); }
  }

  _renderTabs() {
    this._setHTML(this.shadowRoot.querySelector(".tabs"), this._entries.length < 2 ? "" : this._entries.map((e) =>
      `<button role="tab" data-tab="${esc(e.entry_id)}" aria-selected="${e.entry_id === this._entryId}">${esc(e.name)}</button>`).join(""));
  }

  async _selectFarm(id) {
    this._unsubscribe();
    this._entryId = id;
    try { localStorage.setItem("hamlet_farm_entry", id); } catch (e) { /* ignore */ }
    this._renderTabs();
    Object.assign(this, { _snap: null, _sel: null, _draft: null, _draw: null, _first: true });
    try {
      const s = await this._hass.callWS({ type: `${DOMAIN}/state`, entry_id: id });
      this._isAdmin = s.is_admin; this._pumps = s.pumps || [];
      this.$("editbtn").hidden = !this._isAdmin;
      this._apply(s);
    } catch (e) { this.$("side").innerHTML = `<div class="card loading">${esc(e.message)}</div>`; return; }
    this._subscribe();
  }
  async _subscribe() {
    if (!this._entryId || this._unsub) return;
    try {
      this._unsub = await this._hass.connection.subscribeMessage((s) => this._apply(s), { type: `${DOMAIN}/subscribe`, entry_id: this._entryId });
    } catch (e) { console.warn("hamlet_farm subscribe failed", e); }
  }
  _unsubscribe() { if (this._unsub) { this._unsub(); this._unsub = null; } }

  _apply(s) {
    if (s.entry_id !== this._entryId) return;
    this._snap = s;
    this.shadowRoot.querySelector(".toolbar .title").textContent = this._entries.length > 1 ? "Farm map" : s.name;
    const base = this._baseOverride || s.settings?.base || "satellite";
    this._fm.setBase(base);
    this._renderBase(base);
    this._fm.update(this._mapSnap());
    this._fm.setOffline(s.offline, s.tile_url);
    if (this._first) { this._first = false; this._fm.setView(s.view, s.points, s.shapes, { lat: this._hass.config?.latitude, lng: this._hass.config?.longitude }); }
    if (this._sel && !this._point(this._sel)) this._sel = null;
    this._fm.setSelected(this._sel);
    if (!this._draft && !this._typing() && !this._off) this._renderSide();
    if (this._page) { if (this._pageTarget()) this._renderPage(); else this._closePage(); }
    this._renderBanner();
  }

  /** Snapshot for the map, with a new (not yet saved) point shown too. */
  _mapSnap() {
    const s = this._snap; const d = this._draft;
    if (!d || d.kind !== "point" || this._point(d.id)) return s;
    return { ...s, points: [...s.points, { ...d, name: d.name || "New point" }] };
  }
  _typing() { const a = this.shadowRoot.activeElement; return !!(a && a.closest && a.closest("#settings, #editor")); }

  _point(id) { return this._snap?.points.find((p) => p.id === id); }
  _st(id) { return this._snap?.statuses?.[id] || {}; }

  _renderBase(base) {
    const b = (k, l) => `<button data-base="${k}" aria-pressed="${base === k}">${l}</button>`;
    this._setHTML(this.$("base"), b("satellite", "Satellite") + b("hybrid", "Hybrid") + b("map", "Map"));
  }

  _toast(msg) {
    const t = this.$("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(this._tt); this._tt = setTimeout(() => { t.hidden = true; }, 3500);
  }

  /* ------------------------------------------------------------ banner (edit mode) */
  _renderBanner() {
    let html = "";
    if (this._measure) {
      const m = this._measure; const c = m.coords;
      const len = lineLength(m.closed && c.length > 2 ? [...c, c[0]] : c);
      html = `<div class="banner"><ha-icon icon="mdi:ruler"></ha-icon>
        ${c.length < 2 ? `<span>Tap the map (or a point) to measure</span>` : `<span class="big">${m.closed && c.length > 2 ? `${fmtArea(areaM2(c))} · ${fmtDist(len)} round` : fmtDist(len)}</span>`}
        <button class="btn" data-act="mundo" ${c.length ? "" : "disabled"}>Undo</button>
        <button class="btn" data-act="mclose" ${c.length > 2 ? "" : "disabled"} aria-pressed="${m.closed}">${m.closed ? "Line" : "Area"}</button>
        <button class="btn" data-act="mclear" ${c.length ? "" : "disabled"}>Clear</button>
        ${this._isAdmin && c.length > 1 ? `<button class="btn" data-act="msave">Save as line</button>` : ""}
        <button class="btn primary" data-act="measure">Done</button></div>`;
    } else if (this._pen) {
      html = `<div class="banner"><ha-icon icon="mdi:draw"></ha-icon><span>Drag on the map to draw</span>
        ${SKETCH_COLORS.map((c) => `<button class="pen" data-pen="${c}" style="background:${c}" aria-pressed="${this._pen.color === c}" aria-label="Colour ${c}"></button>`).join("")}
        <button class="btn" data-act="penundo" ${this._pen.strokes.length ? "" : "disabled"}>Undo</button>
        <button class="btn primary" data-act="pendone">Done</button></div>`;
    } else if (this._draw) {
      const d = SHAPES[this._draw.kind];
      const n = this._draw.coords.length; const need = this._draw.kind === "field" ? 3 : 2;
      html = `<div class="banner"><ha-icon icon="mdi:vector-polyline"></ha-icon><span>Drawing <b>${esc(d.label.toLowerCase())}</b> – tap the map to add points (${n})</span>
        <button class="btn" data-act="drawundo" ${n ? "" : "disabled"}>Undo</button><button class="btn" data-act="drawcancel">Cancel</button>
        <button class="btn primary" data-act="drawdone" ${n >= need ? "" : "disabled"}>Finish</button></div>`;
    } else if (this._placing) {
      html = `<div class="banner"><ha-icon icon="mdi:map-marker-plus"></ha-icon><span>Tap the map where the new point goes</span>
        <button class="btn" data-act="gpsplace"><ha-icon icon="mdi:crosshairs-gps"></ha-icon>Where I stand</button><button class="btn" data-act="placecancel">Cancel</button></div>`;
    } else if (this._edit) {
      html = `<div class="banner"><ha-icon icon="mdi:pencil"></ha-icon><span><b>Editing</b> – drag to move, tap to change</span>
        <button class="btn primary" data-act="addpoint"><ha-icon icon="mdi:map-marker-plus"></ha-icon>Point</button>
        <button class="btn" data-act="addline"><ha-icon icon="mdi:vector-polyline"></ha-icon>Line / land</button>
        <button class="btn" data-act="pen"><ha-icon icon="mdi:draw"></ha-icon>Draw</button>
        <button class="btn" data-act="saveview" title="Open the map here next time"><ha-icon icon="mdi:crop-free"></ha-icon>Start view</button>
        <button class="btn" data-act="edit">Done</button></div>`;
    }
    this._setHTML(this.$("banner"), html);
    this._fm?.setEditing(this._edit);
    if (this._fm) this._fm.passThrough = !!(this._measure || this._placing || this._draw || this._pen);
  }

  /* ------------------------------------------------------------ side panel */
  _renderSide() {
    if (!this._snap) return;
    if (this._off) return this._renderOffline();
    if (this._draft) return this._renderEditor();
    this._renderOverview();
  }

  _renderOverview() {
    const s = this._snap; const sm = s.summary || {};
    const pts = s.points || [];
    const types = [...new Set(pts.map((p) => p.type))];
    const filt = this._filter;
    let shown = pts.filter((p) => filt === "all" || (filt === "alerts" ? this._st(p.id).alert : p.type === filt));
    const rank = { bad: 0, offline: 1, warn: 2, run: 3, on: 4, off: 5, info: 6 };
    shown = shown.sort((a, b) => (rank[this._st(a.id).cls] ?? 9) - (rank[this._st(b.id).cls] ?? 9) || a.name.localeCompare(b.name));
    const tile = (icon, color, label, v, note) => `<div class="tile"><span class="lab" style="--ic:${color}"><ha-icon icon="${icon}"></ha-icon>${label}</span><span class="v">${v}</span>${note ? `<span class="note">${note}</span>` : ""}</div>`;
    const chip = (k, label, icon) => `<button class="chip" data-filter="${k}" aria-pressed="${filt === k}">${icon ? `<ha-icon icon="${icon}"></ha-icon>` : ""}${label}</button>`;
    const evs = (s.events || []).slice(0, 6);
    const ss = s.settings || {};
    this._setHTML(this.$("side"), `
      <section class="card">
        <h2>${esc(s.name)}<span class="sub">${sm.total || 0} points</span></h2>
        <div class="tiles">
          ${tile("mdi:play-circle-outline", "var(--c-run)", "Running", sm.running ?? 0, "")}
          ${tile("mdi:alert-outline", sm.alerts ? "var(--c-bad)" : "var(--muted)", "Alerts", sm.alerts ?? 0, sm.alerts ? esc(sm.alert_names.slice(0, 2).join(", ")) : "all OK")}
          ${sm.grid_w !== null && sm.grid_w !== undefined ? tile("mdi:transmission-tower", "var(--c-power)", "Eskom now", fmtW(sm.grid_w), "") : ""}
          ${sm.grid_kwh_today !== null && sm.grid_kwh_today !== undefined ? tile("mdi:lightning-bolt", "var(--c-power)", "Eskom today", fmtKwh(sm.grid_kwh_today), "") : ""}
        </div>
      </section>
      <section class="card">
        <h2>Points</h2>
        ${pts.length ? `<div class="chips" style="margin-bottom:8px">${chip("all", "All")}${sm.alerts ? chip("alerts", `Alerts (${sm.alerts})`, "mdi:alert-outline") : ""}${types.map((t) => chip(t, TYPES[t]?.label || t, ICON(t))).join("")}</div>` : ""}
        <div class="list">${shown.map((p) => this._rowHtml(p)).join("") || `<div class="empty">${pts.length ? "Nothing here." : this._isAdmin ? "No points yet – tap <b>Edit</b>, then <b>Point</b>, and tap the map where a pump, pivot or Eskom point is." : "No points on the map yet."}</div>`}</div>
      </section>
      ${evs.length ? `<section class="card"><h2>Alerts<span class="sub">last ${evs.length}</span></h2>
        ${evs.map((e) => `<div class="ev"><i style="background:${e.cls === "ok" ? "var(--c-ok)" : e.cls === "warn" ? "var(--c-warn)" : e.cls === "offline" ? "#8a8f96" : "var(--c-bad)"}"></i>
          <div><b style="font-weight:500">${esc(e.name)}</b>: ${esc(e.text)}<div class="when">${dstr(e.t)}</div></div></div>`).join("")}
        ${ss.notify_service ? `<div class="small muted" style="margin-top:8px">Alerts are also sent to ${esc(ss.notify_service)}</div>` : ""}</section>` : ""}
      ${this._isAdmin ? `<section class="card" id="settings"><h2>Alert settings<span class="sub">admin only</span></h2>
        <div class="form">
          <div class="field"><label for="s_notify">Send alerts to</label><span class="hint">e.g. notify.mobile_app_wynand – blank = Home Assistant notifications only</span>
            <input type="text" id="s_notify" value="${esc(ss.notify_service || "")}" list="dl-notify" placeholder="notify.mobile_app_…"></div>
          <div class="field inline"><label for="s_delay">Alert after<span class="hint" style="display:block">Waits this long so a short blip doesn't alert</span></label>
            <span class="small muted"><input type="number" id="s_delay" min="0" max="3600" value="${esc(ss.alert_delay_s ?? 120)}"> s</span></div>
          <div class="field inline"><label for="s_base">Map style for everyone</label>
            <select id="s_base" style="width:auto">${["satellite", "hybrid", "map"].map((b) => `<option value="${b}" ${ss.base === b ? "selected" : ""}>${b[0].toUpperCase() + b.slice(1)}</option>`).join("")}</select></div>
        </div>
        <datalist id="dl-notify">${Object.keys(this._hass.services?.notify || {}).map((k) => `<option value="notify.${esc(k)}"></option>`).join("")}</datalist>
        <div class="actions"><button class="btn primary" data-act="savesettings">Save</button></div><div class="err" id="serr"></div></section>` : ""}
      ${this._isAdmin ? this._offlineListHtml() : ""}`);
  }

  /* ------------------------------------------------------------ offline farm photo */
  _offlineListHtml() {
    const layers = this._snap.offline || [];
    const total = layers.reduce((a, l) => a + (l.bytes || 0), 0);
    return `<section class="card"><h2>Offline farm photo<span class="sub">${layers.length ? fmtMB(total) + " on Home Assistant" : "admin only"}</span></h2>
      ${layers.map((l) => `<div class="photo"><ha-icon icon="mdi:image-filter-hdr" style="color:var(--muted)"></ha-icon>
        <div class="nm"><div>${esc(l.name)}</div><div class="small">${fmtMB(l.bytes)} · ${l.count.toLocaleString()} tiles · zoom ${l.minzoom}–${l.maxzoom}</div></div>
        <button class="iconbtn" data-offshow="${esc(l.id)}" title="Show on the map"><ha-icon icon="mdi:fit-to-screen-outline"></ha-icon></button>
        <button class="iconbtn" data-offvis="${esc(l.id)}" title="${l.visible === false ? "Turn on" : "Turn off"}"><ha-icon icon="${l.visible === false ? "mdi:eye-off-outline" : "mdi:eye-outline"}"></ha-icon></button>
        <button class="iconbtn" data-offdel="${esc(l.id)}" title="Delete" style="${this._confirm === "off:" + l.id ? "color:var(--c-bad)" : ""}"><ha-icon icon="${this._confirm === "off:" + l.id ? "mdi:delete-alert" : "mdi:delete-outline"}"></ha-icon></button></div>`).join("")}
      ${this._confirm?.startsWith("off:") ? `<div class="small" style="color:var(--c-bad)">Tap the bin again to delete that photo.</div>` : ""}
      <p class="note">${layers.length ? "" : "Keep an aerial photo of the farm on Home Assistant, so the map has a picture even without internet. "}
        Use a CD:NGI aerial photo (GeoTIFF – it places itself) or any JPG / PNG you line up by hand.</p>
      <label class="drop"><input type="file" id="offfile" accept=".tif,.tiff,.jpg,.jpeg,.png,image/tiff,image/jpeg,image/png">
        <ha-icon icon="mdi:upload"></ha-icon> Add a photo (.tif, .jpg, .png)</label>
    </section>`;
  }

  _renderOffline() {
    const o = this._off; const src = o.src;
    let body = "";
    if (o.stage === "loading") {
      body = `<p class="note">Opening ${esc(o.fileName)}…</p>`;
    } else if (o.stage === "error") {
      body = `<div class="err">${esc(o.error)}</div><div class="actions"><button class="btn" data-act="offcancel">Back</button></div>`;
    } else {
      const area = this._offArea();
      const zr = area && src.resM ? this._zoomRange(area, src.resM) : null;
      const n = zr ? this._countTiles(area, zr[0], zr[1]) : 0;
      const kmW = src.bounds ? this._distM([src.bounds[0][0], src.bounds[0][1]], [src.bounds[0][0], src.bounds[1][1]]) : 0;
      const kmH = src.bounds ? this._distM([src.bounds[0][0], src.bounds[0][1]], [src.bounds[1][0], src.bounds[0][1]]) : 0;
      const saving = o.stage === "saving";
      const tooBig = n > 60000;
      body = `
        ${src.kind === "image" ? `<p class="note">Drag the <b>round corners</b> so the photo lines up with the satellite map (roads, dams, pivots). The middle handle moves the whole photo.</p>
          <div class="field"><label for="offop">See-through</label><input type="range" id="offop" min="0.2" max="1" step="0.05" value="${o.opacity ?? 0.7}" ${saving ? "disabled" : ""}></div>` : ""}
        <div class="kv"><span class="muted">Photo</span><span>${src.width.toLocaleString()} × ${src.height.toLocaleString()} px</span></div>
        ${src.bounds ? `<div class="kv"><span class="muted">Covers</span><span>${fmtKm(kmW)} × ${fmtKm(kmH)}</span></div>` : ""}
        ${src.resM ? `<div class="kv"><span class="muted">Detail</span><span>${src.resM < 1 ? Math.round(src.resM * 100) + " cm" : src.resM.toFixed(1) + " m"} per pixel</span></div>` : ""}
        ${src.epsg ? `<div class="kv"><span class="muted">Projection</span><span>EPSG:${src.epsg}</span></div>` : ""}
        ${src.kind === "geotiff" ? `<h3>What to keep</h3><div class="chips">
          <button class="chip" data-offarea="view" aria-pressed="${o.area === "view"}" ${saving ? "disabled" : ""}>The map view now</button>
          <button class="chip" data-offarea="all" aria-pressed="${o.area === "all"}" ${saving ? "disabled" : ""}>The whole photo</button></div>
          <p class="note" style="margin:6px 0 0">${o.area === "view" ? "Zoom the map to the farm – only the part inside the white frame is kept." : "Keeps everything in the photo."}</p>` : ""}
        <div class="form">
          <div class="field"><label for="offname">Name</label><input type="text" id="offname" value="${esc(o.name)}" maxlength="80" ${saving ? "disabled" : ""}></div>
          <div class="field"><label for="offsrc">Credit</label><span class="hint">Shown small at the bottom of the map</span><input type="text" id="offsrc" value="${esc(o.credit)}" maxlength="120" ${saving ? "disabled" : ""}></div>
        </div>
        ${area ? `<div class="kv"><span class="muted">To save</span><span>${n.toLocaleString()} tiles · about ${fmtMB(n * TILE_KB * 1000)} · zoom ${zr[0]}–${zr[1]}</span></div>`
          : `<div class="err">${src.kind === "geotiff" ? "The photo isn't inside the map view – move the map to the farm, or keep the whole photo." : ""}</div>`}
        ${tooBig ? `<div class="err">That's too much for Home Assistant – zoom in to just the farm.</div>` : ""}
        ${saving ? `<div class="progress"><i style="width:${Math.round((o.frac || 0) * 100)}%"></i></div>
          <div class="small muted">${Math.round((o.frac || 0) * 100)}% · ${(o.done || 0).toLocaleString()} tiles saved (${fmtMB(o.bytes || 0)}). Keep this page open.</div>` : ""}
        <div class="actions">
          ${saving ? `<button class="btn" data-act="offstop">Stop</button>`
            : `<button class="btn primary" data-act="offsave" ${area && !tooBig ? "" : "disabled"}><ha-icon icon="mdi:content-save"></ha-icon>Save to Home Assistant</button>
               <button class="btn" data-act="offcancel">Cancel</button>`}
        </div>
        <div class="err" id="oerr">${esc(o.error || "")}</div>`;
    }
    this._setHTML(this.$("side"), `<section class="card" id="offline"><h2>Offline farm photo<span class="sub">${esc(o.fileName)}</span></h2>${body}</section>`);
  }

  async _offOpen(file) {
    this._off = { stage: "loading", fileName: file.name, name: file.name.replace(/\.[^.]+$/, ""), credit: "", area: "view", opacity: 0.7 };
    this._sel = null; this._draft = null;
    this._renderSide();
    try {
      const off = await import("./hamlet-farm-offline.js");
      this._offLib = off;
      const tif = /\.tiff?$/i.test(file.name) || file.type === "image/tiff";
      const src = tif ? await off.openGeoTiff(file) : await off.openImage(file);
      this._off.src = src;
      this._off.stage = "place";
      if (tif) {
        this._off.credit = "Aerial photo © CD:NGI";
        this._fm.outline("photo", src.bounds, "#5aaeff");
        // stay on the farm if the photo covers it, otherwise go to the photo
        if (!off.intersect(this._fm.bounds(), src.bounds)) this._fm.map.fitBounds(src.bounds, { padding: [30, 30] });
        this._offAreaOutline();
      } else {
        // start the photo in the middle of the map view, with the photo's own shape
        const vb = this._fm.bounds(); const L = this._fm.L;
        const c = this._fm.map.getCenter(); const size = this._fm.map.getSize();
        const k = Math.min((size.x * 0.7) / src.width, (size.y * 0.7) / src.height);
        const p = this._fm.map.latLngToContainerPoint(c);
        const nw = this._fm.map.containerPointToLatLng(L.point(p.x - (src.width * k) / 2, p.y - (src.height * k) / 2));
        const se = this._fm.map.containerPointToLatLng(L.point(p.x + (src.width * k) / 2, p.y + (src.height * k) / 2));
        void vb;
        this._fm.alignImage(src.url, [[se.lat, nw.lng], [nw.lat, se.lng]], (b) => { src.setBounds(b); this._offRefresh(); });
      }
      if (!this._offMove) {
        this._offMove = () => { if (this._off?.stage === "place" && this._off.src?.kind === "geotiff") { this._offAreaOutline(); this._offRefresh(); } };
        this._fm.map.on("moveend", this._offMove);
      }
    } catch (e) {
      Object.assign(this._off, { stage: "error", error: e.message || String(e) });
    }
    this._renderSide();
  }

  _offRefresh() { clearTimeout(this._offT); this._offT = setTimeout(() => this._off && this._renderSide(), 80); }
  _offArea() {
    const o = this._off; const src = o?.src; if (!src?.bounds) return null;
    if (src.kind === "image" || o.area === "all") return src.bounds;
    return this._offLib.intersect(this._fm.bounds(), src.bounds);
  }
  _offAreaOutline() { this._fm.outline("area", this._off?.src?.kind === "geotiff" && this._off.area === "view" ? this._offArea() : null, "#ffffff"); }
  _zoomRange(a, r) { return this._offLib.zoomRange(a, r); }
  _countTiles(a, z0, z1) { return this._offLib.countTiles(a, z0, z1); }
  _distM(a, b) { return this._fm.map.distance(a, b); }

  _offClose() {
    if (this._off?.src?.url) URL.revokeObjectURL(this._off.src.url);
    this._off = null; this._fm.clearAlign();
    this._renderSide();
  }

  async _offSave() {
    const o = this._off; const src = o.src; const off = this._offLib;
    o.name = this.$("offname").value.trim() || o.name; o.credit = this.$("offsrc").value.trim();
    const area = this._offArea(); if (!area) return;
    const [z0, z1] = off.zoomRange(area, src.resM);
    Object.assign(o, { stage: "saving", frac: 0, done: 0, bytes: 0, error: "" });
    o.ctrl = new AbortController();
    this._renderSide();
    let layer;
    try {
      layer = await this._ws("offline_create", { layer: { name: o.name, source: o.credit, bounds: area, minzoom: z0, maxzoom: z1 } });
      o.layerId = layer.id;
      let batch = []; let size = 0;
      const flush = async () => {
        if (!batch.length) return;
        const tiles = batch; batch = []; size = 0;
        const res = await this._hass.callApi("POST", `hamlet_farm/upload/${this._entryId}/${layer.id}`, { tiles });
        o.done = res.count; o.bytes = res.bytes;
      };
      await off.makeTiles(src, area, z0, z1, {
        signal: o.ctrl.signal,
        onTile: async (z, x, y, blob, ext) => {
          const b64 = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result).split(",")[1]); fr.onerror = reject; fr.readAsDataURL(blob); });
          batch.push([z, x, y, ext, b64]); size += b64.length;
          if (size > 2_500_000 || batch.length >= 300) await flush();
        },
        onProgress: (frac) => { o.frac = frac; this._renderSide(); },
      });
      await flush();
      await this._ws("offline_finish", { layer_id: layer.id });
      this._toast(`${o.name} saved – ${o.done.toLocaleString()} tiles`);
      this._offClose();
    } catch (e) {
      const stopped = e?.name === "AbortError";
      if (layer) { try { await this._ws("offline_delete", { layer_id: layer.id }); } catch (e2) { /* ignore */ } }
      if (!this._off) return;
      Object.assign(o, { stage: "place", error: stopped ? "Stopped – nothing was kept." : (e.body?.message || e.message || String(e)) });
      this._renderSide();
    }
  }

  _rowHtml(p) {
    const st = this._st(p.id); const cls = st.cls || "info";
    const val = shortValue(p, st);
    return `<button class="row" data-pt="${esc(p.id)}"><span class="dot ${cls}" style="--mc:${clsColor(cls, p.type)}"><ha-icon icon="${ICON(p.type)}"></ha-icon></span>
      <span class="nm"><div>${esc(p.name)}${this._snap.note_counts?.[p.id] ? `<span class="ncount"><ha-icon icon="mdi:note-text-outline"></ha-icon>${this._snap.note_counts[p.id]}</span>` : ""}</div><div class="st ${cls}">${esc(st.status || TYPES[p.type]?.label || "")}</div></span><span class="val">${esc(val)}</span></button>`;
  }

  _renderPointPage(p) {
    const st = this._st(p.id); const v = st.values || {}; const cls = st.cls || "info";
    const color = clsColor(cls, p.type);
    const ent = p.entities || {};
    const H = this._hass;
    const rows = [];
    const kv = (k, val) => rows.push(`<div class="kv"><span class="muted">${k}</span><span>${val}</span></div>`);
    if (v.power_w !== undefined) kv("Power", fmtW(v.power_w));
    if (v.energy_today_kwh !== undefined) kv("Energy today", fmtKwh(v.energy_today_kwh));
    if (v.voltage !== undefined) kv("Voltage", `${v.voltage} V`);
    if (v.level !== undefined) kv("Level", `${fmtN(v.level, 0)}%`);
    if (v.pressure !== undefined) kv("Pressure", `${fmtN(v.pressure, 2)} ${esc(v.pressure_unit || "")}`);
    if (v.flow !== undefined) kv("Flow", `${fmtN(v.flow, 1)} ${esc(v.flow_unit || "")}`);
    if (v.angle !== undefined) kv("Pivot position", `${fmtN(v.angle, 0)}°`);
    if (p.type === "pivot" && p.radius) kv("Pivot size", `${p.radius} m radius · ≈ ${fmtN((Math.PI * p.radius * p.radius) / 10000, 1)} ha`);
    const cams = [];
    for (const e of p.extra || []) {
      const so = H.states[e];
      const name = esc(so?.attributes?.friendly_name || e);
      if (e.startsWith("camera.")) { if (so?.attributes?.entity_picture) cams.push(`<img class="cam" alt="${name}" src="${esc(so.attributes.entity_picture)}&t=${Math.floor(Date.now() / 10000)}">`); continue; }
      const dom = e.split(".")[0];
      const val = so ? `${esc(H.formatEntityState ? H.formatEntityState(so) : `${so.state} ${so.attributes.unit_of_measurement || ""}`)}` : `<span class="muted">not found</span>`;
      const tog = ["switch", "input_boolean", "light"].includes(dom) && so ? ` <button class="btn" style="padding:2px 10px" data-toggle="${esc(e)}">${so.state === "on" ? "Turn off" : "Turn on"}</button>` : "";
      rows.push(`<div class="kv erow" data-more="${esc(e)}"><span class="muted">${name}</span><span>${val}${tog}</span></div>`);
    }
    // controls
    let ctl = "";
    if (p.pump_entry && v.pump_mode !== undefined) {
      const m = v.pump_mode;
      const mb = (k, icon, l) => `<button data-pmode="${k}" aria-pressed="${m === k}"><ha-icon icon="${icon}"></ha-icon>${l}</button>`;
      ctl = `<div class="ctl">${mb("auto", "mdi:auto-mode", "Auto")}${mb("run", "mdi:timer-play-outline", "Run 30m")}${mb("on", "mdi:power", "On")}${mb("off", "mdi:power-off", "Off")}</div>`;
    } else if (ent.control) {
      const dom = ent.control.split(".")[0];
      const so = H.states[ent.control];
      const isOn = so && ["on", "open", "opening"].includes(so.state);
      const [onL, offL, onI, offI] = dom === "cover" || dom === "valve" || p.type === "gate" || p.type === "valve"
        ? ["Open", "Close", "mdi:gate-open", "mdi:gate"] : ["On", "Off", "mdi:power", "mdi:power-off"];
      const b = (k, icon, l, pressed) => {
        const conf = this._confirm === `${p.id}:${k}`;
        return `<button data-ctl="${k}" aria-pressed="${pressed}" class="${conf ? "confirm" : ""}"><ha-icon icon="${icon}"></ha-icon>${conf ? `Tap again` : l}</button>`;
      };
      ctl = `<div class="ctl">${b("on", onI, onL, !!isOn)}${b("off", offI, offL, so ? !isOn : false)}</div>
        ${so ? "" : `<div class="err">${esc(ent.control)} not found</div>`}`;
    }
    // the mapped entities: tap one for Home Assistant's history graph
    const entRows = Object.entries(ent).map(([k, e]) => {
      const so = H.states[e];
      const val = so ? esc(H.formatEntityState ? H.formatEntityState(so) : `${so.state} ${so.attributes.unit_of_measurement || ""}`) : `<span class="muted">not found</span>`;
      return `<div class="kv erow" data-more="${esc(e)}"><span class="muted">${esc(ROLES[k]?.label || k)}<br><small>${esc(so?.attributes?.friendly_name || e)}</small></span><span>${val}</span></div>`;
    });
    const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
    this._setHTML(this.$("pg-head"), `
      <button class="btn" data-act="pageback"><ha-icon icon="mdi:arrow-left"></ha-icon>Map</button>
      <span class="dot ${cls}" style="--mc:${color}"><ha-icon icon="${ICON(p.type)}"></ha-icon></span>
      <div class="t"><b>${esc(p.name)}</b><span>${esc(TYPES[p.type]?.label || "")}</span></div>
      <a class="btn" href="${gmaps}" target="_blank" rel="noopener"><ha-icon icon="mdi:directions"></ha-icon>Directions</a>
      ${p.pump_entry ? `<button class="btn" data-act="openpump"><ha-icon icon="mdi:water-pump"></ha-icon>Pumps page</button>` : ""}
      ${this._isAdmin ? `<button class="btn" data-act="editpoint"><ha-icon icon="mdi:pencil"></ha-icon>Edit</button>` : ""}`);
    this._setHTML(this.$("pg-now"), `<h2>Now</h2>
        ${st.status ? `<span class="badge ${st.running ? "pulse" : ""}" style="--bc:${cls === "info" ? "var(--muted)" : color}"><span class="bd"></span>${esc(st.status)}</span>` : `<p class="note">Nothing linked yet${this._isAdmin ? " – tap Edit to link the pump, pivot or meter" : ""}.</p>`}
        ${v.pump_reason ? `<div class="reason">${esc(v.pump_reason)}</div>` : ""}
        ${ctl}
        ${rows.length ? `<div style="margin-top:14px">${rows.join("")}</div>` : ""}
        ${cams.join("")}`);
    this._setHTML(this.$("pg-info"), `<h2>About</h2>
        ${p.notes ? `<p class="small" style="white-space:pre-wrap;margin:0 0 10px">${esc(p.notes)}</p>` : ""}
        ${entRows.length ? `<h3>Linked to</h3>${entRows.join("")}<div class="small muted" style="margin-top:6px">Tap one to see its history.</div>` : ""}
        <div class="kv"><span class="muted">GPS</span><span>${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</span></div>`);
  }

  _renderShapePage(sh) {
    const d = SHAPES[sh.kind] || SHAPES.pipe;
    const color = sh.kind === "sketch" && sh.color ? sh.color : d.color;
    const closed = sh.kind === "field";
    this._setHTML(this.$("pg-head"), `
      <button class="btn" data-act="pageback"><ha-icon icon="mdi:arrow-left"></ha-icon>Map</button>
      <span class="dot" style="--mc:${color};border:1px solid var(--line)"><ha-icon icon="${closed ? "mdi:vector-square" : sh.kind === "sketch" ? "mdi:draw" : "mdi:vector-polyline"}" style="color:${color === "#ffffff" || color === "#ffcc00" ? "#333" : "#fff"}"></ha-icon></span>
      <div class="t"><b>${esc(sh.name)}</b><span>${esc(d.label)}</span></div>
      ${this._isAdmin ? `<button class="btn" data-act="editshape"><ha-icon icon="mdi:pencil"></ha-icon>Edit</button>` : ""}`);
    this._setHTML(this.$("pg-now"), `<h2>Size</h2>
      ${closed ? `<div class="kv"><span class="muted">Area</span><span>${fmtArea(areaM2(sh.coords))}</span></div>
        <div class="kv"><span class="muted">Distance round</span><span>${fmtDist(lineLength([...sh.coords, sh.coords[0]]))}</span></div>`
        : `<div class="kv"><span class="muted">Length</span><span>${fmtDist(lineLength(sh.coords))}</span></div>`}
      <div class="kv"><span class="muted">Corners</span><span>${sh.coords.length}</span></div>`);
    this._setHTML(this.$("pg-info"), "");
    this.$("pg-info").hidden = true;
  }

  /* ------------------------------------------------------------ point page */
  _pageTarget() {
    const pg = this._page; if (!pg || !this._snap) return null;
    return pg.kind === "point" ? this._point(pg.id) : this._snap.shapes.find((x) => x.id === pg.id);
  }

  _openPage(kind, id) {
    this._page = { kind, id, notes: null };
    this._sel = kind === "point" ? id : null; this._fm.setSelected(this._sel); this._confirm = null;
    const el = this.$("page");
    el.innerHTML = `<div class="pgwrap"><div class="pghead" id="pg-head"></div>
      <div class="pggrid"><div class="col"><section class="card" id="pg-now"></section><div id="pg-pump"></div><section class="card" id="pg-info"></section></div>
        <div class="col"><section class="card" id="pg-log"><h2>Site log<span class="sub" id="pg-count"></span></h2>
          <div class="composer"><textarea id="nt" maxlength="2000" placeholder="What you found, what you did, parts used…"></textarea>
            <div id="npv"></div>
            <div class="actions" style="margin-top:8px">
              <label class="btn"><input type="file" id="np" accept="image/*" hidden><ha-icon icon="mdi:camera"></ha-icon>Photo</label>
              <button class="btn primary" data-act="noteadd" id="nadd"><ha-icon icon="mdi:send"></ha-icon>Add note</button></div>
            <div class="err" id="nerr"></div></div>
          <div id="pg-notes"><div class="note"><span class="muted small">Loading…</span></div></div></section></div></div></div>`;
    el.hidden = false; el.scrollTop = 0;
    this._pumpCard = null;
    const t = this._pageTarget();
    if (kind === "point" && t?.pump_entry) this._mountPumpCard(t.pump_entry);
    this._renderPage();
    this._loadNotes();
  }

  _rerender() { if (this._page) this._renderPage(); else this._renderSide(); }

  _closePage() {
    const pg = this._page; this._page = null; this._pumpCard = null; this._notePhoto = null;
    const el = this.$("page"); el.hidden = true; el.innerHTML = "";
    if (pg?.kind === "point" && this._point(pg.id)) { this._fm.flyTo(this._point(pg.id)); this._fm.setSelected(pg.id); }
    this._sel = null;
    this._fm.map.invalidateSize();
  }

  async _mountPumpCard(pumpEntry) {
    const box = this.$("pg-pump"); if (!box) return;
    try {
      if (!customElements.get("hamlet-pump-card")) await import("/hamlet_pump_static/hamlet-pump-card.js");
    } catch (e) { return; }   // Hamlet Pump not installed
    if (!this._page) return;
    const c = document.createElement("hamlet-pump-card");
    c.setConfig({ type: "custom:hamlet-pump-card", pump: pumpEntry });
    c.hass = this._hass;
    box.replaceChildren(c);
    this._pumpCard = c;
  }

  _renderPage() {
    const t = this._pageTarget(); if (!t || !this.$("pg-head")) return;
    if (this._page.kind === "point") this._renderPointPage(t); else this._renderShapePage(t);
  }

  async _loadNotes() {
    const pg = this._page; if (!pg) return;
    try {
      const r = await this._hass.callWS({ type: `${DOMAIN}/notes`, entry_id: this._entryId, target: pg.id });
      if (this._page !== pg) return;
      Object.assign(pg, { notes: r.notes, me: r.user_id, admin: r.is_admin });
    } catch (e) { pg.notes = []; this.$("nerr").textContent = e.message; }
    this._renderNotes();
  }

  _renderNotes() {
    const pg = this._page; if (!pg || !this.$("pg-notes")) return;
    const notes = pg.notes || [];
    this.$("pg-count").textContent = notes.length ? `${notes.length} note${notes.length > 1 ? "s" : ""}` : "";
    const photo = (id) => `${this._snap.photo_url}/${encodeURIComponent(id)}`;
    this._setHTML(this.$("pg-notes"), notes.length ? notes.map((n) => {
      const mine = pg.admin || (pg.me && n.user_id === pg.me);
      const conf = this._confirm === `note:${n.id}`;
      return `<div class="note"><span class="av">${esc((n.user || "?").trim().charAt(0).toUpperCase())}</span>
        <div class="nb"><div class="who"><b>${esc(n.user || "Someone")}</b><span>${dstr(n.t)}</span></div>
          ${n.text ? `<p>${esc(n.text)}</p>` : ""}
          ${n.photo ? `<img src="${photo(n.photo)}" alt="Photo" loading="lazy" data-photo="${photo(n.photo)}">` : ""}</div>
        ${mine ? `<button class="iconbtn" data-notedel="${esc(n.id)}" title="${conf ? "Tap again to delete" : "Delete"}" style="${conf ? "color:var(--c-bad)" : ""}"><ha-icon icon="${conf ? "mdi:delete-alert" : "mdi:delete-outline"}"></ha-icon></button>` : ""}</div>`;
    }).join("") : `<div class="empty">No notes yet. Add what was done here, with a photo if you like – everyone sees it next time.</div>`);
  }

  async _notePhotoPicked(file) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.82));
      if (this._notePhoto?.url) URL.revokeObjectURL(this._notePhoto.url);
      this._notePhoto = { blob, url: URL.createObjectURL(blob) };
      this.$("npv").innerHTML = `<span class="prev"><img src="${this._notePhoto.url}" alt="Photo to add"><button data-act="notephotox" aria-label="Remove photo">×</button></span>`;
    } catch (e) { this.$("nerr").textContent = "Could not read that photo"; }
  }

  async _noteAdd() {
    const pg = this._page; if (!pg) return;
    const text = this.$("nt").value.trim();
    if (!text && !this._notePhoto) { this.$("nerr").textContent = "Write a note or add a photo"; return; }
    const btn = this.$("nadd"); btn.disabled = true; this.$("nerr").textContent = "";
    try {
      let photo = null;
      if (this._notePhoto) {
        const resp = await this._hass.fetchWithAuth(`/api/${DOMAIN}/photo/${this._entryId}`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: this._notePhoto.blob });
        const j = await resp.json();
        if (!resp.ok) throw new Error(j.message || "Photo upload failed");
        photo = j.photo;
      }
      const r = await this._hass.callWS({ type: `${DOMAIN}/note_add`, entry_id: this._entryId, target: pg.id, text, ...(photo ? { photo } : {}) });
      if (this._page !== pg) return;
      pg.notes = r.notes; this.$("nt").value = ""; this.$("npv").innerHTML = "";
      if (this._notePhoto?.url) URL.revokeObjectURL(this._notePhoto.url);
      this._notePhoto = null;
      this._renderNotes();
    } catch (e) { this.$("nerr").textContent = e.message || String(e); }
    btn.disabled = false;
  }

  /* ------------------------------------------------------------ editor */
  _renderEditor() {
    const d = this._draft;
    if (d.kind === "shape") return this._renderShapeEditor();
    const t = TYPES[d.type] || TYPES.other;
    const H = this._hass;
    const roleField = (k) => {
      const r = ROLES[k]; const val = d.entities[k] || "";
      const so = val ? H.states[val] : null;
      const now = val ? (so ? `${so.state}${so.attributes.unit_of_measurement ? " " + so.attributes.unit_of_measurement : ""}` : "not found") : "";
      return `<div class="field"><label for="e_${k}">${r.label}</label>${r.hint ? `<span class="hint">${r.hint}</span>` : ""}
        <div class="ent"><input type="text" id="e_${k}" data-role="${k}" value="${esc(val)}" list="dl-${k}" placeholder="${r.domains[0]}.…" autocomplete="off" spellcheck="false">
        <span class="now ${so || !val ? "" : "bad"}" title="${esc(now)}">${esc(now)}</span></div></div>`;
    };
    const main = d.pump_entry ? [] : t.roles;
    const others = Object.keys(ROLES).filter((k) => !main.includes(k));
    const lists = Object.keys(ROLES).map((k) => `<datalist id="dl-${k}">${this._entityOptions(ROLES[k].domains)}</datalist>`).join("")
      + `<datalist id="dl-extra">${this._entityOptions(null)}</datalist>`;
    const isNew = !this._point(d.id);
    this._setHTML(this.$("side"), `
      <section class="card" id="editor">
        <h2>${isNew ? "New point" : "Edit point"}<span class="sub"><button class="iconbtn" data-act="canceledit" aria-label="Cancel"><ha-icon icon="mdi:close"></ha-icon></button></span></h2>
        <div class="typegrid">${Object.entries(TYPES).map(([k, v]) => `<button data-type="${k}" aria-pressed="${d.type === k}"><ha-icon icon="${v.icon}"></ha-icon>${v.label}</button>`).join("")}</div>
        <div class="form" style="margin-top:8px">
          <div class="field"><label for="f_name">Name</label><input type="text" id="f_name" data-f="name" value="${esc(d.name)}" maxlength="60" placeholder="${esc(t.label)}"></div>
          ${["pump", "booster", "other"].includes(d.type) && this._pumps.length ? `<div class="field"><label for="f_pump">Hamlet Pump</label><span class="hint">Link a pump from the Pumps page – status, protection and modes come from there</span>
            <select id="f_pump" data-f="pump_entry"><option value="">– not linked –</option>${this._pumps.map((pp) => `<option value="${esc(pp.entry_id)}" ${d.pump_entry === pp.entry_id ? "selected" : ""}>${esc(pp.name)}</option>`).join("")}</select></div>` : ""}
          ${d.type === "pivot" ? `<div class="field inline"><label for="f_radius">Pivot radius<span class="hint" style="display:block">Centre to the last tower – draws the circle</span></label><span class="small muted"><input type="number" id="f_radius" data-f="radius" min="0" max="3000" value="${esc(d.radius)}"> m</span></div>` : ""}
          ${main.map(roleField).join("")}
        </div>
        <details ${d.pump_entry || main.length === 0 ? "open" : ""}><summary>${d.pump_entry ? "Extra sensors" : "More sensors"}</summary><div class="form">${others.map(roleField).join("")}</div></details>
        <div class="form">
          <div class="field"><label for="f_extra">Also show</label><span class="hint">Any other entities, one per line – cameras show a picture, switches get a button</span>
            <textarea id="f_extra" data-f="extra" rows="2" spellcheck="false" placeholder="camera.borehole&#10;sensor.dam_temperature">${esc(d.extra.join("\n"))}</textarea>
            <input type="text" id="f_extra_add" list="dl-extra" placeholder="Search to add…" autocomplete="off"></div>
          ${["tank", "pump", "other"].includes(d.type) || d.entities.level ? `<div class="field inline"><label for="f_low">Low level alert below</label><span class="small muted"><input type="number" id="f_low" data-f="low_level" min="0" max="100" value="${esc(d.low_level)}"> %</span></div>` : ""}
          <div class="field inline"><label for="f_alert">Alert when this point has a problem<span class="hint" style="display:block">Fault, no power, offline, low level</span></label>
            <label class="switch"><input type="checkbox" id="f_alert" data-f="alert" ${d.alert ? "checked" : ""}><span></span></label></div>
          <div class="field"><label for="f_notes">Notes</label><textarea id="f_notes" data-f="notes" maxlength="500" placeholder="e.g. 7.5 kW submersible, 80 m deep. Key at the farm office.">${esc(d.notes)}</textarea></div>
          <div class="field inline"><span class="small muted">GPS ${Number(d.lat).toFixed(6)}, ${Number(d.lng).toFixed(6)}</span><span class="small muted">drag on the map to move</span></div>
        </div>
        ${lists}
        <div class="actions">
          <button class="btn primary" data-act="savepoint">Save</button>
          <button class="btn" data-act="canceledit">Cancel</button>
          ${isNew ? "" : `<button class="btn danger" data-act="deletepoint" style="margin-left:auto">${this._confirm === "del" ? "Tap again to delete" : "Delete"}</button>`}
        </div>
        <div class="err" id="ferr"></div>
      </section>`);
  }

  _renderShapeEditor() {
    const d = this._draft; const isNew = !this._snap.shapes.some((s) => s.id === d.id);
    this._setHTML(this.$("side"), `
      <section class="card" id="editor">
        <h2>${isNew ? "New line" : "Edit line"}<span class="sub"><button class="iconbtn" data-act="canceledit" aria-label="Cancel"><ha-icon icon="mdi:close"></ha-icon></button></span></h2>
        <div class="chips">${Object.entries(SHAPES).map(([k, s]) => `<button class="chip" data-skind="${k}" aria-pressed="${d.shape_kind === k}"><i style="width:14px;height:4px;border-radius:2px;background:${s.color};display:inline-block;outline:1px solid rgba(0,0,0,.3)"></i>${s.label}</button>`).join("")}</div>
        ${d.shape_kind === "sketch" ? `<div class="chips" style="margin-top:8px">${SKETCH_COLORS.map((c) => `<button class="pen" data-scolor="${c}" style="background:${c};border-color:var(--line)" aria-pressed="${(d.color || SKETCH_COLORS[0]) === c}" aria-label="Colour ${c}"></button>`).join("")}</div>` : ""}
        <div class="form" style="margin-top:8px">
          <div class="field"><label for="f_sname">Name</label><input type="text" id="f_sname" data-f="name" value="${esc(d.name)}" maxlength="60" placeholder="${esc(SHAPES[d.shape_kind].label)}"></div>
          <div class="field inline"><span class="small muted">${d.coords.length} points${d.shape_kind === "field" ? ` · ≈ ${fmtN(this._area(d.coords) / 10000, 1)} ha` : ` · ≈ ${fmtN(this._length(d.coords), 0)} m`}</span></div>
        </div>
        <div class="actions">
          <button class="btn primary" data-act="saveshape">Save</button>
          <button class="btn" data-act="canceledit">Cancel</button>
          ${isNew ? "" : `<button class="btn danger" data-act="deleteshape" style="margin-left:auto">${this._confirm === "del" ? "Tap again to delete" : "Delete"}</button>`}
        </div>
        <div class="err" id="ferr"></div>
      </section>`);
  }

  _entityOptions(domains) {
    const key = (domains || ["*"]).join(",");
    this._optCache = this._optCache || {};
    const n = Object.keys(this._hass.states).length;
    if (this._optCache[key]?.n === n) return this._optCache[key].html;
    const html = Object.values(this._hass.states)
      .filter((s) => !domains || domains.includes(s.entity_id.split(".")[0]))
      .sort((a, b) => a.entity_id.localeCompare(b.entity_id))
      .map((s) => `<option value="${esc(s.entity_id)}">${esc(s.attributes.friendly_name || "")}</option>`).join("");
    this._optCache[key] = { n, html };
    return html;
  }

  _length(c) { let m = 0; for (let i = 1; i < c.length; i++) m += this._fm.map.distance(c[i - 1], c[i]); return m; }
  _area(c) {   // spherical polygon area, m²
    const R = 6378137; let a = 0;
    for (let i = 0; i < c.length; i++) { const [la1, lo1] = c[i]; const [la2, lo2] = c[(i + 1) % c.length];
      a += ((lo2 - lo1) * Math.PI / 180) * (2 + Math.sin(la1 * Math.PI / 180) + Math.sin(la2 * Math.PI / 180)); }
    return Math.abs((a * R * R) / 2);
  }

  /* ------------------------------------------------------------ events */
  _select(id) {
    if (this._measure) { const p = this._point(id); if (p) this._mapClick({ lat: p.lat, lng: p.lng }); return; }
    if (this._draw || this._placing || this._pen) return;
    if (this._edit && this._isAdmin) { this._openEditor(id); return; }
    this._draft = null;
    this._openPage("point", id);
  }

  _openEditor(id) {
    const p = this._point(id); if (!p) return;
    this._sel = id; this._fm.setSelected(id); this._confirm = null;
    this._draft = { ...JSON.parse(JSON.stringify(p)), kind: "point" };
    this._renderSide();
  }

  _newPoint(lat, lng) {
    this._placing = false;
    const id = Math.random().toString(16).slice(2, 10);
    this._draft = { kind: "point", id, name: "", type: "pump", lat, lng, entities: {}, extra: [], pump_entry: null, radius: 400, low_level: 20, alert: true, notes: "" };
    this._sel = null; this._fm.setSelected(null);
    this._renderBanner(); this._renderSide();
    this._fm.update(this._mapSnap());   // show the new point on the map straight away
  }

  async _move(id, lat, lng) {
    if (this._draft?.id === id) { this._draft.lat = lat; this._draft.lng = lng; this._renderSide(); if (!this._point(id)) return; }
    const p = this._point(id); if (!p) return;
    try { await this._ws("save_point", { point: { ...p, lat, lng } }); this._toast(`${p.name} moved`); } catch (e) { this._toast(e.message); this._fm.update(this._mapSnap()); }
  }

  _mapClick(ll) {
    if (this._measure) { this._measure.coords.push([ll.lat, ll.lng]); this._fm.measure(this._measure.coords, this._measure.closed); this._renderBanner(); return; }
    if (this._pen) return;
    if (this._draw) { this._draw.coords.push([ll.lat, ll.lng]); this._fm.drawPreview(this._draw.kind, this._draw.coords); this._renderBanner(); return; }
    if (this._placing) { this._newPoint(ll.lat, ll.lng); return; }
    if (this._draft || !this._sel) return;
    this._sel = null; this._fm.setSelected(null); this._renderSide();
  }

  _shapeClick(id) {
    if (this._draw || this._placing || this._measure || this._pen) return;
    if (!this._edit || !this._isAdmin) { this._openPage("shape", id); return; }
    const s = this._snap.shapes.find((x) => x.id === id); if (!s) return;
    this._confirm = null;
    this._draft = { kind: "shape", id: s.id, shape_kind: s.kind, name: s.name, coords: s.coords, color: s.color };
    this._renderSide();
  }

  async _ws(type, extra) {
    const res = await this._hass.callWS({ type: `${DOMAIN}/${type}`, entry_id: this._entryId, ...extra });
    this._apply(res);
    return res.result;
  }

  _gps() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error("This browser can't give a location")); return; }
      navigator.geolocation.getCurrentPosition((pos) => resolve(pos.coords), (err) => reject(new Error(err.code === 1 ? "Location permission denied (needs https, e.g. Nabu Casa)" : "Could not get your location")),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
    });
  }

  async _search() {
    const q = this.$("q").value.trim(); if (!q) return;
    const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) { this._fm.map.flyTo([Number(m[1]), Number(m[2])], 17); return; }
    const hit = this._snap.points.find((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    if (hit) { this._fm.flyTo(hit); this._select(hit.id); return; }
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (j[0]) this._fm.map.flyTo([Number(j[0].lat), Number(j[0].lon)], 15); else this._toast("Not found");
    } catch (e) { this._toast("Search needs internet"); }
  }

  _readForm() {
    const d = this._draft; const root = this.shadowRoot;
    if (d.kind === "shape") { d.name = root.getElementById("f_sname")?.value.trim() || ""; return; }
    root.querySelectorAll("[data-role]").forEach((el) => { const v = el.value.trim(); if (v) d.entities[el.dataset.role] = v; else delete d.entities[el.dataset.role]; });
    root.querySelectorAll("[data-f]").forEach((el) => {
      const f = el.dataset.f;
      if (f === "alert") d.alert = el.checked;
      else if (f === "extra") d.extra = el.value.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
      else if (f === "radius" || f === "low_level") d[f] = Number(el.value) || 0;
      else if (f === "pump_entry") d.pump_entry = el.value || null;
      else d[f] = el.value;
    });
  }

  _input(ev) {
    const el = ev.composedPath()[0];
    if (el?.id === "offfile" && ev.type === "change" && el.files?.[0]) { this._offOpen(el.files[0]); return; }
    if (el?.id === "np" && ev.type === "change" && el.files?.[0]) { this._notePhotoPicked(el.files[0]); el.value = ""; return; }
    if (el?.id === "offop") { this._off.opacity = Number(el.value); this._fm.setAlignOpacity(this._off.opacity); return; }
    if ((el?.id === "offname" || el?.id === "offsrc") && this._off) { this._off[el.id === "offname" ? "name" : "credit"] = el.value; return; }
    if (!this._draft || !el?.id) return;
    if (el.id === "f_extra_add" && ev.type === "change" && el.value.trim()) {
      const ta = this.$("f_extra"); ta.value = (ta.value.trim() ? ta.value.trim() + "\n" : "") + el.value.trim(); el.value = "";
    }
    if (ev.type === "change" && (el.dataset.role || el.id === "f_pump")) { this._readForm(); this._setHTML(this.$("side"), ""); this._renderSide(); }
  }

  async _click(ev) {
    const path = ev.composedPath();
    const t = path.find((e) => e instanceof HTMLElement && (e.dataset?.act || e.dataset?.tab || e.dataset?.pt || e.dataset?.filter || e.dataset?.base
      || e.dataset?.ctl || e.dataset?.pmode || e.dataset?.type || e.dataset?.skind || e.dataset?.toggle
      || e.dataset?.offarea || e.dataset?.offshow || e.dataset?.offvis || e.dataset?.offdel || e.dataset?.pen || e.dataset?.scolor));
    if (!t) return;
    const ds = t.dataset;
    if (ds.tab) { if (ds.tab !== this._entryId) this._selectFarm(ds.tab); return; }
    if (ds.pt) { const p = this._point(ds.pt); if (p) this._fm.flyTo(p); this._select(ds.pt); return; }
    if (ds.filter) { this._filter = ds.filter; this._renderSide(); return; }
    if (ds.base) {
      this._baseOverride = ds.base; try { localStorage.setItem("hamlet_farm_base", ds.base); } catch (e) { /* ignore */ }
      this._fm.setBase(ds.base); this._renderBase(ds.base); return;
    }
    if (ds.type) { this._readForm(); this._draft.type = ds.type; if (ds.type === "pivot" && !this._draft.radius) this._draft.radius = 400; this._renderSide(); return; }
    if (ds.skind) { this._readForm(); this._draft.shape_kind = ds.skind; if (!this._snap.shapes.some((x) => x.id === this._draft.id)) this._fm.drawPreview(ds.skind, this._draft.coords); this._renderSide(); return; }
    if (ds.photo) { const lb = this.$("lightbox"); lb.querySelector("img").src = ds.photo; lb.hidden = false; return; }
    if (ds.more && !path.some((e) => e.dataset?.toggle)) { this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: ds.more }, bubbles: true, composed: true })); return; }
    if (ds.notedel) {
      const key = `note:${ds.notedel}`;
      if (this._confirm !== key) { this._confirm = key; this._renderNotes(); return; }
      this._confirm = null;
      try {
        const r = await this._hass.callWS({ type: `${DOMAIN}/note_delete`, entry_id: this._entryId, target: this._page.id, note_id: ds.notedel });
        this._page.notes = r.notes; this._renderNotes();
      } catch (e) { this._toast(e.message); }
      return;
    }
    if (ds.pen) { this._pen.color = ds.pen; this._fm.setPenColor(ds.pen); this._renderBanner(); return; }
    if (ds.scolor) { this._readForm(); this._draft.color = ds.scolor; this._renderSide(); return; }
    if (ds.offarea) { this._off.area = ds.offarea; this._offAreaOutline(); if (ds.offarea === "all") this._fm.map.fitBounds(this._off.src.bounds, { padding: [30, 30] }); this._renderSide(); return; }
    if (ds.offshow) { const l = this._snap.offline.find((x) => x.id === ds.offshow); if (l) this._fm.map.fitBounds(l.bounds, { padding: [20, 20] }); return; }
    if (ds.offvis) { const l = this._snap.offline.find((x) => x.id === ds.offvis); try { await this._ws("offline_visible", { layer: { id: l.id, visible: l.visible === false } }); } catch (e) { this._toast(e.message); } return; }
    if (ds.offdel) {
      const key = `off:${ds.offdel}`;
      if (this._confirm !== key) { this._confirm = key; this._renderSide(); return; }
      this._confirm = null;
      try { await this._ws("offline_delete", { layer_id: ds.offdel }); this._toast("Photo deleted"); } catch (e) { this._toast(e.message); }
      return;
    }
    if (ds.toggle) { this._hass.callService("homeassistant", "toggle", { entity_id: ds.toggle }); return; }
    if (ds.pmode) {
      const p = this._point(this._sel);
      try { await this._hass.callWS({ type: "hamlet_pump/set_mode", entry_id: p.pump_entry, mode: ds.pmode, ...(ds.pmode === "run" ? { minutes: 30 } : {}) }); }
      catch (e) { this._toast(e.message); }
      return;
    }
    if (ds.ctl) {
      const p = this._point(this._sel); const key = `${p.id}:${ds.ctl}`;
      if (this._confirm !== key) { this._confirm = key; this._rerender(); clearTimeout(this._ct); this._ct = setTimeout(() => { this._confirm = null; this._rerender(); }, 4000); return; }
      this._confirm = null;
      const e = p.entities.control; const dom = e.split(".")[0]; const on = ds.ctl === "on";
      const [svcDom, svc] = dom === "cover" ? ["cover", on ? "open_cover" : "close_cover"] : dom === "valve" ? ["valve", on ? "open_valve" : "close_valve"] : ["homeassistant", on ? "turn_on" : "turn_off"];
      try { await this._hass.callService(svcDom, svc, { entity_id: e }); this._toast(`${p.name}: ${on ? "on" : "off"} sent`); } catch (err) { this._toast(err.message); }
      this._rerender();
      return;
    }
    switch (ds.act) {
      case "measure":
        if (this._measure) { this._measure = null; this._fm.measure(null); }
        else { this._stopPen(); this._measure = { coords: [], closed: false }; }
        this.$("measurebtn").setAttribute("aria-pressed", String(!!this._measure));
        this._renderBanner(); break;
      case "mundo": this._measure.coords.pop(); if (this._measure.coords.length < 3) this._measure.closed = false; this._fm.measure(this._measure.coords, this._measure.closed); this._renderBanner(); break;
      case "mclose": this._measure.closed = !this._measure.closed; this._fm.measure(this._measure.coords, this._measure.closed); this._renderBanner(); break;
      case "mclear": this._measure.coords = []; this._measure.closed = false; this._fm.measure(null); this._renderBanner(); break;
      case "msave": {
        const m = this._measure;
        this._draft = { kind: "shape", id: Math.random().toString(16).slice(2, 10), shape_kind: m.closed && m.coords.length > 2 ? "field" : "pipe", name: "", coords: m.coords.slice() };
        this._measure = null; this._fm.measure(null); this.$("measurebtn").setAttribute("aria-pressed", "false");
        this._edit = true; this.$("editbtn").setAttribute("aria-pressed", "true");
        this._fm.drawPreview(this._draft.shape_kind, this._draft.coords);
        this._renderBanner(); this._renderSide(); break;
      }
      case "pen":
        this._draft = null; this._sel = null; this._fm.setSelected(null);
        this._pen = { color: this._pen?.color || SKETCH_COLORS[0], strokes: [] };
        this._fm.freehand(true, this._pen.color, (coords) => this._saveStroke(coords));
        this._renderBanner(); this._renderSide(); break;
      case "penundo": {
        const id = this._pen.strokes.pop();
        if (id) { try { await this._ws("delete_shape", { shape_id: id }); } catch (e) { this._toast(e.message); } }
        this._renderBanner(); break;
      }
      case "pendone": this._stopPen(); this._renderBanner(); break;
      case "pageback": this._closePage(); break;
      case "noteadd": this._noteAdd(); break;
      case "notephotox": if (this._notePhoto?.url) URL.revokeObjectURL(this._notePhoto.url); this._notePhoto = null; this.$("npv").innerHTML = ""; break;
      case "editshape": {
        const id = this._page.id; this._closePage();
        this._edit = true; this.$("editbtn").setAttribute("aria-pressed", "true"); this._renderBanner(); this._shapeClick(id);
        break;
      }
      case "offsave": this._offSave(); break;
      case "offstop": this._off?.ctrl?.abort(); break;
      case "offcancel": this._offClose(); break;
      case "fit": this._fm.fit(this._snap?.points || [], this._snap?.shapes || []); break;
      case "labels": this._labels = !this._labels; this._fm.setLabels(this._labels); try { localStorage.setItem("hamlet_farm_labels", this._labels ? "1" : "0"); } catch (e) { /* ignore */ } break;
      case "locate":
        try { const c = await this._gps(); this._fm.map.flyTo([c.latitude, c.longitude], 18); this._showMe(c); } catch (e) { this._toast(e.message); }
        break;
      case "edit":
        this._stopPen();
        this._edit = !this._edit; this._draft = null; this._draw = null; this._placing = false; this._fm.drawPreview(null, []);
        this.$("editbtn").setAttribute("aria-pressed", String(this._edit));
        this._fm.update(this._mapSnap()); this._renderBanner(); this._renderSide(); break;
      case "close": this._sel = null; this._fm.setSelected(null); this._renderSide(); break;
      case "editpoint": { const id = this._page?.id || this._sel; if (this._page) this._closePage(); this._edit = true; this.$("editbtn").setAttribute("aria-pressed", "true"); this._renderBanner(); this._openEditor(id); break; }
      case "openpump": {
        const p = this._point(this._page?.id || this._sel);
        try { localStorage.setItem("hamlet_pump_entry", p.pump_entry); } catch (e) { /* ignore */ }
        history.pushState(null, "", "/hamlet-pump"); window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
        break;
      }
      case "addpoint": this._placing = true; this._draft = null; this._renderBanner(); this._renderSide(); break;
      case "placecancel": this._placing = false; this._renderBanner(); break;
      case "gpsplace":
        try { const c = await this._gps(); this._fm.map.flyTo([c.latitude, c.longitude], 18); this._newPoint(c.latitude, c.longitude); } catch (e) { this._toast(e.message); }
        break;
      case "addline": this._draft = null; this._draw = { kind: "pipe", coords: [] }; this._renderBanner(); this._renderSide(); break;
      case "drawundo": this._draw.coords.pop(); this._fm.drawPreview(this._draw.kind, this._draw.coords); this._renderBanner(); break;
      case "drawcancel": this._draw = null; this._fm.drawPreview(null, []); this._renderBanner(); this._renderSide(); break;
      case "drawdone":
        this._draft = { kind: "shape", id: Math.random().toString(16).slice(2, 10), shape_kind: this._draw.kind, name: "", coords: this._draw.coords };
        this._draw = null; this._renderBanner(); this._renderSide(); break;
      case "saveview":
        try { await this._ws("save_view", { view: this._fm.centre() }); this._toast("The map will open here"); } catch (e) { this._toast(e.message); }
        break;
      case "canceledit":
        this._draft = null; this._confirm = null; this._fm.drawPreview(null, []); this._fm.update(this._mapSnap()); this._renderSide(); break;
      case "savepoint": {
        this._readForm();
        const { kind, ...point } = this._draft;
        try {
          const saved = await this._ws("save_point", { point });
          this._draft = null; this._sel = saved.id; this._fm.setSelected(saved.id); this._renderSide(); this._toast("Saved");
        } catch (e) { this.$("ferr").textContent = e.message; }
        break;
      }
      case "deletepoint":
        if (this._confirm !== "del") { this._confirm = "del"; this._renderSide(); return; }
        try { await this._ws("delete_point", { point_id: this._draft.id }); this._draft = null; this._sel = null; this._confirm = null; this._renderSide(); } catch (e) { this.$("ferr").textContent = e.message; }
        break;
      case "saveshape": {
        this._readForm(); const d = this._draft;
        try { await this._ws("save_shape", { shape: { id: d.id, kind: d.shape_kind, name: d.name, coords: d.coords, color: d.color } }); this._draft = null; this._fm.drawPreview(null, []); this._renderSide(); this._toast("Saved"); }
        catch (e) { this.$("ferr").textContent = e.message; }
        break;
      }
      case "deleteshape":
        if (this._confirm !== "del") { this._confirm = "del"; this._renderSide(); return; }
        try { await this._ws("delete_shape", { shape_id: this._draft.id }); this._draft = null; this._confirm = null; this._renderSide(); } catch (e) { this.$("ferr").textContent = e.message; }
        break;
      case "savesettings":
        try {
          await this._ws("save_settings", { settings: { notify_service: this.$("s_notify").value.trim(), alert_delay_s: Number(this.$("s_delay").value) || 0, base: this.$("s_base").value } });
          this._baseOverride = null; try { localStorage.removeItem("hamlet_farm_base"); } catch (e) { /* ignore */ }
          this._toast("Saved");
        } catch (e) { this.$("serr").textContent = e.message; }
        break;
      default: break;
    }
  }

  async _saveStroke(coords) {
    if (!this._pen) return;
    try {
      const saved = await this._ws("save_shape", { shape: { kind: "sketch", name: "Drawing", color: this._pen.color, coords } });
      this._pen?.strokes.push(saved.id);
    } catch (e) { this._toast(e.message); }
    this._renderBanner();
  }
  _stopPen() { if (this._pen) { this._pen = null; this._fm.freehand(false); } }

  _showMe(c) {
    const L = this._fm.L;
    if (this._me) this._fm.map.removeLayer(this._me);
    this._me = L.layerGroup([
      L.circle([c.latitude, c.longitude], { radius: c.accuracy || 10, color: "#4285f4", weight: 1, fillOpacity: 0.12, interactive: false }),
      L.circleMarker([c.latitude, c.longitude], { radius: 7, color: "#fff", weight: 2, fillColor: "#4285f4", fillOpacity: 1, interactive: false }),
    ]).addTo(this._fm.map);
  }
}

if (!customElements.get("hamlet-farm-panel")) customElements.define("hamlet-farm-panel", HamletFarmPanel);
