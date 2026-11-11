"""Who may see and do what on a farm (per Home Assistant user).

Home Assistant admins always have full access. Everyone else gets the farm's
"everyone else" rule, or their own rule if an admin gave them one.
"""
from __future__ import annotations

ROLES = ("none", "view", "edit")          # no access | look only | edit the map (points, lines, notes)
HIDE_KEYS = ("electric", "water", "services", "prices", "history", "log")

ELECTRIC_POINTS = {"eskom", "transformer", "solar", "generator"}
ELECTRIC_SHAPES = {"cable400", "cable", "cable3300", "mv", "power"}
WATER_POINTS = {"pump", "booster", "pivot", "irrigation", "tank", "valve"}
WATER_SHAPES = {"pipe"}

DEFAULT_RULE = {"role": "view", "log": True, "control": True, "services_edit": False, "hide": []}
FULL = {"admin": True, "role": "edit", "log": True, "control": True, "services_edit": True, "hide": []}


def clean_rule(raw) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    role = raw.get("role") if raw.get("role") in ROLES else "view"
    hide = [h for h in HIDE_KEYS if h in (raw.get("hide") or [])]
    return {
        "role": role,
        "log": bool(raw.get("log", True)),               # may add notes / photos / files to the site log
        "control": bool(raw.get("control", True)),       # may switch pumps and equipment from the map
        "services_edit": bool(raw.get("services_edit", False)),   # may write service reports
        "hide": hide,
    }


def clean_access(raw) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    users = raw.get("users") if isinstance(raw.get("users"), dict) else {}
    return {
        "default": clean_rule(raw.get("default") or DEFAULT_RULE),
        "users": {str(uid)[:64]: clean_rule(rule) for uid, rule in list(users.items())[:200]},
    }


def perms_for(access: dict, user) -> dict:
    """The effective rule for one user (admins: everything)."""
    if user is None:
        return {**DEFAULT_RULE, "role": "none", "admin": False}
    if user.is_admin:
        return dict(FULL)
    rule = (access.get("users") or {}).get(user.id) or access.get("default") or DEFAULT_RULE
    out = clean_rule(rule)
    out["admin"] = False
    if out["role"] == "none":
        out.update(log=False, control=False, services_edit=False)
    if "log" in out["hide"]:
        out["log"] = False
    if "services" in out["hide"]:
        out["services_edit"] = False
    return out


def point_hidden(perms: dict, point: dict) -> bool:
    hide = perms.get("hide") or []
    t = point.get("type")
    return ("electric" in hide and t in ELECTRIC_POINTS) or ("water" in hide and t in WATER_POINTS)


def shape_hidden(perms: dict, shape: dict) -> bool:
    hide = perms.get("hide") or []
    k = shape.get("kind")
    if shape.get("hidden") and perms.get("role") != "edit":
        return True                      # planning lines / notes: editors and admins only
    return ("electric" in hide and k in ELECTRIC_SHAPES) or ("water" in hide and k in WATER_SHAPES)


PRICE_KEYS = ("vat", "total", "subtotal", "vat_amount", "callout", "labour")


def strip_prices(report: dict) -> dict:
    r = {k: v for k, v in report.items() if k not in PRICE_KEYS}
    r["items"] = [{k: v for k, v in (i or {}).items() if k not in ("price", "total")} for i in report.get("items") or []]
    r["prices_hidden"] = True
    return r
