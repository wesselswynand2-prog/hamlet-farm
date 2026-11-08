/* Hamlet Farm – History tab on a point's page: one small chart per measurement, from Home Assistant's recorder.
   Line charts for readings, columns for kWh per hour / day, a strip for running / on time. One series per chart,
   so the chart title names it (no legend). Hover / touch shows a crosshair and the value. */
import { ROLES, esc } from "./hamlet-farm-map.js";

const RANGES = { "24h": { label: "24 hours", h: 24 }, "7d": { label: "7 days", h: 24 * 7 }, "30d": { label: "30 days", h: 24 * 30 } };
const MAX_POINTS = 480;
const BOOL_DOMAINS = ["binary_sensor", "switch", "input_boolean", "light", "fan", "valve", "cover"];

export const HISTORY_CSS = `
.htabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: var(--gap); }
.htabs button { font: inherit; font-size: 15px; background: none; border: 0; border-bottom: 2px solid transparent; color: var(--muted); padding: 8px 14px; cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }
.htabs button ha-icon { --mdc-icon-size: 18px; }
.htabs button[aria-selected="true"] { color: var(--primary-text-color); border-bottom-color: var(--accent); }
.hrange { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: var(--gap); }
.hcharts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gap); transition: opacity .2s; align-items: start; }
.hcharts .hc.wide { grid-column: 1 / -1; }
.hcharts.loading { opacity: .45; }
@media (max-width: 899px) { .hcharts { grid-template-columns: minmax(0, 1fr); } }
.hc h3 { font-size: 15px; font-weight: 500; margin: 0; display: flex; align-items: baseline; gap: 8px; }
.hc h3 .now { margin-left: auto; font-size: 20px; font-variant-numeric: tabular-nums; }
.hc .sum { font-size: 12px; color: var(--muted); margin: 2px 0 8px; font-variant-numeric: tabular-nums; }
.hc .plot { position: relative; touch-action: pan-y; }
.hc svg { display: block; width: 100%; overflow: visible; }
.hc svg text { font-size: 11px; fill: var(--muted); font-variant-numeric: tabular-nums; }
.hc .grid { stroke: var(--line); stroke-width: 1; }
.hc .tip { position: absolute; pointer-events: none; background: var(--card); border: 1px solid var(--line); box-shadow: 0 2px 8px rgba(0,0,0,.18);
  border-radius: 8px; padding: 5px 8px; font-size: 12px; white-space: nowrap; transform: translate(-50%, -100%); top: 0; z-index: 2; }
.hc .tip b { font-size: 14px; font-weight: 500; display: block; font-variant-numeric: tabular-nums; }
.hc .tip span { color: var(--muted); }
.hc .empty { color: var(--muted); font-size: 13px; padding: 20px 0; text-align: center; }
.hc .chart-src { font-size: 11px; color: var(--muted); margin-top: 4px; }
`;

