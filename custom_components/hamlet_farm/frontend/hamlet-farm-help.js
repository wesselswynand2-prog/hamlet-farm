/* Hamlet Farm – the built-in manual. The text lives in manual.md (also on GitHub as MANUAL.md). */
import { CLS_COLOR, esc } from "./hamlet-farm-map.js";

const BASE = new URL(".", import.meta.url).href;
const DOTS = { ...CLS_COLOR, power: "#eda100" };

/** Inline markdown: **bold**, `code`, *italic*, and the manual's own tokens. */
function inline(t) {
  let s = esc(t);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, "<b><i>$1</i></b>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>");
  s = s.replace(/\{dot:(\w+)\}/g, (_, k) => `<span class="hdot ${k}" style="--mc:${DOTS[k] || "#fff"}"></span>`);
  s = s.replace(/\{line:(#[0-9a-fA-F]{3,8})\}/g, (_, c) => `<span class="hline" style="background:${c}"></span>`);
  s = s.replace(/\{icon:(mdi:[a-z0-9-]+)\}/g, (_, i) => `<ha-icon icon="${i}" class="hicon"></ha-icon>`);
  s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}

/** Small markdown renderer – just what the manual uses: paragraphs, lists, tables, code blocks, ### headings. */
function render(md) {
  const out = []; const lines = md.split("\n"); let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (l.startsWith("```")) {
      const buf = []; i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`); continue;
    }
    if (l.startsWith("### ")) { out.push(`<h4>${inline(l.slice(4))}</h4>`); i++; continue; }
    if (l.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(rows[0]); const body = rows.slice(2).map(cells);
      out.push(`<table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (/^(\d+\.|-) /.test(l)) {
      const ordered = /^\d+\./.test(l); const items = [];
      while (i < lines.length && /^(\d+\.|-) /.test(lines[i])) items.push(lines[i++].replace(/^(\d+\.|-) /, ""));
      out.push(`<${ordered ? "ol" : "ul"}>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(\d+\.|-) |^\||^```|^###? /.test(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  return out.join("");
}

let _sections = null;
/** The manual split into sections: [{ id, title, icon, admin, html, text }] */
export async function loadManual() {
  if (_sections) return _sections;
  const resp = await fetch(`${BASE}manual.md?v=${Date.now() >> 22}`);
  if (!resp.ok) throw new Error("Could not load the manual");
  const md = await resp.text();
  _sections = md.split(/\n(?=## )/).filter((p) => p.startsWith("## ")).map((part, n) => {
    const [head, ...rest] = part.split("\n");
    const admin = head.includes("{admin}");
    const icon = (head.match(/\{icon:(mdi:[a-z0-9-]+)\}/) || [])[1] || "mdi:help-circle-outline";
    const title = head.slice(3).replace(/\{[^}]+\}/g, "").trim();
    const body = rest.join("\n");
    return { id: `h${n}`, title, icon, admin, html: render(body), text: `${title} ${body}`.toLowerCase().replace(/\{[^}]+\}/g, "") };
  });
  return _sections;
}

export const HELP_CSS = `
.help { position: absolute; inset: 0; z-index: 1600; overflow-y: auto; background: var(--primary-background-color); }
@media (max-width: 899px) { .help { position: fixed; inset: 0; z-index: 1600; } }
.hwrap { max-width: 1180px; margin: 0 auto; padding: var(--gap); }
.hhead { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: var(--gap); }
.hhead h2 { margin: 0; font-size: 22px; font-weight: 500; flex: 1; min-width: 160px; }
.hhead input { max-width: 320px; }
.hgrid { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: var(--gap); align-items: start; }
@media (max-width: 899px) { .hgrid { grid-template-columns: 1fr; } .htoc { position: static !important; } }
.htoc { position: sticky; top: var(--gap); display: flex; flex-direction: column; gap: 2px; }
.htoc button { font: inherit; font-size: 14px; text-align: left; background: none; border: 0; color: var(--primary-text-color); padding: 7px 10px; border-radius: 8px; cursor: pointer; display: flex; gap: 8px; align-items: center; }
.htoc button:hover { background: color-mix(in srgb, var(--accent) 8%, transparent); }
.htoc button ha-icon { --mdc-icon-size: 18px; color: var(--muted); flex: none; }
.htoc .grp { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 12px 10px 4px; }
.hsec { scroll-margin-top: var(--gap); margin-bottom: var(--gap); }
.hsec h3 { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 500; margin: 0 0 10px; }
.hsec h3 ha-icon { color: var(--accent); }
.hsec h4 { font-size: 15px; font-weight: 500; margin: 16px 0 6px; }
.hsec p, .hsec li { font-size: 14px; line-height: 1.55; }
.hsec ul, .hsec ol { padding-left: 22px; margin: 8px 0; }
.hsec li { margin: 4px 0; }
.hsec code { font-family: var(--code-font-family, monospace); font-size: 13px; background: var(--secondary-background-color, rgba(127,127,127,.12)); padding: 1px 5px; border-radius: 4px; }
.hsec pre { background: var(--secondary-background-color, rgba(127,127,127,.12)); padding: 10px 12px; border-radius: 8px; overflow-x: auto; }
.hsec pre code { background: none; padding: 0; }
.hsec table { border-collapse: collapse; width: 100%; font-size: 14px; margin: 8px 0; }
.hsec th, .hsec td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
.hsec th { font-weight: 500; color: var(--muted); }
.hsec a { color: var(--accent); }
.hadmin { font-size: 12px; font-weight: 400; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); margin-left: auto; }
.hdot { display: inline-block; width: 14px; height: 14px; border-radius: 50%; background: var(--mc); border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.25); vertical-align: -2px; margin-right: 4px; }
.hdot.offline { border-style: dashed; } .hdot.info { box-shadow: 0 0 0 1px rgba(0,0,0,.4); }
.hline { display: inline-block; width: 22px; height: 5px; border-radius: 3px; vertical-align: 2px; box-shadow: 0 0 0 1px rgba(0,0,0,.3); }
.hicon { --mdc-icon-size: 16px; vertical-align: -3px; color: var(--muted); }
.hnone { color: var(--muted); padding: 24px 0; }
`;

/** Render the manual into `el`. isAdmin shows the admin sections. */
export async function renderHelp(el, isAdmin, focus) {
  el.innerHTML = `<div class="hwrap"><div class="hhead">
      <button class="btn" data-act="helpclose"><ha-icon icon="mdi:arrow-left"></ha-icon>Map</button>
      <h2>Help</h2>
      <input type="text" id="hq" placeholder="Search the manual…" aria-label="Search the manual" autocomplete="off"></div>
    <div class="hgrid"><nav class="htoc" id="htoc"></nav><div id="hbody"><div class="hnone">Loading…</div></div></div></div>`;
  let sections;
  try { sections = (await loadManual()).filter((s) => isAdmin || !s.admin); }
  catch (e) { el.querySelector("#hbody").innerHTML = `<div class="hnone">${esc(e.message)}</div>`; return; }
  const draw = (q) => {
    const want = (q || "").trim().toLowerCase();
    const shown = sections.filter((s) => !want || want.split(/\s+/).every((w) => s.text.includes(w)));
    const users = shown.filter((s) => !s.admin), admins = shown.filter((s) => s.admin);
    const toc = (list) => list.map((s) => `<button data-hgo="${s.id}"><ha-icon icon="${s.icon}"></ha-icon>${esc(s.title)}</button>`).join("");
    el.querySelector("#htoc").innerHTML = `${toc(users)}${admins.length ? `<div class="grp">For admins / installers</div>${toc(admins)}` : ""}`;
    el.querySelector("#hbody").innerHTML = shown.map((s) => `<section class="card hsec" id="${s.id}">
        <h3><ha-icon icon="${s.icon}"></ha-icon>${esc(s.title)}${s.admin ? '<span class="hadmin">Admin</span>' : ""}</h3>${s.html}</section>`).join("")
      || `<div class="hnone">Nothing found for “${esc(q)}”.</div>`;
  };
  draw("");
  el.querySelector("#hq").addEventListener("input", (e) => draw(e.target.value));
  if (!el._hbound) {
    el._hbound = true;
    el.addEventListener("click", (e) => {
      const b = e.composedPath().find((x) => x.dataset?.hgo);
      if (b) el.querySelector(`#${b.dataset.hgo}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  if (focus) {
    const s = sections.find((x) => x.title.toLowerCase().includes(focus.toLowerCase()));
    if (s) setTimeout(() => el.querySelector(`#${s.id}`)?.scrollIntoView({ block: "start" }), 50);
  }
}
