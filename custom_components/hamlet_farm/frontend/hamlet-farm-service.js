/* Hamlet Farm – installation details and service reports for pumps, pivots and other equipment. */
import { esc } from "./hamlet-farm-map.js";

const STARTERS = ["DOL", "Star-delta", "Soft starter", "VFD (variable speed drive)", "Pump controller", "Pressure switch", "Float switch", "Auto start / ATS", "Manual"];
const MOTOR_KW = [0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 9.2, 11, 15, 18.5, 22, 30, 37, 45, 55, 75];

/** Installation fields per point type: [key, label, kind, unit, placeholder, list] */
export const INSTALL_FIELDS = {
  pump: [
    ["installed", "Installed on", "date"], ["depth", "Borehole depth", "num", "m"], ["pump_depth", "Pump installed at", "num", "m"],
    ["water_level", "Water level (static)", "num", "m"], ["yield", "Yield", "num", "m³/h"],
    ["motor_kw", "Motor size", "num", "kW", "", MOTOR_KW], ["motor", "Motor make / model", "txt", "", "e.g. Franklin 6\" 7.5 kW"],
    ["pump_model", "Pump make / model", "txt", "", "e.g. Grundfos SP 17-12"], ["starter", "Starter", "txt", "", "", STARTERS],
    ["cable", "Cable", "txt", "", "e.g. 4 × 6 mm² flat drop cable"], ["pipe", "Delivery pipe", "txt", "", "e.g. 50 mm HDPE class 12"],
    ["serial", "Serial number", "txt"], ["installer", "Installed by", "txt"],
  ],
  booster: [
    ["installed", "Installed on", "date"], ["motor_kw", "Motor size", "num", "kW", "", MOTOR_KW], ["motor", "Motor make / model", "txt"],
    ["pump_model", "Pump make / model", "txt", "", "e.g. DAB K 35/40 T"], ["starter", "Starter", "txt", "", "", STARTERS],
    ["pressure_set", "Pressure setting", "txt", "", "e.g. 2.0 on / 3.5 bar off"], ["serial", "Serial number", "txt"], ["installer", "Installed by", "txt"],
  ],
  irrigation: [
    ["installed", "Installed on", "date"], ["motor_kw", "Motor size", "num", "kW", "", MOTOR_KW], ["motor", "Motor make / model", "txt"],
    ["pump_model", "Pump make / model", "txt", "", "e.g. Grundfos CM 5-6"], ["starter", "Starter", "txt", "", "", STARTERS],
    ["pressure_set", "Pressure setting", "txt", "", "e.g. VFD PID 3.0 bar"], ["serial", "Serial number", "txt"], ["installer", "Installed by", "txt"],
  ],
  pivot: [
    ["installed", "Installed on", "date"], ["make", "Make / model", "txt", "", "e.g. Valley 8000"], ["towers", "Towers", "num"],
    ["motor_kw", "Main motor / pump", "num", "kW", "", MOTOR_KW], ["starter", "Starter", "txt", "", "", STARTERS],
    ["end_gun", "End gun", "txt", "", "e.g. Nelson SR100, booster pump"], ["serial", "Serial number", "txt"], ["installer", "Installed by", "txt"],
  ],
  generator: [
    ["installed", "Installed on", "date"], ["make", "Make / model", "txt"], ["kva", "Size", "num", "kVA"],
    ["starter", "Starting", "txt", "", "", ["Auto start / ATS", "Manual", "Remote start"]], ["serial", "Serial number", "txt"], ["installer", "Installed by", "txt"],
  ],
};
export const hasService = (type) => type !== "building" && type !== "weather";

const money = (v) => `R ${Number(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const reportTotals = (r) => {
  const sub = (r.items || []).reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const vat = r.vat ? sub * 0.15 : 0;
  return { sub, vat, total: sub + vat };
};
const dateLong = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" }) : "");
export function ageText(d) {
  if (!d) return "";
  const a = new Date(`${d}T12:00:00`), n = new Date();
  let m = (n.getFullYear() - a.getFullYear()) * 12 + n.getMonth() - a.getMonth();
  if (n.getDate() < a.getDate()) m--;
  if (m < 0) return "";
  return m < 1 ? "this month" : m < 12 ? `${m} month${m > 1 ? "s" : ""} ago` : `${Math.floor(m / 12)} yr${m % 12 ? ` ${m % 12} mo` : ""} ago`;
}
export function dueText(d) {
  if (!d) return { text: "", cls: "" };
  const days = Math.round((new Date(`${d}T12:00:00`) - new Date()) / 86400000);
  if (days < 0) return { text: `overdue by ${-days} day${days === -1 ? "" : "s"}`, cls: "bad" };
  if (days <= 30) return { text: days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`, cls: "warn" };
  return { text: `in ${Math.round(days / 30)} months`, cls: "" };
}

