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


def _jpeg() -> str:
    import base64
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (256, 256), (90, 110, 60)).save(buf, "JPEG")
    return base64.b64encode(buf.getvalue()).decode()


async def test_offline_picture(hass: HomeAssistant, hass_ws_client, hass_client, hass_client_no_auth):
    entry = await _setup(hass)
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": f"{DOMAIN}/offline_create", "entry_id": entry.entry_id,
                        "layer": {"name": "NGI 2527DC", "bounds": [[-25.9, 28.0], [-25.8, 28.2]], "minzoom": 14, "maxzoom": 18}})
    r = await _reply(ws, 1)
    assert r["success"], r
    layer = r["result"]["result"]
    assert r["result"]["offline"] == []          # not shown until finished

    client = await hass_client()
    url = f"/api/hamlet_farm/upload/{entry.entry_id}/{layer['id']}"
    resp = await client.post(url, json={"tiles": [[18, 150000, 140000, "jpg", _jpeg()], [17, 75000, 70000, "jpg", _jpeg()]]})
    assert resp.status == 200, await resp.text()
    assert (await resp.json())["count"] == 2
    resp = await client.post(url, json={"tiles": [[18, 1, 1, "jpg", "bm90IGFuIGltYWdl"]]})   # not an image
    assert resp.status == 400

    await ws.send_json({"id": 2, "type": f"{DOMAIN}/offline_finish", "entry_id": entry.entry_id, "layer_id": layer["id"]})
    r = await _reply(ws, 2)
    assert r["success"] and r["result"]["offline"][0]["count"] == 2
    tile_url = r["result"]["tile_url"]

    anon = await hass_client_no_auth()
    resp = await anon.get(f"{tile_url}/{layer['id']}/18/150000/140000")
    assert resp.status == 200 and resp.content_type == "image/jpeg"
    resp = await anon.get(f"{tile_url}/{layer['id']}/18/1/2")                 # not covered -> transparent
    assert resp.status == 200 and resp.content_type == "image/png"
    resp = await anon.get(f"/api/hamlet_farm/tiles/wrong/{layer['id']}/18/150000/140000")
    assert resp.status == 404
    resp = await anon.post(url, json={"tiles": []})
    assert resp.status == 401

    folder = hass.config.path("hamlet_farm", entry.entry_id, layer["id"])
    import os
    assert os.path.isdir(folder)
    await ws.send_json({"id": 3, "type": f"{DOMAIN}/offline_delete", "entry_id": entry.entry_id, "layer_id": layer["id"]})
    r = await _reply(ws, 3)
    assert r["success"] and r["result"]["offline"] == []
    assert not os.path.exists(folder)

    # an unfinished upload is cleaned up on restart
    await ws.send_json({"id": 4, "type": f"{DOMAIN}/offline_create", "entry_id": entry.entry_id,
                        "layer": {"bounds": [[-25.9, 28.0], [-25.8, 28.2]]}})
    lid = (await _reply(ws, 4))["result"]["result"]["id"]
    await client.post(f"/api/hamlet_farm/upload/{entry.entry_id}/{lid}", json={"tiles": [[18, 150000, 140000, "jpg", _jpeg()]]})
    await hass.data[DOMAIN][entry.entry_id]._store.async_save(hass.data[DOMAIN][entry.entry_id]._data())
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert hass.data[DOMAIN][entry.entry_id].offline == []
    assert not os.path.exists(hass.config.path("hamlet_farm", entry.entry_id, lid))


async def test_offline_upload_admin_only(hass: HomeAssistant, hass_ws_client, hass_client, hass_read_only_access_token):
    entry = await _setup(hass)
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": f"{DOMAIN}/offline_create", "entry_id": entry.entry_id,
                        "layer": {"bounds": [[-25.9, 28.0], [-25.8, 28.2]]}})
    lid = (await _reply(ws, 1))["result"]["result"]["id"]
    ro = await hass_client(hass_read_only_access_token)
    resp = await ro.post(f"/api/hamlet_farm/upload/{entry.entry_id}/{lid}", json={"tiles": []})
    assert resp.status == 403


