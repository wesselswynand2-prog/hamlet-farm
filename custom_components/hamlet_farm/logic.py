"""Pure logic for Hamlet Farm: validating map points / lines and working out each point's status.

No Home Assistant imports here, so it can be unit-tested on its own.
"""
from __future__ import annotations

import re
import uuid
from typing import Any, Callable, NamedTuple

# type key -> (label, mdi icon). Keep in step with TYPES in the frontend.
POINT_TYPES: dict[str, tuple[str, str]] = {
    "pump": ("Borehole pump", "mdi:water-pump"),
    "booster": ("Pressure pump", "mdi:pump"),
    "pivot": ("Centre pivot", "mdi:sprinkler-variant"),
    "eskom": ("Eskom point", "mdi:transmission-tower"),
    "transformer": ("Transformer", "mdi:flash-triangle"),
    "tank": ("Tank / dam", "mdi:water"),
    "valve": ("Valve", "mdi:valve"),
    "gate": ("Gate", "mdi:gate"),
    "camera": ("Camera", "mdi:cctv"),
    "weather": ("Weather station", "mdi:weather-partly-rainy"),
    "solar": ("Solar / inverter", "mdi:solar-power-variant"),
    "generator": ("Generator", "mdi:engine"),
    "building": ("Building", "mdi:home-outline"),
    "other": ("Other", "mdi:map-marker"),
}
SHAPE_KINDS = {"pipe": "Water pipe", "power": "Overhead power line", "cable": "Cable 1 000 V", "cable3300": "Cable 3 300 V",
               "mv": "MV cable", "fence": "Fence", "road": "Road", "field": "Land / camp",
               "sketch": "Drawing"}
SKETCH_COLORS = ("#ff3b30", "#ffcc00", "#ffffff", "#34c759", "#0a84ff", "#ff9500", "#000000")

# entity roles a point can have
ENTITY_KEYS = ["control", "running", "power", "energy", "supply", "fault", "level", "pressure", "flow", "angle"]
CORE_KEYS = ["control", "running", "power", "supply", "level", "angle"]   # unavailable -> point offline
MAX_EXTRA = 8

UNAVAILABLE = ("unavailable", "unknown")
ON_WORDS = {"on", "true", "open", "opening", "running", "home", "yes", "active", "heat", "cool", "auto"}
OFF_WORDS = {"off", "false", "closed", "closing", "idle", "stopped", "no", "inactive", "ok", "normal", "none", "0", ""}
SUPPLY_MIN_V = 150.0
RUNNING_MIN_W = 20.0

PUMP_WARN = {"Resting", "Tank low", "Rain skip", "Rain delay", "Waiting", "Leak?", "Short-cycling"}
PUMP_BAD = {"Fault", "VFD fault", "Offline", "Locked out"}

_ENTITY_RE = re.compile(r"^[a-z0-9_]+\.[a-z0-9_]+$")


class Reading(NamedTuple):
    state: str
    unit: str | None = None


# ------------------------------------------------------------------ validation
def _txt(v: Any, n: int) -> str:
    return str(v or "").strip()[:n]


def _float(v: Any, lo: float, hi: float, default: float | None = None) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    if f != f:  # NaN
        return default
    return min(hi, max(lo, f))


def _entity(v: Any) -> str | None:
    v = str(v or "").strip().lower()
    return v if _ENTITY_RE.match(v) else None


def new_id() -> str:
    return uuid.uuid4().hex[:8]


def clean_point(raw: dict) -> dict:
    """Validate a point coming from the panel. Raises ValueError on bad input."""
    if not isinstance(raw, dict):
        raise ValueError("point must be an object")
    lat = _float(raw.get("lat"), -90, 90)
    lng = _float(raw.get("lng"), -180, 180)
    if lat is None or lng is None:
        raise ValueError("point needs a position")
    ptype = raw.get("type") if raw.get("type") in POINT_TYPES else "other"
    name = _txt(raw.get("name"), 60) or POINT_TYPES[ptype][0]
    ents_in = raw.get("entities") or {}
    if not isinstance(ents_in, dict):
        raise ValueError("entities must be an object")
    ents = {k: e for k in ENTITY_KEYS if (e := _entity(ents_in.get(k)))}
    extra_in = raw.get("extra") or []
    if not isinstance(extra_in, list):
        raise ValueError("extra must be a list")
    extra: list[str] = []
    for e in extra_in:
        if (e := _entity(e)) and e not in extra:
            extra.append(e)
    pid = _txt(raw.get("id"), 16)
    if not re.match(r"^[A-Za-z0-9_-]+$", pid):
        pid = new_id()
    pump = _txt(raw.get("pump_entry"), 64) or None
    return {
        "id": pid,
        "name": name,
        "type": ptype,
        "lat": round(lat, 7),
        "lng": round(lng, 7),
        "entities": ents,
        "extra": extra[:MAX_EXTRA],
        "pump_entry": pump,
        "radius": round(_float(raw.get("radius"), 0, 3000, 0) or 0),
        "low_level": _float(raw.get("low_level"), 0, 100, 20),
        "alert": bool(raw.get("alert", True)),
        "notes": _txt(raw.get("notes"), 500),
        "specs": _specs(raw.get("specs"), ptype),
    }