/** Rows for the installation details of a point (for the About card and the report). */
export function installRows(p) {
  const f = INSTALL_FIELDS[p.type]; const sp = p.specs || {};
  if (!f) return [];
  return f.filter(([k]) => sp[k] !== undefined && sp[k] !== "").map(([k, label, kind, unit]) => {
    let v = sp[k];
    if (kind === "date") v = `${dateLong(v)}${ageText(v) ? ` (${ageText(v)})` : ""}`;
    else if (unit) v = `${v} ${unit}`;
    return [label, String(v)];
  });
}

/** Editor fields for installation details. */
export function installFieldsHtml(d) {
  const f = INSTALL_FIELDS[d.type]; if (!f) return "";
  const sp = d.specs || {};
  const filled = f.some(([k]) => sp[k] !== undefined && sp[k] !== "");
  const lists = []; let html = "";
  for (const [k, label, kind, unit, ph, list] of f) {
    const id = `f_sp_${k}`; const v = sp[k] ?? "";
    const lid = list ? `dl-sp-${k}` : "";
    if (list) lists.push(`<datalist id="${lid}">${list.map((x) => `<option value="${esc(x)}"></option>`).join("")}</datalist>`);
    const input = kind === "date" ? `<input type="date" id="${id}" data-spec="${k}" value="${esc(v)}" style="max-width:170px">`
      : kind === "num" ? `<span class="small muted"><input type="number" id="${id}" data-spec="${k}" step="any" min="0" value="${esc(v)}" ${lid ? `list="${lid}"` : ""}>${unit ? ` ${unit}` : ""}</span>`
      : `<input type="text" id="${id}" data-spec="${k}" value="${esc(v)}" maxlength="40" placeholder="${esc(ph || "")}" ${lid ? `list="${lid}"` : ""} style="max-width:220px">`;
    html += `<div class="field inline"><label for="${id}">${esc(label)}</label>${input}</div>`;
  }
  return `<details ${filled ? "open" : ""}><summary>Installation details</summary><div class="form">${html}</div>${lists.join("")}</details>`;
}

/* ------------------------------------------------------------------ service tab */
export function serviceTabHtml(p, list, isAdmin, summary) {
  const due = dueText(summary?.next);
  const rows = list.map((r) => {
    const t = reportTotals(r);
    return `<button class="doc" data-svc="${esc(r.id)}"><ha-icon icon="mdi:wrench-outline"></ha-icon>
      <span class="nm"><div>${esc(r.title)}</div><div class="small">${esc(dateLong(r.date))}${r.tech ? ` · ${esc(r.tech)}` : ""}${r.ref ? ` · ${esc(r.ref)}` : ""}</div></span>
      ${r.items?.length && !r.prices_hidden ? `<span class="small" style="font-variant-numeric:tabular-nums">${money(t.total)}</span>` : ""}</button>`;
  }).join("");
  return `<section class="card">
      <h2>Service reports<span class="sub">${isAdmin ? `<button class="btn primary" data-act="svcnew" style="padding:5px 12px"><ha-icon icon="mdi:plus"></ha-icon>New report</button>` : ""}</span></h2>
      ${summary?.next ? `<div class="kv"><span class="muted">Next service due</span><span class="${due.cls === "bad" ? "st bad" : ""}" style="${due.cls === "bad" ? "color:var(--c-bad)" : due.cls === "warn" ? "color:var(--c-warn)" : ""}">${esc(dateLong(summary.next))} · ${esc(due.text)}</span></div>` : ""}
      ${rows || `<div class="empty">${isAdmin ? "No service reports yet. <b>New report</b> records the work done, parts and pricing – and who on the client's side may see it." : "No service reports shared with you yet."}</div>`}
    </section>`;
}