async def test_notes_and_photos(hass: HomeAssistant, hass_ws_client, hass_client, hass_client_no_auth, hass_read_only_access_token):
    import base64
    import os
    entry = await _setup(hass)
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": f"{DOMAIN}/save_point", "entry_id": entry.entry_id,
                        "point": {"name": "Borehole 1", "type": "pump", "lat": -25.7, "lng": 28.2}})
    pid = (await _reply(ws, 1))["result"]["result"]["id"]

    client = await hass_client()
    resp = await client.post(f"/api/hamlet_farm/photo/{entry.entry_id}", data=base64.b64decode(_jpeg()))
    assert resp.status == 200, await resp.text()
    photo = (await resp.json())["photo"]
    resp = await client.post(f"/api/hamlet_farm/photo/{entry.entry_id}", data=b"not a jpeg")
    assert resp.status == 400

    await ws.send_json({"id": 2, "type": f"{DOMAIN}/note_add", "entry_id": entry.entry_id, "target": pid,
                        "text": "Replaced the pressure switch", "photo": photo})
    r = await _reply(ws, 2)
    assert r["success"], r
    note = r["result"]["note"]
    assert note["user"] and note["photo"] == photo
    await ws.send_json({"id": 3, "type": f"{DOMAIN}/note_add", "entry_id": entry.entry_id, "target": "nope", "text": "x"})
    assert not (await _reply(ws, 3))["success"]
    await ws.send_json({"id": 4, "type": f"{DOMAIN}/state", "entry_id": entry.entry_id})
    st = (await _reply(ws, 4))["result"]
    assert st["note_counts"] == {pid: 1}

    anon = await hass_client_no_auth()
    resp = await anon.get(f"{st['photo_url']}/{photo}")
    assert resp.status == 200 and resp.content_type == "image/jpeg"
    resp = await anon.get(f"/api/hamlet_farm/photos/wrong/{photo}")
    assert resp.status == 404

    await ws.send_json({"id": 30, "type": f"{DOMAIN}/search", "entry_id": entry.entry_id, "q": "pressure SWITCH"})
    hits = (await _reply(ws, 30))["result"]["notes"]
    assert len(hits) == 1 and hits[0]["target"] == pid and hits[0]["name"] == "Borehole 1" and hits[0]["photo"]
    await ws.send_json({"id": 31, "type": f"{DOMAIN}/search", "entry_id": entry.entry_id, "q": "nothing like this"})
    assert (await _reply(ws, 31))["result"]["notes"] == []

    # PDF attachment on a note
    resp = await client.post(f"/api/hamlet_farm/file/{entry.entry_id}/new", data=b"%PDF-1.4 manual")
    assert resp.status == 200
    up = await resp.json()
    assert up["mime"] == "application/pdf"
    await ws.send_json({"id": 32, "type": f"{DOMAIN}/note_add", "entry_id": entry.entry_id, "target": pid, "text": "",
                        "file": {"id": up["file"], "name": "Pump manual.pdf", "mime": up["mime"], "size": up["size"]}})
    r = await _reply(ws, 32)
    assert r["success"] and r["result"]["note"]["file_name"] == "Pump manual.pdf"
    resp = await client.get(f"/api/hamlet_farm/file/{entry.entry_id}/{up['file']}")
    assert resp.status == 200 and resp.content_type == "application/pdf"
    resp = await anon.get(f"/api/hamlet_farm/file/{entry.entry_id}/{up['file']}")
    assert resp.status == 401
    resp = await client.post(f"/api/hamlet_farm/file/{entry.entry_id}/new", data=b"MZ exe")
    assert resp.status == 400
    fpath = hass.config.path("hamlet_farm", entry.entry_id, "files", up["file"])
    assert os.path.exists(fpath)

    # a read-only (non-admin) user can add notes but not delete someone else's
    ro = await hass_ws_client(hass, hass_read_only_access_token)
    await ro.send_json({"id": 1, "type": f"{DOMAIN}/note_add", "entry_id": entry.entry_id, "target": pid, "text": "Checked, all OK"})
    r = await _reply(ro, 1)
    assert r["success"]
    mine = r["result"]["note"]["id"]
    await ro.send_json({"id": 2, "type": f"{DOMAIN}/note_delete", "entry_id": entry.entry_id, "target": pid, "note_id": note["id"]})
    r = await _reply(ro, 2)
    assert not r["success"] and r["error"]["code"] == "unauthorized"
    await ro.send_json({"id": 3, "type": f"{DOMAIN}/note_delete", "entry_id": entry.entry_id, "target": pid, "note_id": mine})
    assert (await _reply(ro, 3))["success"]

    # deleting the point removes its notes and photos
    path = hass.config.path("hamlet_farm", entry.entry_id, "photos", f"{photo}.jpg")
    assert os.path.exists(path)
    await ws.send_json({"id": 40, "type": f"{DOMAIN}/delete_point", "entry_id": entry.entry_id, "point_id": pid})
    assert (await _reply(ws, 40))["success"]
    await hass.async_block_till_done()
    assert not os.path.exists(path) and not os.path.exists(fpath)
    assert hass.data[DOMAIN][entry.entry_id].notes == {}


