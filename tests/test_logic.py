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
    assert logic.clean_shape({"kind": "cable", "coords": [[1, 2], [3, 4]]})["name"] == "Electrical cable"
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