SPEC_KEYS = {
    # transformer: size and voltages, e.g. {"kva": 200, "primary": "11 kV", "secondary": "400 V"}
    "transformer": {"num": ("kva",), "txt": ("primary", "secondary", "vector", "serial")},
    # Eskom supply point: the client's Eskom account and the supply transformer on the pole
    "eskom": {"num": ("kva", "nmd"), "txt": ("account", "pole", "meter", "supply", "tariff")},
}


def _specs(raw: Any, ptype: str) -> dict:
    keys = SPEC_KEYS.get(ptype)
    if not keys or not isinstance(raw, dict):
        return {}
    out: dict[str, Any] = {}
    for k in keys["num"]:
        n = _float(raw.get(k), 0, 100000)
        if n:
            out[k] = round(n, 1) if n % 1 else int(n)
    for k in keys["txt"]:
        if v := _txt(raw.get(k), 40):
            out[k] = v
    return out


def clean_shape(raw: dict) -> dict:
    if not isinstance(raw, dict):
        raise ValueError("line must be an object")
    kind = raw.get("kind") if raw.get("kind") in SHAPE_KINDS else "pipe"
    coords = []
    for c in raw.get("coords") or []:
        if not isinstance(c, (list, tuple)) or len(c) != 2:
            raise ValueError("bad coordinate")
        lat, lng = _float(c[0], -90, 90), _float(c[1], -180, 180)
        if lat is None or lng is None:
            raise ValueError("bad coordinate")
        coords.append([round(lat, 7), round(lng, 7)])
    need = 3 if kind == "field" else 2
    if len(coords) < need:
        raise ValueError(f"a {SHAPE_KINDS[kind].lower()} needs at least {need} points")
    pid = _txt(raw.get("id"), 16)
    if not re.match(r"^[A-Za-z0-9_-]+$", pid):
        pid = new_id()
    shape = {"id": pid, "kind": kind, "name": _txt(raw.get("name"), 60) or SHAPE_KINDS[kind],
             "coords": coords[:2000 if kind == "sketch" else 500]}
    if info := _txt(raw.get("info"), 120):
        shape["info"] = info
    if kind == "sketch":
        color = str(raw.get("color") or "").lower()
        shape["color"] = color if color in SKETCH_COLORS else SKETCH_COLORS[0]
    return shape


def clean_view(raw: Any) -> dict | None:
    if not isinstance(raw, dict):
        return None
    lat, lng, zoom = _float(raw.get("lat"), -90, 90), _float(raw.get("lng"), -180, 180), _float(raw.get("zoom"), 1, 21)
    if None in (lat, lng, zoom):
        return None
    return {"lat": round(lat, 6), "lng": round(lng, 6), "zoom": round(zoom, 1)}


def point_entities(point: dict) -> list[str]:
    return [*point.get("entities", {}).values(), *point.get("extra", [])]


# ---------------------------------------------------------------- reading values
def to_num(s: str | None) -> float | None:
    if s is None:
        return None
    try:
        f = float(s)
    except (TypeError, ValueError):
        return None
    return None if f != f else f


def to_bool(s: str | None) -> bool | None:
    if s is None or s in UNAVAILABLE:
        return None
    n = to_num(s)
    if n is not None:
        return n > 0
    low = s.strip().lower()
    if low in ON_WORDS:
        return True
    if low in OFF_WORDS:
        return False
    return None


