"""End-to-end tests inside a real Home Assistant instance (pytest-homeassistant-custom-component)."""
from datetime import timedelta

import pytest
from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import async_fire_time_changed, async_mock_service

DOMAIN = "hamlet_farm"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield


async def _reply(ws, mid):
    """Next result for message id, skipping subscription events."""
    while True:
        r = await ws.receive_json()
        if r["id"] == mid and r["type"] == "result":
            return r


async def _setup(hass):
    for mod in ("http", "frontend"):
        assert await async_setup_component(hass, mod, {})
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["step_id"] == "user"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"name": "Doornkloof"})
    assert result["type"] == "create_entry"
    await hass.async_block_till_done()
    return result["result"]


async def test_farm_map(hass: HomeAssistant, hass_ws_client, freezer):
    entry = await _setup(hass)
    assert "hamlet-farm" in hass.data["frontend_panels"]
    notify = async_mock_service(hass, "notify", "mobile_app_wynand")
    hass.states.async_set("switch.borehole", "on")
    hass.states.async_set("sensor.borehole_power", "1500", {"unit_of_measurement": "W"})
    hass.states.async_set("sensor.eskom_voltage", "232", {"unit_of_measurement": "V"})
    hass.states.async_set("sensor.eskom_power", "4.2", {"unit_of_measurement": "kW"})
    hass.states.async_set("sensor.eskom_kwh", "1000", {"unit_of_measurement": "kWh"})

    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": f"{DOMAIN}/list"})
    r = await ws.receive_json()
    assert r["result"] == [{"entry_id": entry.entry_id, "name": "Doornkloof"}]

    await ws.send_json({"id": 2, "type": f"{DOMAIN}/save_point", "entry_id": entry.entry_id, "point": {
        "name": "Borehole 1", "type": "pump", "lat": -25.7, "lng": 28.2,
        "entities": {"control": "switch.borehole", "power": "sensor.borehole_power"}}})
    r = await ws.receive_json()
    assert r["success"], r
    bh = r["result"]["result"]["id"]
    assert r["result"]["statuses"][bh]["status"] == "Running"

    await ws.send_json({"id": 3, "type": f"{DOMAIN}/save_point", "entry_id": entry.entry_id, "point": {
        "name": "Eskom main", "type": "eskom", "lat": -25.71, "lng": 28.21,
        "entities": {"supply": "sensor.eskom_voltage", "power": "sensor.eskom_power", "energy": "sensor.eskom_kwh"}}})
    r = await ws.receive_json()
    esk = r["result"]["result"]["id"]
    await ws.send_json({"id": 4, "type": f"{DOMAIN}/save_settings", "entry_id": entry.entry_id,
                        "settings": {"notify_service": "notify.mobile_app_wynand", "alert_delay_s": 30}})
    assert (await ws.receive_json())["success"]
    await ws.send_json({"id": 5, "type": f"{DOMAIN}/save_shape", "entry_id": entry.entry_id,
                        "shape": {"kind": "pipe", "coords": [[-25.7, 28.2], [-25.71, 28.21]]}})
    assert (await ws.receive_json())["success"]

    await hass.async_block_till_done()
    assert hass.states.get("sensor.doornkloof_running").state == "1"
    assert float(hass.states.get("sensor.doornkloof_eskom_power").state) == 4200
    assert hass.states.get("sensor.doornkloof_alerts").state == "0"

    # energy today counts from the first reading
    hass.states.async_set("sensor.eskom_kwh", "1012.5", {"unit_of_measurement": "kWh"})
    await hass.async_block_till_done()
    freezer.tick(timedelta(seconds=5))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert float(hass.states.get("sensor.doornkloof_eskom_energy_today").state) == 12.5

    # Eskom goes off -> alert after the delay, back on -> cleared
    hass.states.async_set("sensor.eskom_voltage", "0", {"unit_of_measurement": "V"})
    await hass.async_block_till_done()
    freezer.tick(timedelta(seconds=16))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get("sensor.doornkloof_alerts").state == "1"
    assert not notify
    freezer.tick(timedelta(seconds=34))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert notify and "Eskom main: No power" in notify[-1].data["message"]
    hass.states.async_set("sensor.eskom_voltage", "230", {"unit_of_measurement": "V"})
    await hass.async_block_till_done()
    freezer.tick(timedelta(seconds=20))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert "back to normal" in notify[-1].data["message"]

    # subscribe gets a snapshot
    await ws.send_json({"id": 6, "type": f"{DOMAIN}/subscribe", "entry_id": entry.entry_id})
    assert (await ws.receive_json())["success"]
    ev = await ws.receive_json()
    assert ev["event"]["statuses"][esk]["status"] == "Power on"
    assert len(ev["event"]["shapes"]) == 1 and ev["event"]["events"]

    # bad input is rejected
    await ws.send_json({"id": 7, "type": f"{DOMAIN}/save_point", "entry_id": entry.entry_id, "point": {"name": "x"}})
    assert not (await _reply(ws, 7))["success"]

    # delete + survives reload
    await ws.send_json({"id": 8, "type": f"{DOMAIN}/delete_point", "entry_id": entry.entry_id, "point_id": bh})
    assert (await _reply(ws, 8))["success"]
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    c = hass.data[DOMAIN][entry.entry_id]
    assert [p["name"] for p in c.points] == ["Eskom main"] and c.settings["notify_service"] == "notify.mobile_app_wynand"


async def test_non_admin_cannot_edit(hass: HomeAssistant, hass_ws_client, hass_read_only_access_token):
    entry = await _setup(hass)
    ws = await hass_ws_client(hass, hass_read_only_access_token)
    await ws.send_json({"id": 1, "type": f"{DOMAIN}/save_point", "entry_id": entry.entry_id, "point": {"lat": 1, "lng": 2}})
    r = await ws.receive_json()
    assert not r["success"] and r["error"]["code"] == "unauthorized"
    await ws.send_json({"id": 2, "type": f"{DOMAIN}/state", "entry_id": entry.entry_id})
    r = await ws.receive_json()
    assert r["success"] and r["result"]["is_admin"] is False