export function serviceViewHtml(r, p, isAdmin, users, confirmDel) {
  const t = reportTotals(r);
  const names = isAdmin ? (r.users || []).map((id) => users.find((u) => u.id === id)?.name).filter(Boolean) : [];
  return `<h2><ha-icon icon="mdi:wrench-outline" style="color:var(--muted)"></ha-icon>${esc(r.title)}<span class="sub"><button class="iconbtn" data-act="docclose" aria-label="Close"><ha-icon icon="mdi:close"></ha-icon></button></span></h2>
    <div class="kv"><span class="muted">Date</span><span>${esc(dateLong(r.date))}</span></div>
    ${r.ref ? `<div class="kv"><span class="muted">Reference</span><span>${esc(r.ref)}</span></div>` : ""}
    <div class="kv"><span class="muted">Equipment</span><span>${esc(p?.name || "")}</span></div>
    ${r.tech ? `<div class="kv"><span class="muted">Technician</span><span>${esc(r.tech)}</span></div>` : ""}
    ${r.work ? `<h3>Work done</h3><p class="small" style="white-space:pre-wrap;margin:0">${esc(r.work)}</p>` : ""}
    ${r.readings ? `<h3>Readings</h3><p class="small" style="white-space:pre-wrap;margin:0">${esc(r.readings)}</p>` : ""}
    ${r.items?.length ? `<h3>Parts &amp; labour</h3>${itemsTable(r)}` : ""}
    ${r.next_due ? `<div class="kv" style="margin-top:8px"><span class="muted">Next service due</span><span>${esc(dateLong(r.next_due))}</span></div>` : ""}
    ${isAdmin ? `<div class="kv"><span class="muted">Shared with</span><span>${names.length ? esc(names.join(", ")) : "only admins"}</span></div>` : ""}
    <div class="actions"><button class="btn primary" data-act="svcprint"><ha-icon icon="mdi:printer-outline"></ha-icon>Print / save as PDF</button>
      ${isAdmin ? `<button class="btn" data-act="svcedit"><ha-icon icon="mdi:pencil"></ha-icon>Edit</button>
        <button class="btn" data-act="svccopy" title="Start a new report from this one"><ha-icon icon="mdi:content-copy"></ha-icon>Copy</button>
        <button class="btn danger" data-act="svcdel" style="margin-left:auto">${confirmDel ? "Tap again to delete" : "Delete"}</button>` : ""}</div>
    <div class="err" id="derr"></div>`;

  function itemsTable(rep) {
    if (rep.prices_hidden) {   // this user may see the work and parts, not the prices
      return `<table class="svct"><thead><tr><th>Description</th><th class="r">Qty</th></tr></thead><tbody>
      ${rep.items.map((it) => `<tr><td>${esc(it.desc)}</td><td class="r">${esc(it.qty)}</td></tr>`).join("")}</tbody></table>`;
    }
    return `<table class="svct"><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>
      ${rep.items.map((it) => `<tr><td>${esc(it.desc)}</td><td class="r">${esc(it.qty)}</td><td class="r">${money(it.price)}</td><td class="r">${money(it.qty * it.price)}</td></tr>`).join("")}
      </tbody><tfoot><tr><td colspan="3" class="r">Subtotal</td><td class="r">${money(t.sub)}</td></tr>
      ${rep.vat ? `<tr><td colspan="3" class="r">VAT 15%</td><td class="r">${money(t.vat)}</td></tr>` : ""}
      <tr class="tot"><td colspan="3" class="r">Total</td><td class="r">${money(t.total)}</td></tr></tfoot></table>`;
  }
}