def is_fault(s: str | None) -> bool:
    """A fault entity: on / non-zero code / any text other than ok-ish words = fault."""
    if s is None or s in UNAVAILABLE:
        return False
    n = to_num(s)
    if n is not None:
        return n != 0
    return s.strip().lower() not in OFF_WORDS


def watts(r: Reading | None) -> float | None:
    if r is None:
        return None
    v = to_num(r.state)
    if v is None:
        return None
    u = (r.unit or "W").strip()
    return v * 1000 if u == "kW" else v * 1e6 if u == "MW" else v


def kwh(r: Reading | None) -> float | None:
    if r is None:
        return None
    v = to_num(r.state)
    if v is None:
        return None
    u = (r.unit or "kWh").strip()
    return v / 1000 if u == "Wh" else v * 1000 if u == "MWh" else v


def percent(r: Reading | None) -> float | None:
    if r is None:
        return None
    v = to_num(r.state)
    if v is None:
        return None
    if r.unit != "%" and 0 <= v <= 1:
        v *= 100      # 0-1 fraction
    return max(0.0, min(100.0, v))


def supply_ok(r: Reading | None) -> bool | None:
    """Supply present: a voltage above 150 V, or an on/off sensor that is on."""
    if r is None or r.state in UNAVAILABLE:
        return None
    v = to_num(r.state)
    if v is not None and (r.unit == "V" or v > 1):
        return v >= SUPPLY_MIN_V
    return to_bool(r.state)


