"""Unit tests for the pure farm-map logic."""
import pytest

from custom_components.hamlet_farm import logic
from custom_components.hamlet_farm.logic import Reading


def reader(states: dict):
    def read(e):
        v = states.get(e)
        if v is None:
            return None
        return v if isinstance(v, Reading) else Reading(str(v))
    return read


def pt(**kw):
    base = {"lat": -25.7, "lng": 28.2, "name": "P", "type": "pump"}
    return logic.clean_point({**base, **kw})


def test_clean_point_validates():
    p = pt(entities={"control": "Switch.Borehole", "power": "bad id!", "nope": "sensor.x"}, extra=["camera.a", "camera.a", "x"], radius=99999)
    assert p["entities"] == {"control": "switch.borehole"}
    assert p["extra"] == ["camera.a"]
    assert p["radius"] == 3000 and p["alert"] is True and len(p["id"]) == 8
    with pytest.raises(ValueError):
        logic.clean_point({"name": "x"})
    assert logic.clean_point({"lat": 1, "lng": 2, "type": "weird"})["type"] == "other"


def test_sketch_shape():
    s = logic.clean_shape({"kind": "sketch", "color": "#FFCC00", "coords": [[1, 2], [1.0001, 2.0001]]})
    assert s["color"] == "#ffcc00" and s["name"] == "Drawing"
    assert logic.clean_shape({"kind": "sketch", "color": "javascript:x", "coords": [[1, 2], [3, 4]]})["color"] == "#ff3b30"
    assert "color" not in logic.clean_shape({"kind": "pipe", "color": "#ffcc00", "coords": [[1, 2], [3, 4]]})


def test_clean_shape():
    assert logic.clean_shape({"kind": "sketch", "show_len": 1, "coords": [[1, 2], [3, 4]]})["show_len"] is True
    assert "show_len" not in logic.clean_shape({"kind": "pipe", "coords": [[1, 2], [3, 4]]})
    s = logic.clean_shape({"kind": "pipe", "coords": [[1, 2], [3, 4]]})
    assert s["name"] == "Water pipe"
    with pytest.raises(ValueError):
        logic.clean_shape({"kind": "field", "coords": [[1, 2], [3, 4]]})
    with pytest.raises(ValueError):
        logic.clean_shape({"kind": "pipe", "coords": [[1, "x"], [3, 4]]})


def test_pump_running_from_power_and_offline():
    p = pt(entities={"control": "switch.bh", "power": "sensor.bh_p"})
    st = logic.point_status(p, reader({"switch.bh": "on", "sensor.bh_p": Reading("1.2", "kW")}))
    assert st["cls"] == "run" and st["values"]["power_w"] == 1200
    st = logic.point_status(p, reader({"switch.bh": "on", "sensor.bh_p": "5"}))   # relay on, pump not drawing
    assert st["cls"] == "on" and not st["running"]
    st = logic.point_status(p, reader({"switch.bh": "off", "sensor.bh_p": "0"}))
    assert st["cls"] == "off" and st["status"] == "Off"
    st = logic.point_status(p, reader({"switch.bh": "unavailable", "sensor.bh_p": "5"}))
    assert st["cls"] == "offline" and st["alert"]
    st = logic.point_status(p, reader({"sensor.bh_p": "5"}))     # entity deleted
    assert st["cls"] == "offline"


def test_eskom_supply():
    p = pt(type="eskom", entities={"supply": "sensor.v", "power": "sensor.p"})
    st = logic.point_status(p, reader({"sensor.v": Reading("231", "V"), "sensor.p": "3400"}))
    assert st["status"] == "Power on" and st["values"]["voltage"] == 231 and not st["running"]
    st = logic.point_status(p, reader({"sensor.v": Reading("0", "V"), "sensor.p": "0"}))
    assert st["status"] == "No power" and st["cls"] == "bad"
    p2 = pt(type="eskom", entities={"supply": "binary_sensor.grid"})
    assert logic.point_status(p2, reader({"binary_sensor.grid": "off"}))["status"] == "No power"
    assert logic.point_status(p2, reader({"binary_sensor.grid": "unavailable"}))["cls"] == "offline"


def test_fault_and_low_level():
    p = pt(type="tank", entities={"level": "sensor.l", "fault": "sensor.code"}, low_level=25)
    assert logic.point_status(p, reader({"sensor.l": "0.2", "sensor.code": "0"}))["status"] == "Low · 20%"
    assert logic.point_status(p, reader({"sensor.l": "60", "sensor.code": "0"}))["status"] == "60%"
    assert logic.point_status(p, reader({"sensor.l": "60", "sensor.code": "14"}))["status"] == "Fault code 14"