async def test_quotes(hass: HomeAssistant, hass_ws_client, hass_client, hass_read_only_access_token, hass_read_only_user, hass_admin_user):
    entry = await _setup(hass)
    ws = await hass_ws_client(hass)
    notify = async_mock_service(hass, "notify", "mobile_app_wynand")
    await ws.send_json({"id": 1, "type": f"{DOMAIN}/save_settings", "entry_id": entry.entry_id, "settings": {"notify_service": "notify.mobile_app_wynand"}})
    assert (await _reply(ws, 1))["success"]
    await ws.send_json({"id": 2, "type": f"{DOMAIN}/doc_users", "entry_id": entry.entry_id})
    users = (await _reply(ws, 2))["result"]
    assert any(u["id"] == hass_read_only_user.id for u in users)

    async def make(mid, title, users_):
        await ws.send_json({"id": mid, "type": f"{DOMAIN}/doc_create", "entry_id": entry.entry_id,
                            "doc": {"title": title, "kind": "quote", "amount": "R 18 500", "users": users_, "filename": "q.pdf"}})
        doc = (await _reply(ws, mid))["result"]
        client = await hass_client()
        resp = await client.post(f"/api/hamlet_farm/doc/{entry.entry_id}/{doc['id']}", data=b"%PDF-1.4 test")
        assert resp.status == 200, await resp.text()
        return doc

    shared = await make(3, "New borehole pump", [hass_read_only_user.id])
    private = await make(4, "Internal costing", [])
    client = await hass_client()
    resp = await client.post(f"/api/hamlet_farm/doc/{entry.entry_id}/{shared['id']}", data=b"MZ not allowed")
    assert resp.status == 400

    # the client user only sees what was shared with them, without the share list
    ro = await hass_ws_client(hass, hass_read_only_access_token)
    await ro.send_json({"id": 1, "type": f"{DOMAIN}/docs", "entry_id": entry.entry_id})
    docs = (await _reply(ro, 1))["result"]["docs"]
    assert [d["title"] for d in docs] == ["New borehole pump"] and "users" not in docs[0]
    roc = await hass_client(hass_read_only_access_token)
    resp = await roc.get(f"/api/hamlet_farm/doc/{entry.entry_id}/{shared['id']}")
    assert resp.status == 200 and resp.content_type == "application/pdf"
    resp = await roc.get(f"/api/hamlet_farm/doc/{entry.entry_id}/{private['id']}")
    assert resp.status == 404
    resp = await roc.post(f"/api/hamlet_farm/doc/{entry.entry_id}/{shared['id']}", data=b"%PDF-")
    assert resp.status == 403

    # accept -> installer is told
    await ro.send_json({"id": 2, "type": f"{DOMAIN}/doc_respond", "entry_id": entry.entry_id, "doc_id": shared["id"],
                        "answer": "accepted", "note": "Go ahead on Monday"})
    r = await _reply(ro, 2)
    assert r["success"] and r["result"]["docs"][0]["status"] == "accepted"
    await hass.async_block_till_done()
    assert notify and "accepted" in notify[-1].data["message"] and "Monday" in notify[-1].data["message"]
    await ro.send_json({"id": 3, "type": f"{DOMAIN}/doc_respond", "entry_id": entry.entry_id, "doc_id": private["id"], "answer": "accepted"})
    assert not (await _reply(ro, 3))["success"]

    await ws.send_json({"id": 5, "type": f"{DOMAIN}/doc_delete", "entry_id": entry.entry_id, "doc_id": shared["id"]})
    assert (await _reply(ws, 5))["success"]
    import os
    assert not os.path.exists(hass.config.path("hamlet_farm", entry.entry_id, "docs", shared["id"]))