# ---------------------------------------------------------------- status
def point_status(point: dict, read: Callable[[str], Reading | None], pump: dict | None = None,
                 energy_today: float | None = None, energy_month: float | None = None) -> dict:
    """Work out what the map shows for one point.

    read(entity_id) -> Reading or None when the entity doesn't exist.
    pump: a Hamlet Pump snapshot when the point is linked to one.
    Returns {status, cls, running, on, alert, values}. cls is one of
    run / on / off / warn / bad / offline / info – the marker colour.
    """
    ents = point.get("entities", {})
    r = {k: read(e) if e else None for k, e in ents.items()}
    missing = [k for k, e in ents.items() if r.get(k) is None]
    values: dict[str, Any] = {}

    w = watts(r.get("power"))
    if w is not None:
        values["power_w"] = round(w, 1)
    e = kwh(r.get("energy"))
    if e is not None:
        values["energy_kwh"] = round(e, 3)
    if energy_today is not None:
        values["energy_today_kwh"] = round(energy_today, 2)
    if energy_month is not None:
        values["energy_month_kwh"] = round(energy_month, 1)
    lvl = percent(r.get("level"))
    if lvl is not None:
        values["level"] = round(lvl, 1)
    for k in ("pressure", "flow"):
        if (rd := r.get(k)) is not None and (n := to_num(rd.state)) is not None:
            values[k] = round(n, 2)
            values[f"{k}_unit"] = rd.unit or ""
    if (rd := r.get("angle")) is not None and (n := to_num(rd.state)) is not None:
        values["angle"] = round(n % 360, 1)
    if (rd := r.get("supply")) is not None and (n := to_num(rd.state)) is not None and (rd.unit == "V" or n > 1):
        values["voltage"] = round(n)
    ctl = r.get("control")
    on = to_bool(ctl.state) if ctl is not None else None
    if ctl is not None:
        values["control_state"] = ctl.state

    running = None
    if (rd := r.get("running")) is not None:
        running = to_bool(rd.state)
    elif w is not None and point.get("type") not in ("eskom", "transformer", "solar", "building", "weather"):
        running = w >= RUNNING_MIN_W
    elif on is not None and point.get("type") in ("pump", "booster", "pivot", "generator"):
        running = on

    def out(status: str, cls: str, run: bool | None = running) -> dict:
        return {"status": status, "cls": cls, "running": bool(run), "on": on,
                "alert": cls in ("bad", "warn", "offline"), "values": values, "missing": missing}

    # 1. Hamlet Pump link: its own logic knows best
    if pump:
        d = pump.get("decision") or {}
        live = pump.get("live") or {}
        st = d.get("status") or "…"
        prun = bool(live.get("running"))
        if (pw := live.get("power")) is not None and "power_w" not in values:
            values["power_w"] = round(float(pw), 1)
        if (pl := live.get("level")) is not None and "level" not in values:
            values["level"] = round(float(pl), 1)
        if (pp := live.get("pressure")) is not None and "pressure" not in values:
            values["pressure"], values["pressure_unit"] = round(float(pp), 2), "bar"
        values["pump_mode"] = pump.get("mode")
        values["pump_reason"] = pump.get("fault") or d.get("reason") or ""
        if pump.get("fault") or st in PUMP_BAD:
            return out("Locked out" if pump.get("fault") else st, "bad", prun)
        if st in PUMP_WARN:
            return out(st, "warn", prun)
        if prun:
            return out(st if st not in ("On", "Auto") else "Running", "run", True)
        if st == "Off" or pump.get("mode") == "off":
            return out("Off", "off", False)
        return out(st, "on", False)

    # 2. nothing mapped -> just a marker
    if not ents:
        return out("", "info", False)

    # 3. offline: a core entity is missing / unavailable
    core_bad = [k for k in CORE_KEYS if k in ents and (r.get(k) is None or r[k].state in UNAVAILABLE)]
    if core_bad:
        hint = "no power or Wi-Fi?" if point.get("type") == "eskom" else "no signal"
        return out(f"Offline – {hint}", "offline", False)

    # 4. faults
    if (rd := r.get("fault")) is not None and is_fault(rd.state):
        s = rd.state.strip()
        if to_num(s) is not None:
            txt = f"Fault code {s}"
        elif s.lower() in ("on", "true", "problem", "yes"):
            txt = "Fault"
        else:
            txt = f"Fault: {s[:24]}"
        return out(txt, "bad")

    # 5. supply lost (Eskom point, or anything with a supply sensor)
    sup = supply_ok(r.get("supply"))
    if sup is False:
        return out("No power", "bad", False)

    # 6. transformer load (kW against kVA – an estimate, power factor taken as 1);
    #    for an Eskom point against its notified maximum demand (NMD) when known, else the transformer size
    sp = point.get("specs") or {}
    if point.get("type") in ("transformer", "eskom") and w is not None:
        cap = (sp.get("nmd") or sp.get("kva")) if point["type"] == "eskom" else sp.get("kva")
        if cap:
            load = w / (cap * 1000) * 100
            values["load_pct"] = round(load, 1)
            if load > 100:
                what = "Above NMD" if point["type"] == "eskom" and sp.get("nmd") else "Overloaded"
                return out(f"{what} · {load:.0f}%", "bad" if load > 120 else "warn", False)

    # 6b. tank low
    low = point.get("low_level") or 0
    if lvl is not None and low and lvl < low:
        return out(f"Low · {lvl:.0f}%", "warn")

    # 7. running / on / off
    if running:
        if point.get("type") == "pivot" and "angle" in values:
            return out(f"Running · {values['angle']:.0f}°", "run", True)
        return out("Running", "run", True)
    if point.get("type") == "gate" and on is not None:
        return out("Open" if on else "Closed", "warn" if on else "off")
    if point.get("type") == "valve" and on is not None:
        return out("Open" if on else "Closed", "on" if on else "off")
    if on is True:
        return out("On", "on")
    if on is False or running is False:
        return out("Off", "off", False)
    if sup is True:
        if "load_pct" in values:
            return out(f"Power on · {values['load_pct']:.0f}% load", "on", False)
        return out("Power on", "on", False)
    if lvl is not None:
        return out(f"{lvl:.0f}%", "on", False)
    return out("OK", "info", False)


def summary(points: list[dict], statuses: dict[str, dict]) -> dict:
    """Counts for the header and the sensors."""
    run = sum(1 for p in points if statuses.get(p["id"], {}).get("running"))
    alerts = [p["name"] for p in points if p.get("alert", True) and statuses.get(p["id"], {}).get("alert")]
    offline = sum(1 for p in points if statuses.get(p["id"], {}).get("cls") == "offline")
    grid = [statuses.get(p["id"], {}).get("values", {}).get("power_w") for p in points if p["type"] == "eskom"]
    grid = [g for g in grid if g is not None]
    today = [statuses.get(p["id"], {}).get("values", {}).get("energy_today_kwh") for p in points if p["type"] == "eskom"]
    today = [t for t in today if t is not None]
    return {
        "total": len(points),
        "running": run,
        "alerts": len(alerts),
        "alert_names": alerts,
        "offline": offline,
        "grid_w": round(sum(grid), 1) if grid else None,
        "grid_kwh_today": round(sum(today), 2) if today else None,
    }