def test_pivot_angle():
    p = pt(type="pivot", radius=400, entities={"running": "binary_sensor.run", "angle": "sensor.ang"})
    st = logic.point_status(p, reader({"binary_sensor.run": "on", "sensor.ang": "370"}))
    assert st["status"] == "Running · 10°" and st["values"]["angle"] == 10


def test_gate_and_info():
    g = pt(type="gate", entities={"control": "cover.gate"})
    assert logic.point_status(g, reader({"cover.gate": "open"}))["status"] == "Open"
    assert logic.point_status(g, reader({"cover.gate": "closed"}))["status"] == "Closed"
    assert logic.point_status(pt(type="building"), reader({}))["cls"] == "info"


def test_hamlet_pump_link():
    p = pt(pump_entry="abc")
    snap = {"mode": "auto", "fault": None, "decision": {"status": "Filling", "reason": "Tank at 30%"}, "live": {"running": True, "power": 1100, "level": 30}}
    st = logic.point_status(p, reader({}), snap)
    assert st["cls"] == "run" and st["status"] == "Filling" and st["values"]["level"] == 30
    snap["fault"] = "Dry-run 3 times"
    assert logic.point_status(p, reader({}), snap)["cls"] == "bad"


def test_summary():
    pts = [pt(id="a", type="eskom"), pt(id="b"), pt(id="c", alert=False)]
    sts = {"a": {"values": {"power_w": 500, "energy_today_kwh": 3}, "alert": False}, "b": {"running": True, "alert": True, "cls": "bad"},
           "c": {"alert": True, "cls": "offline"}}
    s = logic.summary(pts, sts)
    assert s["running"] == 1 and s["alerts"] == 1 and s["offline"] == 1 and s["grid_w"] == 500 and s["grid_kwh_today"] == 3


def test_transformer():
    p = pt(type="transformer", specs={"kva": "200", "primary": "11 kV", "secondary": "400 V", "junk": "x"},
           entities={"supply": "sensor.v", "power": "sensor.p"})
    assert p["specs"] == {"kva": 200, "primary": "11 kV", "secondary": "400 V"}
    st = logic.point_status(p, reader({"sensor.v": Reading("230", "V"), "sensor.p": Reading("90", "kW")}))
    assert st["status"] == "Power on · 45% load" and st["values"]["load_pct"] == 45
    st = logic.point_status(p, reader({"sensor.v": Reading("230", "V"), "sensor.p": Reading("230", "kW")}))
    assert st["cls"] == "warn" and st["status"].startswith("Overloaded")
    assert pt(type="pump", specs={"kva": 5})["specs"] == {}


def test_cable_kinds():
    for k, n in (("cable", "Cable 1 000 V"), ("cable3300", "Cable 3 300 V"), ("mv", "MV cable")):
        s = logic.clean_shape({"kind": k, "info": "95 mm² 4-core Cu SWA", "coords": [[1, 2], [3, 4]]})
        assert s["name"] == n and s["info"] == "95 mm² 4-core Cu SWA"


def test_eskom_specs():
    p = pt(type="eskom", specs={"account": "1234567890", "pole": "MV-22/118", "kva": "100", "nmd": 70, "tariff": "Ruraflex"},
           entities={"supply": "sensor.v", "power": "sensor.p"})
    assert p["specs"] == {"kva": 100, "nmd": 70, "account": "1234567890", "pole": "MV-22/118", "tariff": "Ruraflex"}
    st = logic.point_status(p, reader({"sensor.v": Reading("231", "V"), "sensor.p": Reading("35", "kW")}), energy_month=812.4)
    assert st["status"] == "Power on · 50% load" and st["values"]["energy_month_kwh"] == 812.4
    st = logic.point_status(p, reader({"sensor.v": Reading("231", "V"), "sensor.p": Reading("75", "kW")}))
    assert st["status"] == "Above NMD · 107%" and st["cls"] == "warn"


def test_point_cards_yaml_kept():
    y = "type: custom:panel-meter-card\nenergy: sensor.kwh\n"
    assert pt(cards=y)["cards"] == y
    assert len(pt(cards="x" * 20000)["cards"]) == 10000


