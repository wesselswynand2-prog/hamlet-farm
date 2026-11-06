/* Hamlet Farm – dashboard card: the farm's satellite map with live points. Tap a point to open it on the Farm map page. */
import { MAP_CSS, FarmMap, TYPES, loadLeaflet, clsColor, esc, shortValue } from "./hamlet-farm-map.js";

const DOMAIN = "hamlet_farm";
const BASE = new URL(".", import.meta.url).href;

class HamletFarmCard extends HTMLElement {
  static getStubConfig() { return { height: 400 }; }
  static getConfigElement() { return document.createElement("hamlet-farm-card-editor"); }

  setConfig(config) {
    this._config = { height: 400, labels: true, ...config };
    if (this._root) this._root.querySelector(".box").style.height = `${Number(this._config.height) || 400}px`;
  }
  getCardSize() { return Math.ceil((Number(this._config?.height) || 400) / 50) + 1; }
  getGridOptions() { return { columns: 12, rows: Math.ceil((Number(this._config?.height) || 400) / 56) + 1, min_columns: 6 }; }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._init();
  }

  connectedCallback() { if (this._hass && this._entryId && !this._unsub) this._subscribe(); if (this._fm) setTimeout(() => this._fm.map.invalidateSize(), 50); }
  disconnectedCallback() { if (this._unsub) { this._unsub(); this._unsub = null; } }

  async _init() {
    const root = this.attachShadow({ mode: "open" });
    this._root = root;
    root.innerHTML = `<link rel="stylesheet" href="${BASE}leaflet/leaflet.css"><style>${MAP_CSS}
      ha-card { overflow: hidden; position: relative; }
      .box { position: relative; height: ${Number(this._config.height) || 400}px; }
      .head { position: absolute; z-index: 500; top: 10px; left: 54px; right: 10px; display: flex; gap: 6px; align-items: center; pointer-events: none; }
      .pill { background: rgba(20,24,28,.82); color: #fff; border-radius: 10px; padding: 6px 10px; font-size: 13px; display: inline-flex; gap: 6px; align-items: center;
        box-shadow: 0 1px 6px rgba(0,0,0,.4); pointer-events: auto; text-decoration: none; cursor: pointer; border: 0; font-family: inherit; }
      .pill ha-icon { --mdc-icon-size: 16px; }
      .pill.bad { background: rgba(219,68,55,.92); }
      .grow { flex: 1; }
      .msg { padding: 24px; color: var(--secondary-text-color); }
      .leaflet-popup-content { margin: 10px 12px; font-size: 13px; }
      .pop b { font-weight: 500; font-size: 14px; } .pop .st { display: flex; gap: 6px; align-items: center; margin: 4px 0 8px; }
      .pop .st i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
      .pop button { font: inherit; font-size: 13px; padding: 4px 10px; border-radius: 8px; border: 1px solid #ccc; background: #fff; cursor: pointer; }
    </style><ha-card><div class="box"><div class="hf-map" id="map"></div><div class="head" id="head"></div></div></ha-card>`;
    root.getElementById("head").addEventListener("click", (ev) => { if (ev.composedPath().some((e) => e.dataset?.open !== undefined)) this._open(); });
    try {
      const list = await this._hass.callWS({ type: `${DOMAIN}/list` });
      const want = this._config.farm;
      const e = list.find((x) => want && (x.name === want || x.entry_id === want)) || list[0];
      if (!e) throw new Error("No farm set up yet – add the Hamlet Farm integration.");
      this._entryId = e.entry_id;
      const L = await loadLeaflet();
      this._fm = new FarmMap(L, root.getElementById("map"), { onSelect: (id) => this._popup(id), interactive: true });
      this._fm.map.scrollWheelZoom.disable();
      this._fm.setLabels(this._config.labels !== false);
      const s = await this._hass.callWS({ type: `${DOMAIN}/state`, entry_id: this._entryId });
      this._apply(s, true);
      this._subscribe();
    } catch (err) {
      root.querySelector(".box").innerHTML = `<div class="msg">${esc(err.message)}</div>`;
    }
  }

  async _subscribe() {
    if (this._unsub || !this._entryId) return;
    try { this._unsub = await this._hass.connection.subscribeMessage((s) => this._apply(s), { type: `${DOMAIN}/subscribe`, entry_id: this._entryId }); }
    catch (e) { console.warn("hamlet_farm card subscribe failed", e); }
  }

  _apply(s, first = false) {
    this._snap = s;
    this._fm.setBase(this._config.style || s.settings?.base || "satellite");
    this._fm.update(s);
    this._fm.setOffline(s.offline, s.tile_url);
    if (first) this._fm.setView(s.view, s.points, s.shapes, { lat: this._hass.config?.latitude, lng: this._hass.config?.longitude });
    const sm = s.summary || {};
    this._root.getElementById("head").innerHTML = `<button class="pill" data-open><ha-icon icon="mdi:map-marker-radius"></ha-icon>${esc(this._config.title || s.name)}</button><span class="grow"></span>
      ${sm.running ? `<span class="pill"><ha-icon icon="mdi:play-circle-outline"></ha-icon>${sm.running} running</span>` : ""}
      ${sm.alerts ? `<button class="pill bad" data-open><ha-icon icon="mdi:alert"></ha-icon>${sm.alerts} alert${sm.alerts > 1 ? "s" : ""}</button>` : ""}`;
    if (this._popId) this._popup(this._popId, true);
  }

  _popup(id, refresh = false) {
    const p = this._snap.points.find((x) => x.id === id); if (!p) return;
    const st = this._snap.statuses?.[id] || {};
    const sv = shortValue(p, st); const extra = sv && !(st.status || "").includes(sv) ? ` · ${esc(sv)}` : "";
    const html = `<div class="pop"><b>${esc(p.name)}</b><div class="st"><i style="background:${clsColor(st.cls || "info", p.type)};outline:1px solid #0003"></i>${esc(st.status || TYPES[p.type]?.label || "")}
${extra}</div><button data-go="${esc(id)}">Open on the map page</button></div>`;
    if (refresh) { if (this._pop?.isOpen()) this._pop.setContent(html); return; }
    this._popId = id;
    this._pop = this._fm.L.popup({ offset: [0, -14], closeButton: true }).setLatLng([p.lat, p.lng]).setContent(html).openOn(this._fm.map);
    this._pop.on("remove", () => { this._popId = null; });
    const el = this._pop.getElement();
    el?.addEventListener("click", (ev) => { const b = ev.target.closest?.("[data-go]"); if (b) this._open(b.dataset.go); });
  }

  _open(point) {
    history.pushState(null, "", `/hamlet-farm${point ? `?point=${encodeURIComponent(point)}` : ""}`);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }
}