async def test_planning_lines_hidden_from_clients(hass: HomeAssistant, hass_ws_client, hass_read_only_access_token):
    entry = await _setup(hass)
    ws = await hass_ws_client(hass)
    for i, hidden in enumerate((False, True, True)):
        await ws.send_json({"id": 10 + i, "type": f"{DOMAIN}/save_shape", "entry_id": entry.entry_id,
                            "shape": {"kind": "sketch", "hidden": hidden, "coords": [[-25.7, 28.2], [-25.71, 28.21]]}})
        assert (await _reply(ws, 10 + i))["success"]
    await ws.send_json({"id": 20, "type": f"{DOMAIN}/state", "entry_id": entry.entry_id})
    shapes = (await _reply(ws, 20))["result"]["shapes"]
    assert len(shapes) == 3
    ro = await hass_ws_client(hass, hass_read_only_access_token)
    await ro.send_json({"id": 1, "type": f"{DOMAIN}/state", "entry_id": entry.entry_id})
    assert len((await _reply(ro, 1))["result"]["shapes"]) == 1
    await ro.send_json({"id": 2, "type": f"{DOMAIN}/subscribe", "entry_id": entry.entry_id})
    assert (await _reply(ro, 2))["success"]
    ev = await ro.receive_json()
    assert len(ev["event"]["shapes"]) == 1
    await ws.send_json({"id": 21, "type": f"{DOMAIN}/delete_shapes", "entry_id": entry.entry_id, "shape_ids": [s["id"] for s in shapes if s.get("hidden")]})
    r = await _reply(ws, 21)
    assert r["success"] and r["result"]["result"] == 2 and len(r["result"]["shapes"]) == 1



async def test_service_reports(hass: HomeAssistant, hass_ws_client, hass_read_only_access_token, hass_read_only_user):
    entry = await _setup(hass)
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": f"{DOMAIN}/save_point", "entry_id": entry.entry_id, "point": {
        "name": "Borehole 1", "type": "pump", "lat": -25.7, "lng": 28.2,
        "specs": {"installed": "2021-03-12", "depth": "120", "pump_depth": 84, "motor_kw": 7.5, "starter": "Soft starter", "bogus": 1}}})
    p = (await _reply(ws, 1))["result"]["result"]
    assert p["specs"] == {"depth": 120, "pump_depth": 84, "motor_kw": 7.5, "installed": "2021-03-12", "starter": "Soft starter"}
    rep = {"point": p["id"], "date": "2026-11-08", "next_due": "2027-05-08", "title": "Pump pulled, new non-return valve",
           "work": "Pulled pump, replaced NRV", "items": [{"desc": "NRV 50 mm", "qty": 1, "price": 850}, {"desc": "Labour", "qty": 4, "price": 450}],
           "users": [hass_read_only_user.id]}
    await ws.send_json({"id": 2, "type": f"{DOMAIN}/service_save", "entry_id": entry.entry_id, "report": rep})
    r = await _reply(ws, 2)
    assert r["success"], r
    rid = r["result"]["report"]["id"]
    await ws.send_json({"id": 3, "type": f"{DOMAIN}/service_save", "entry_id": entry.entry_id, "report": {**rep, "users": [], "date": "2026-01-02", "title": "Internal check"}})
    assert (await _reply(ws, 3))["success"]
    await ws.send_json({"id": 4, "type": f"{DOMAIN}/service_save", "entry_id": entry.entry_id, "report": {**rep, "date": "yesterday"}})
    assert not (await _reply(ws, 4))["success"]
    await ws.send_json({"id": 5, "type": f"{DOMAIN}/state", "entry_id": entry.entry_id})
    st = (await _reply(ws, 5))["result"]
    assert st["service"][p["id"]] == {"last": "2026-11-08", "title": "Pump pulled, new non-return valve", "next": "2027-05-08"}

    ro = await hass_ws_client(hass, hass_read_only_access_token)
    await ro.send_json({"id": 1, "type": f"{DOMAIN}/services", "entry_id": entry.entry_id, "point": p["id"]})
    lst = (await _reply(ro, 1))["result"]["services"]
    assert [x["title"] for x in lst] == ["Pump pulled, new non-return valve"] and "users" not in lst[0]
    await ro.send_json({"id": 2, "type": f"{DOMAIN}/service_save", "entry_id": entry.entry_id, "report": rep})
    assert (await _reply(ro, 2))["error"]["code"] == "unauthorized"
    await ws.send_json({"id": 6, "type": f"{DOMAIN}/service_delete", "entry_id": entry.entry_id, "report_id": rid})
    assert (await _reply(ws, 6))["success"]