def test_manual_md_up_to_date():
    """MANUAL.md on GitHub must match the in-app manual (run: python3 tools/make_manual.py)."""
    import importlib.util
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    spec = importlib.util.spec_from_file_location("make_manual", root / "tools" / "make_manual.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert (root / "MANUAL.md").read_text(encoding="utf-8") == mod.convert(mod.SRC.read_text(encoding="utf-8"))


def test_shape_notes():
    assert logic.clean_shape({"kind": "pipe", "notes": "110 mm HDPE, 1 m deep", "coords": [[1, 2], [3, 4]]})["notes"] == "110 mm HDPE, 1 m deep"


def test_point_colour_and_icon():
    p = pt(color="#E53935", icon="mdi:water-well")
    assert p["color"] == "#e53935" and p["icon"] == "mdi:water-well"
    p = pt(color="red; background:url(x)", icon="javascript:alert(1)")
    assert p["color"] == "" and p["icon"] == ""


def test_sticky_note():
    s = logic.clean_shape({"kind": "sticky", "coords": [[-25.1, 28.2], [-25.2, 28.3]], "notes": "New borehole here?", "color": "#A5D6A7", "hidden": True})
    assert s["coords"] == [[-25.1, 28.2]] and s["color"] == "#a5d6a7" and s["hidden"] and s["notes"] == "New borehole here?"
    assert logic.clean_shape({"kind": "sticky", "coords": [[-25.1, 28.2]], "name": "Ask Piet", "color": "red"})["color"] == "#fff176"
    with pytest.raises(ValueError):
        logic.clean_shape({"kind": "sticky", "coords": [[-25.1, 28.2]]})
    with pytest.raises(ValueError):
        logic.clean_shape({"kind": "sticky", "coords": [], "notes": "x"})


def test_temperature_probe():
    p = logic.clean_point({"name": "Frost probe", "type": "probe", "lat": -25.1, "lng": 28.2,
                           "entities": {"temperature": "sensor.outside_temp", "humidity": "sensor.outside_rh"}, "temp_low": "1", "temp_high": ""})
    assert p["temp_low"] == 1 and p["temp_high"] is None
    rd = lambda v, u="°C": (lambda e: logic.Reading(v, u) if e == "sensor.outside_temp" else logic.Reading("64", "%"))
    st = logic.point_status(p, rd("18.44"))
    assert st["status"] == "18.4 °C · 64%" and st["cls"] == "on" and st["values"]["temp"] == 18.4 and st["values"]["humidity"] == 64
    st = logic.point_status(p, rd("-1.5"))
    assert st["status"] == "Cold · -1.5 °C" and st["cls"] == "warn" and st["alert"]
    assert logic.point_status(p, rd("50", "°F"))["values"]["temp"] == 10.0
    # a probe going offline is not a core entity -> point keeps its other status
    assert logic.point_status(p, lambda e: None)["cls"] != "offline"


IRR_SNAP = {"type": "irrigation", "mode": "auto", "fault": None, "zones": ["Front lawn", "Orchard", "Veggies"], "next": "2026-11-11T05:00:00+02:00",
            "decision": {"status": "Watering", "reason": "Morning: zone 2 until 05:18", "on": True, "zone": 1, "program": "Morning"},
            "live": {"running": True, "power": 1400, "pressure": 3.1, "zones": [False, True, False]}}


def test_irrigation_point_zones():
    p = pt(type="irrigation", pump_entry="irr", zones=["f1", "bad id!", "f3", "", ""])
    assert p["zones"] == ["f1", "", "f3"]                      # bad ids dropped, trailing blanks trimmed
    assert pt(type="pump", zones=["f1"])["zones"] == []         # only irrigation points keep zones
    st = logic.point_status(p, reader({}), IRR_SNAP)
    assert st["cls"] == "run" and st["status"] == "Watering"
    assert [z["open"] for z in st["values"]["zones"]] == [False, True, False]
    assert st["values"]["zones"][1] == {"name": "Orchard", "open": True, "active": True}
    assert st["values"]["program"] == "Morning" and st["values"]["next_program"]


def test_watering_zones_on_land():
    p = pt(id="irr1", type="irrigation", pump_entry="irr", zones=["f1", "f2", "f3"])
    sts = {"irr1": logic.point_status(p, reader({}), IRR_SNAP)}
    w = logic.watering_zones([p, pt(id="x")], sts)
    assert w == {"f1": {"point": "irr1", "zone": 0, "name": "Front lawn", "open": False},
                 "f2": {"point": "irr1", "zone": 1, "name": "Orchard", "open": True},
                 "f3": {"point": "irr1", "zone": 2, "name": "Veggies", "open": False}}
    # pump not loaded yet: zones still linked, nothing open
    w = logic.watering_zones([p], {"irr1": logic.point_status(p, reader({}))})
    assert w["f2"] == {"point": "irr1", "zone": 1, "name": "Zone 2", "open": False}
    # two zones on the same camp: the open one wins
    p2 = pt(id="irr1", type="irrigation", zones=["f2", "f2"])
    assert logic.watering_zones([p2], sts)["f2"]["open"] is True


def test_irrigation_specs():
    assert pt(type="irrigation", specs={"motor_kw": 2.2, "pressure_set": "PID 3 bar", "depth": 80})["specs"] == {"motor_kw": 2.2, "pressure_set": "PID 3 bar"}