export function serviceFormHtml(f, users, isNew) {
  const t = reportTotals(f);
  const today = new Date(); const addM = (m) => { const d = new Date(f.date ? `${f.date}T12:00:00` : today); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10); };
  return `<h2>${isNew ? "New service report" : "Edit service report"}<span class="sub"><button class="iconbtn" data-act="docclose" aria-label="Close"><ha-icon icon="mdi:close"></ha-icon></button></span></h2>
    <div class="form">
      <div class="field inline"><label for="sv_date">Date</label><input type="date" id="sv_date" value="${esc(f.date)}" style="max-width:170px"></div>
      <div class="field inline"><label for="sv_ref">Reference / job card</label><input type="text" id="sv_ref" value="${esc(f.ref || "")}" maxlength="40" style="max-width:170px"></div>
      <div class="field"><label for="sv_title">Title</label><input type="text" id="sv_title" value="${esc(f.title || "")}" maxlength="120" placeholder="e.g. 6-month service, new non-return valve"></div>
      <div class="field"><label for="sv_work">Work done</label><textarea id="sv_work" rows="4" maxlength="4000" placeholder="What was checked, found and done">${esc(f.work || "")}</textarea></div>
      <div class="field"><label for="sv_read">Readings</label><textarea id="sv_read" rows="2" maxlength="1000" placeholder="e.g. 14.2 A per phase, 3.4 bar, water level 32 m, insulation 200 MΩ">${esc(f.readings || "")}</textarea></div>
      <div class="field"><label>Parts &amp; labour</label>
        <table class="svct edit"><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Price (R)</th><th class="r">Amount</th><th></th></tr></thead><tbody>
          ${f.items.map((it, i) => `<tr><td><input type="text" data-svi="${i}" data-k="desc" value="${esc(it.desc)}" maxlength="160" list="dl-svc"></td>
            <td class="r"><input type="number" data-svi="${i}" data-k="qty" value="${esc(it.qty)}" step="any" min="0" style="width:64px"></td>
            <td class="r"><input type="number" data-svi="${i}" data-k="price" value="${esc(it.price)}" step="any" min="0" style="width:96px"></td>
            <td class="r" id="sva-${i}">${money((Number(it.qty) || 0) * (Number(it.price) || 0))}</td>
            <td><button class="iconbtn" data-svdel="${i}" aria-label="Remove line"><ha-icon icon="mdi:close"></ha-icon></button></td></tr>`).join("")}
        </tbody></table>
        <datalist id="dl-svc">${["Labour", "Call-out fee", "Travel (km)", "Non-return valve", "Pressure switch", "Contactor", "Overload relay", "Capacitor", "Drop cable (m)", "Cable joint kit", "Pump end", "Motor rewind", "Bearings", "Pressure gauge", "Float switch"].map((x) => `<option value="${x}"></option>`).join("")}</datalist>
        <div class="actions" style="margin-top:6px"><button class="btn" data-act="svcadd" style="padding:4px 12px"><ha-icon icon="mdi:plus"></ha-icon>Line</button>
          <button class="btn" data-svquick="Labour" style="padding:4px 12px">+ Labour</button><button class="btn" data-svquick="Call-out fee" style="padding:4px 12px">+ Call-out</button>
          <button class="btn" data-svquick="Travel (km)" style="padding:4px 12px">+ Travel</button></div>
        <div class="field inline" style="border:0"><label for="sv_vat">Add VAT 15%</label><label class="switch"><input type="checkbox" id="sv_vat" ${f.vat ? "checked" : ""}><span></span></label></div>
        <div class="kv"><span class="muted">Subtotal</span><span id="sv_sub">${money(t.sub)}</span></div>
        <div class="kv" id="sv_vatrow" ${f.vat ? "" : "hidden"}><span class="muted">VAT 15%</span><span id="sv_vatv">${money(t.vat)}</span></div>
        <div class="kv"><span><b style="font-weight:500">Total</b></span><span><b style="font-weight:500" id="sv_tot">${money(t.total)}</b></span></div></div>
      <div class="field inline"><label for="sv_next">Next service due</label><span style="display:flex;gap:6px;align-items:center"><input type="date" id="sv_next" value="${esc(f.next_due || "")}" style="max-width:170px">
        <button class="btn" data-svnext="${addM(6)}" style="padding:4px 10px">6 mo</button><button class="btn" data-svnext="${addM(12)}" style="padding:4px 10px">1 yr</button></span></div>
      <div class="field inline"><label for="sv_tech">Technician</label><input type="text" id="sv_tech" value="${esc(f.tech || "")}" maxlength="60" style="max-width:200px"></div>
      <div class="field users"><label style="cursor:default">Who may see it (with prices)</label>
        ${users.filter((u) => !u.admin).map((u) => `<label><input type="checkbox" data-svuser="${esc(u.id)}" ${f.users.includes(u.id) ? "checked" : ""}>${esc(u.name)}</label>`).join("") || `<span class="hint">No other users on this Home Assistant yet – add the client's people in Settings → People.</span>`}
        <span class="hint">Admins can always see every report. Everyone sees the last and next service date, without prices.</span></div>
    </div>
    <div class="actions"><button class="btn primary" data-act="svcsave" id="svsave">Save report</button><button class="btn" data-act="docclose">Cancel</button></div>
    <div class="err" id="derr"></div>`;
}

/** Update the amounts and totals in the open form without re-drawing it (so typing isn't interrupted). */
export function updateServiceTotals(root, f) {
  f.items.forEach((it, i) => { const c = root.getElementById(`sva-${i}`); if (c) c.textContent = money((Number(it.qty) || 0) * (Number(it.price) || 0)); });
  const t = reportTotals(f);
  const set = (id, v) => { const e = root.getElementById(id); if (e) e.textContent = v; };
  set("sv_sub", money(t.sub)); set("sv_vatv", money(t.vat)); set("sv_tot", money(t.total));
  const row = root.getElementById("sv_vatrow"); if (row) row.hidden = !f.vat;
}

export const SERVICE_CSS = `
.svct { width: 100%; border-collapse: collapse; font-size: 13px; margin: 6px 0; }
.svct th { text-align: left; font-weight: 500; color: var(--muted); padding: 5px 4px; border-bottom: 1px solid var(--line); }
.svct td { padding: 5px 4px; border-bottom: 1px solid var(--line); vertical-align: middle; font-variant-numeric: tabular-nums; }
.svct .r { text-align: right; } .svct tfoot td { border: 0; } .svct tr.tot td { font-weight: 500; font-size: 14px; }
.svct.edit input { padding: 5px 6px; font-size: 13px; }
.svct.edit td:first-child { width: 50%; }
`;

/** A printable service report – printed through a hidden frame, so "Save as PDF" works from the print dialog. */
export function printReport(r, p, farm, settings) {
  const t = reportTotals(r);
  const inst = installRows(p);
  const company = settings?.report_company || "";
  const contact = settings?.report_contact || "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Service report – ${esc(p?.name || "")} – ${esc(r.date)}</title><style>
    body { font: 13px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #111; margin: 28px; }
    h1 { font-size: 22px; margin: 0; } h2 { font-size: 15px; margin: 20px 0 6px; border-bottom: 2px solid #111; padding-bottom: 3px; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-bottom: 3px solid #1f63c6; padding-bottom: 10px; }
    .co { text-align: right; } .co b { font-size: 16px; } .muted { color: #555; }
    table { width: 100%; border-collapse: collapse; } td, th { padding: 5px 6px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
    th { font-weight: 600; background: #f3f5f8; } .r { text-align: right; } tfoot td { border: 0; } .tot td { font-weight: 700; font-size: 15px; border-top: 2px solid #111; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; } .grid div { display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding: 4px 0; }
    .pre { white-space: pre-wrap; } .sign { display: flex; gap: 40px; margin-top: 40px; } .sign div { flex: 1; border-top: 1px solid #111; padding-top: 4px; }
    @page { margin: 14mm; } @media print { body { margin: 0; } }
  </style></head><body>
    <div class="top"><div><h1>Service report</h1><div class="muted">${esc(farm)} · ${esc(p?.name || "")}</div></div>
      <div class="co">${company ? `<b>${esc(company)}</b><br>` : ""}${contact ? `<span class="muted">${esc(contact)}</span>` : ""}</div></div>
    <h2>Details</h2><div class="grid">
      <div><span>Date</span><b>${esc(dateLong(r.date))}</b></div>${r.ref ? `<div><span>Reference</span><b>${esc(r.ref)}</b></div>` : ""}
      <div><span>Equipment</span><b>${esc(p?.name || "")}</b></div>${r.tech ? `<div><span>Technician</span><b>${esc(r.tech)}</b></div>` : ""}
      ${p ? `<div><span>GPS</span><b>${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</b></div>` : ""}${r.next_due ? `<div><span>Next service due</span><b>${esc(dateLong(r.next_due))}</b></div>` : ""}
    </div>
    ${inst.length ? `<h2>Installation</h2><div class="grid">${inst.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>` : ""}
    <h2>${esc(r.title)}</h2>${r.work ? `<div class="pre">${esc(r.work)}</div>` : ""}
    ${r.readings ? `<h2>Readings</h2><div class="pre">${esc(r.readings)}</div>` : ""}
    ${r.items?.length && r.prices_hidden ? `<h2>Parts &amp; labour</h2><table><thead><tr><th>Description</th><th class="r">Qty</th></tr></thead><tbody>
      ${r.items.map((it) => `<tr><td>${esc(it.desc)}</td><td class="r">${esc(it.qty)}</td></tr>`).join("")}</tbody></table>` : ""}
    ${r.items?.length && !r.prices_hidden ? `<h2>Parts &amp; labour</h2><table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>
      ${r.items.map((it) => `<tr><td>${esc(it.desc)}</td><td class="r">${esc(it.qty)}</td><td class="r">${money(it.price)}</td><td class="r">${money(it.qty * it.price)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="3" class="r">Subtotal</td><td class="r">${money(t.sub)}</td></tr>${r.vat ? `<tr><td colspan="3" class="r">VAT 15%</td><td class="r">${money(t.vat)}</td></tr>` : ""}
      <tr class="tot"><td colspan="3" class="r">Total</td><td class="r">${money(t.total)}</td></tr></tfoot></table>` : ""}
    <div class="sign"><div>Technician</div><div>Client</div><div>Date</div></div>
  </body></html>`;
  const fr = document.createElement("iframe");
  fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(fr);
  fr.contentDocument.open(); fr.contentDocument.write(html); fr.contentDocument.close();
  setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { /* ignore */ } setTimeout(() => fr.remove(), 60000); }, 300);
  return html;
}