class HamletFarmCardEditor extends HTMLElement {
  setConfig(config) { this._config = config; this._render(); }
  set hass(h) { this._hass = h; }
  _render() {
    const c = this._config || {};
    this.innerHTML = `<div style="display:grid;gap:10px;padding:4px 0">
      <label>Farm (name, blank = first)<br><input data-k="farm" value="${esc(c.farm || "")}" style="width:100%"></label>
      <label>Height (px)<br><input data-k="height" type="number" value="${esc(c.height || 400)}" style="width:120px"></label>
      <label>Map style<br><select data-k="style"><option value="">Same as the Farm map page</option>${["satellite", "hybrid", "map"].map((s) => `<option ${c.style === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      <label><input type="checkbox" data-k="labels" ${c.labels === false ? "" : "checked"}> Show names on the map</label></div>`;
    this.querySelectorAll("[data-k]").forEach((el) => el.addEventListener("change", () => {
      const k = el.dataset.k; const cfg = { ...this._config };
      const v = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value;
      if (v === "" ) delete cfg[k]; else cfg[k] = v;
      this._config = cfg;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: cfg }, bubbles: true, composed: true }));
    }));
  }
}

if (!customElements.get("hamlet-farm-card")) customElements.define("hamlet-farm-card", HamletFarmCard);
if (!customElements.get("hamlet-farm-card-editor")) customElements.define("hamlet-farm-card-editor", HamletFarmCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "hamlet-farm-card")) {
  window.customCards.push({ type: "hamlet-farm-card", name: "Hamlet Farm map", description: "Satellite map of the farm with live pumps, pivots and Eskom points", preview: false });
}