const fmtNum = (v, unit) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  const a = Math.abs(v);
  if (unit === "W" && a >= 1000) return `${(v / 1000).toFixed(a >= 10000 ? 0 : 1)} kW`;
  const d = a >= 100 || Number.isInteger(v) ? 0 : a >= 10 ? 1 : 2;
  return `${v.toFixed(d)}${unit ? (unit === "°" || unit === "%" ? unit : ` ${unit}`) : ""}`;
};
const fmtDur = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`; };
const fmtTime = (t, range) => {
  const d = new Date(t);
  return range === "24h" ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString([], { weekday: "short", day: "numeric", month: "short", ...(range === "7d" ? { hour: "2-digit", minute: "2-digit" } : {}) });
};

/** The charts a point gets: [{ key, title, entity, kind: line|bars|strip, unit }] */
export function chartsFor(point, hass) {
  const ents = point.entities || {};
  const out = [];
  const unitOf = (e) => hass.states[e]?.attributes?.unit_of_measurement || "";
  const isBool = (e) => BOOL_DOMAINS.includes(e.split(".")[0]) || ["on", "off", "open", "closed"].includes(hass.states[e]?.state);
  const run = ents.running || (ents.control && isBool(ents.control) ? ents.control : null);
  if (run) out.push({ key: "run", title: ents.running ? "Running" : "On / off", entity: run, kind: "strip" });
  if (ents.power) out.push({ key: "power", title: "Power", entity: ents.power, kind: "line", unit: unitOf(ents.power) });
  if (ents.energy) out.push({ key: "energy", title: "kWh used", entity: ents.energy, kind: "bars", unit: unitOf(ents.energy) || "kWh" });
  for (const k of ["level", "pressure", "flow", "angle", "supply"]) {
    const e = ents[k]; if (!e || isBool(e)) continue;
    out.push({ key: k, title: k === "supply" ? "Supply voltage" : ROLES[k].label.replace(/ \(.*\)/, ""), entity: e, kind: "line", unit: unitOf(e) || (k === "level" ? "%" : k === "angle" ? "°" : "") });
  }
  for (const e of point.extra || []) {
    const so = hass.states[e]; if (!so || e.startsWith("camera.")) continue;
    if (isBool(e)) out.push({ key: e, title: so.attributes.friendly_name || e, entity: e, kind: "strip" });
    else if (!Number.isNaN(Number(so.state)) || so.attributes.unit_of_measurement) out.push({ key: e, title: so.attributes.friendly_name || e, entity: e, kind: "line", unit: unitOf(e) });
  }
  return out;
}

async function fetchHistory(hass, entities, start, end) {
  const r = await hass.callWS({ type: "history/history_during_period", start_time: start.toISOString(), end_time: end.toISOString(),
    entity_ids: entities, minimal_response: true, no_attributes: true, significant_changes_only: false });
  const out = {};
  for (const e of entities) out[e] = (r[e] || []).map((x) => ({ t: (x.lu ?? x.lc ?? 0) * 1000, s: x.s }));
  return out;
}

async function fetchEnergy(hass, entity, start, end, period) {
  try {
    const r = await hass.callWS({ type: "recorder/statistics_during_period", start_time: start.toISOString(), end_time: end.toISOString(),
      statistic_ids: [entity], period, types: ["change"] });
    return (r[entity] || []).map((x) => ({ t: typeof x.start === "number" ? x.start : Date.parse(x.start), v: x.change ?? 0 }));
  } catch (e) { return null; }
}

/** Reduce a long series to <= MAX_POINTS, keeping each bucket's min and max so peaks survive. */
function downsample(pts) {
  if (pts.length <= MAX_POINTS) return pts;
  const step = Math.ceil(pts.length / (MAX_POINTS / 2)); const out = [];
  for (let i = 0; i < pts.length; i += step) {
    const b = pts.slice(i, i + step);
    let lo = b[0], hi = b[0];
    for (const p of b) { if (p.v < lo.v) lo = p; if (p.v > hi.v) hi = p; }
    out.push(...(lo.t <= hi.t ? [lo, hi] : [hi, lo]));
  }
  return out;
}

function niceTicks(lo, hi, n = 4) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / n; const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const t0 = Math.floor(lo / step) * step; const ticks = [];
  for (let v = t0; ; v += step) { ticks.push(+v.toFixed(10)); if (v >= hi - 1e-9 || ticks.length > 12) break; }
  return ticks;
}

function timeTicks(t0, t1, range) {
  const out = []; const d = new Date(t0);
  if (range === "24h") { d.setMinutes(0, 0, 0); d.setHours(Math.ceil(d.getHours() / 6) * 6); while (d.getTime() <= t1) { out.push(d.getTime()); d.setHours(d.getHours() + 6); } }
  else { d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); const every = range === "7d" ? 1 : 5; while (d.getTime() <= t1) { out.push(d.getTime()); d.setDate(d.getDate() + every); } }
  return out;
}
const tickLabel = (t, range) => { const d = new Date(t); return range === "24h" ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], range === "7d" ? { weekday: "short" } : { day: "numeric", month: "short" }); };

/** Draw one chart into `el`. */
function drawChart(el, c, data, range, t0, t1, accent) {
  const W = Math.max(260, el.clientWidth || 500);
  const H = c.kind === "strip" ? 46 : 170;
  const padL = c.kind === "strip" ? 8 : 44, padR = 10, padT = 8, padB = 20;
  const x = (t) => padL + ((t - t0) / (t1 - t0)) * (W - padL - padR);
  const plot = el.querySelector(".plot");
  const xt = timeTicks(t0, t1, range);
  let svg = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(c.title)} chart">`;
  svg += xt.map((t) => `<text x="${x(t)}" y="${H - 4}" text-anchor="middle">${esc(tickLabel(t, range))}</text>`).join("");
  let hover = null;

  if (c.kind === "strip") {
    // on / off periods as a single bar; green = on (status colour, with the label "on" in the tooltip)
    const segs = []; const pts = data;
    for (let i = 0; i < pts.length; i++) {
      const a = Math.max(t0, pts[i].t), b = Math.min(t1, i + 1 < pts.length ? pts[i + 1].t : Date.now());
      if (b <= a) continue;
      const last = segs[segs.length - 1];
      const off = pts[i].s === "unavailable" || pts[i].s === "unknown";
      if (last && last.on === pts[i].on && last.off === off) last.b = b;   // join repeats into one stretch
      else segs.push({ a, b, on: pts[i].on, s: pts[i].s, off });
    }
    const y = padT, h = H - padT - padB;
    svg += `<rect x="${padL}" y="${y}" width="${W - padL - padR}" height="${h}" rx="4" fill="var(--secondary-background-color, rgba(127,127,127,.15))"/>`;
    svg += segs.filter((s) => s.on).map((s) => `<rect x="${x(s.a)}" y="${y}" width="${Math.max(1, x(s.b) - x(s.a))}" height="${h}" rx="2" fill="var(--c-run, #1baf7a)"/>`).join("");
    svg += segs.filter((s) => s.s === "unavailable" || s.s === "unknown").map((s) => `<rect x="${x(s.a)}" y="${y}" width="${Math.max(1, x(s.b) - x(s.a))}" height="${h}" fill="url(#hatch)" opacity=".7"/>`).join("");
    svg = svg.replace(">", `><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="6" fill="var(--muted)"/></pattern></defs>`);
    hover = (t) => { const s = segs.find((g) => g.a <= t && t < g.b); return s ? { v: s.on ? "On" : s.s === "unavailable" ? "Offline" : "Off", sub: `${fmtTime(s.a, "7d")} – ${fmtDur(s.b - s.a)}`, y: padT } : null; };
  } else if (c.kind === "bars") {
    const vals = data.map((d) => d.v); const hi = Math.max(1e-9, ...vals);
    const ticks = niceTicks(0, hi); const top = ticks[ticks.length - 1];
    const y = (v) => padT + (1 - v / top) * (H - padT - padB);
    svg += ticks.map((v) => `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmtNum(v, ""))}</text>`).join("");
    const slot = (W - padL - padR) / Math.max(1, data.length); const bw = Math.max(2, Math.min(24, slot - 2));
    svg += data.map((d) => { const bx = x(d.t) + (slot - bw) / 2, by = y(d.v), bh = Math.max(0, y(0) - by);
      const r = Math.min(4, bw / 2, bh);
      return bh > 0 ? `<path d="M${bx},${y(0)} V${by + r} Q${bx},${by} ${bx + r},${by} H${bx + bw - r} Q${bx + bw},${by} ${bx + bw},${by + r} V${y(0)} Z" fill="${accent}"/>` : ""; }).join("");
    hover = (t) => { const i = Math.min(data.length - 1, Math.max(0, Math.floor((t - t0) / ((t1 - t0) / data.length)))); const d = data.find((p, k) => p.t <= t && (k + 1 === data.length || data[k + 1].t > t)) || data[i];
      return d ? { v: fmtNum(d.v, c.unit), sub: fmtTime(d.t, range === "24h" ? "24h" : "30d"), x: x(d.t) + slot / 2, y: y(d.v) } : null; };
  } else {
    const pts = downsample(data);
    const vals = pts.map((p) => p.v);
    const lo0 = Math.min(...vals), hi0 = Math.max(...vals);
    const ticks = c.key === "angle" ? [0, 90, 180, 270, 360] : c.unit === "%" && hi0 <= 100 ? [0, 25, 50, 75, 100]
      : niceTicks(c.key === "power" ? Math.min(0, lo0) : lo0, hi0);
    const lo = ticks[0], top = ticks[ticks.length - 1];
    const y = (v) => padT + (1 - (v - lo) / (top - lo || 1)) * (H - padT - padB);
    svg += ticks.map((v) => `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmtNum(v, c.unit === "W" && top >= 1000 ? "W" : ""))}</text>`).join("");
    // step line: a sensor holds its value until the next change; gaps where it was offline
    let d = ""; let prev = null;
    for (const p of pts) {
      if (p.gap) { prev = null; continue; }
      d += prev === null ? `M${x(p.t)},${y(p.v)}` : `H${x(p.t)}V${y(p.v)}`;
      prev = p;
    }
    if (prev) d += `H${x(Math.min(t1, Date.now()))}`;
    const area = d ? `${d}V${y(lo)}H${x(pts.find((p) => !p.gap)?.t ?? t0)}Z` : "";
    svg += `<path d="${area}" fill="${accent}" opacity=".10"/><path d="${d}" fill="none" stroke="${accent}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const real = pts.filter((p) => !p.gap);
    hover = (t) => { let best = null; for (const p of real) { if (p.t <= t) best = p; else break; } best = best || real[0];
      return best ? { v: fmtNum(best.v, c.unit), sub: fmtTime(t, range), x: x(t), y: y(best.v), dot: true } : null; };
  }
  svg += `<line class="xh" x1="0" x2="0" y1="${padT}" y2="${H - padB}" stroke="var(--primary-text-color)" stroke-width="1" opacity="0"/>
    <circle class="xd" r="4.5" fill="${accent}" stroke="var(--card)" stroke-width="2" opacity="0"/>
    <rect class="hit" x="${padL}" y="0" width="${W - padL - padR}" height="${H}" fill="transparent"/></svg><div class="tip" hidden></div>`;
  plot.innerHTML = svg;
  const hit = plot.querySelector(".hit"), xh = plot.querySelector(".xh"), xd = plot.querySelector(".xd"), tip = plot.querySelector(".tip");
  const show = (ev) => {
    const r = plot.querySelector("svg").getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const t = t0 + ((px - padL) / (W - padL - padR)) * (t1 - t0);
    const h = hover && hover(t); if (!h) { hide(); return; }
    const hx = h.x ?? px;
    xh.setAttribute("x1", hx); xh.setAttribute("x2", hx); xh.setAttribute("opacity", ".35");
    if (h.dot) { xd.setAttribute("cx", hx); xd.setAttribute("cy", h.y); xd.setAttribute("opacity", "1"); } else xd.setAttribute("opacity", "0");
    tip.replaceChildren();
    const b = document.createElement("b"); b.textContent = h.v; const s = document.createElement("span"); s.textContent = h.sub;
    tip.append(b, s); tip.hidden = false;
    const left = Math.min(Math.max((hx / W) * r.width, 60), r.width - 60);
    tip.style.left = `${left}px`; tip.style.top = `${Math.max(0, (h.y / H) * r.height - 8)}px`;
  };
  const hide = () => { xh.setAttribute("opacity", "0"); xd.setAttribute("opacity", "0"); tip.hidden = true; };
  hit.addEventListener("pointermove", show); hit.addEventListener("pointerdown", show); hit.addEventListener("pointerleave", hide);
}

/** History tab. state: { range } kept by the caller between renders. */
export async function renderHistory(el, hass, point, state, accent = "#2a78d6") {
  const range = state.range || "24h";
  const charts = chartsFor(point, hass);
  if (!el.querySelector(".hcharts") || el._pid !== point.id) {
    el._pid = point.id;
    el.innerHTML = `<div class="hrange" role="group" aria-label="Time range">${Object.entries(RANGES).map(([k, r]) => `<button class="chip" data-hrange="${k}" aria-pressed="${k === range}">${r.label}</button>`).join("")}</div>
      <div class="hcharts"></div>`;
  } else {
    el.querySelectorAll("[data-hrange]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.hrange === range)));
  }
  const box = el.querySelector(".hcharts");
  if (!charts.length) { box.innerHTML = `<section class="card hc"><div class="empty">No sensors linked to this point yet – link power, a kWh meter, level, pressure… in Edit to see their history here.</div></section>`; return; }
  box.classList.add("loading");
  if (!box.children.length || box._key !== charts.map((c) => c.key).join()) {
    box._key = charts.map((c) => c.key).join();
    charts.sort((a, b) => (a.kind === "strip" ? 0 : 1) - (b.kind === "strip" ? 0 : 1));
    box.innerHTML = charts.map((c) => `<section class="card hc${c.kind === "strip" ? " wide" : ""}" data-chart="${esc(c.key)}"><h3>${esc(c.title)}<span class="now"></span></h3><div class="sum"></div><div class="plot"><div class="empty">Loading…</div></div>
      <div class="chart-src"></div></section>`).join("");
  }
  const t1 = Date.now(); const t0 = t1 - RANGES[range].h * 3600e3;
  const start = new Date(t0), end = new Date(t1);
  let hist = {};
  try {
    const ents = [...new Set(charts.filter((c) => c.kind !== "bars").map((c) => c.entity))];
    if (ents.length) hist = await fetchHistory(hass, ents, start, end);
  } catch (e) {
    box.innerHTML = `<section class="card hc"><div class="empty">Could not read the history: ${esc(e.message || String(e))}</div></section>`; box.classList.remove("loading"); return;
  }
  if (state.range !== range && state.range) return;   // range changed while loading
  for (const c of charts) {
    const card = box.querySelector(`[data-chart="${CSS.escape(c.key)}"]`); if (!card) continue;
    const so = hass.states[c.entity];
    const nowEl = card.querySelector(".now"), sum = card.querySelector(".sum"), src = card.querySelector(".chart-src");
    src.textContent = so?.attributes?.friendly_name || c.entity;
    if (c.kind === "bars") {
      const data = await fetchEnergy(hass, c.entity, start, end, range === "24h" ? "hour" : "day");
      if (!data || !data.length) { card.querySelector(".plot").innerHTML = `<div class="empty">No kWh statistics for this meter yet. They need a sensor with state class total / total increasing, and start the hour after it is linked.</div>`; nowEl.textContent = ""; sum.textContent = ""; continue; }
      const total = data.reduce((a, d) => a + d.v, 0);
      nowEl.textContent = fmtNum(total, c.unit);
      sum.textContent = `${range === "24h" ? "per hour" : "per day"} · busiest ${fmtNum(Math.max(...data.map((d) => d.v)), c.unit)}`;
      drawChart(card, c, data, range, t0, t1, accent);
      continue;
    }
    const raw = hist[c.entity] || [];
    if (c.kind === "strip") {
      const pts = raw.map((p) => ({ t: p.t, s: p.s, on: ["on", "open", "opening", "true", "home", "running"].includes(String(p.s).toLowerCase()) || Number(p.s) > 0 }));
      if (!pts.length) { card.querySelector(".plot").innerHTML = `<div class="empty">No history in this period.</div>`; continue; }
      let onMs = 0, starts = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = Math.max(t0, pts[i].t), b = Math.min(t1, i + 1 < pts.length ? pts[i + 1].t : t1);
        if (pts[i].on && b > a) onMs += b - a;
        if (pts[i].on && (i === 0 || !pts[i - 1].on)) starts++;
      }
      nowEl.textContent = so ? (["on", "open"].includes(so.state) ? "On" : so.state === "unavailable" ? "Offline" : "Off") : "";
      sum.textContent = `On for ${fmtDur(onMs)} (${Math.round((onMs / (t1 - t0)) * 100)}%) · started ${starts}×`;
      drawChart(card, c, pts, range, t0, t1, accent);
      continue;
    }
    let mult = 1; let unit = c.unit;
    if (c.key === "power" && unit === "kW") { mult = 1000; unit = "W"; }
    const pts = raw.map((p) => { const v = Number(p.s); return Number.isFinite(v) ? { t: p.t, v: v * mult } : { t: p.t, gap: true }; });
    const real = pts.filter((p) => !p.gap);
    if (!real.length) { card.querySelector(".plot").innerHTML = `<div class="empty">No readings in this period.</div>`; nowEl.textContent = ""; sum.textContent = ""; continue; }
    const vals = real.map((p) => p.v);
    // time-weighted average
    let acc = 0, dur = 0;
    for (let i = 0; i < pts.length; i++) { if (pts[i].gap) continue; const a = Math.max(t0, pts[i].t), b = Math.min(t1, i + 1 < pts.length ? pts[i + 1].t : t1); if (b > a) { acc += pts[i].v * (b - a); dur += b - a; } }
    const cur = Number(so?.state);
    nowEl.textContent = Number.isFinite(cur) ? fmtNum(cur * mult, unit) : (so?.state || "");
    sum.textContent = `min ${fmtNum(Math.min(...vals), unit)} · avg ${fmtNum(dur ? acc / dur : vals[0], unit)} · max ${fmtNum(Math.max(...vals), unit)}`;
    drawChart(card, { ...c, unit }, pts, range, t0, t1, accent);
  }
  box.classList.remove("loading");
}
