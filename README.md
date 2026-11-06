# Hamlet Farm

A satellite map of the client's farm in Home Assistant – like Google Maps, but every pump, centre pivot, Eskom point, tank, gate and camera on it is live and controllable.

| On the map | What it shows / does |
|---|---|
| **Borehole / pressure pump** | Running (green, pulsing), off, fault, offline. Power, level, pressure, flow. On / Off buttons – or link a **Hamlet Pump** and get its status, protection and Auto / Run / On / Off modes. |
| **Centre pivot** | The pivot circle drawn to size on the land, the arm at its live position (°), running or stopped, hectares. |
| **Eskom point** | Power on / **No power** (voltage or a "supply present" input), kW now, kWh today. |
| **Tank / dam** | Level %, **Low** alert below a set level. |
| **Valve, gate, generator, solar, building, camera, weather station** | Open / closed, on / off, camera picture, any extra sensors. |
| **Lines and land** | Water pipes, power lines, fences, roads and camps / lands (with length or hectares). |

Installs as a **Farm map** page in the Home Assistant sidebar (tabs when there are several farms), a dashboard card and summary sensors. Same install and update as the other Hamlet apps.

## Install on a client's Home Assistant

**Option A – HACS**
1. HACS → ⋮ → Custom repositories → add `https://github.com/wesselswynand2-prog/hamlet-farm`, type *Integration*.
2. Search **Hamlet Farm** → Download, restart Home Assistant.

**Option B – upload the zip + one terminal command** (same as Hamlet Geyser / Pump)
1. Upload `hamlet-farm.zip` into the Home Assistant config folder.
2. In the **Terminal & SSH** add-on:
   - First time: `cd /config 2>/dev/null || cd /homeassistant; mkdir -p /tmp/hf && unzip -oq "$(ls -t hamlet-farm*.zip | head -1)" -d /tmp/hf && sh /tmp/hf/hamlet-farm/hamlet-update.sh`
   - Updates: `sh /config/hamlet-update.sh` (the same script updates every Hamlet app)

**Option C – manual copy:** copy `custom_components/hamlet_farm` into `/config/custom_components/` and restart.

Then: **Settings → Devices & services → Add integration → Hamlet Farm** and give the farm a name.

## Put the farm on the map (admin)

1. Open **Farm map** → **Edit**.
2. Find the farm: type a place name or GPS (`-25.86, 28.10`) in the search box, or zoom in on the satellite picture.
3. **Point** → tap where the pump / pivot / Eskom point is (or **Where I stand** to use the phone's GPS on site – needs https, e.g. Nabu Casa).
4. Pick the type, name it and map the entities (start typing – it suggests matching entities and shows their value now).
5. **Line / land** → tap along a pipe, power line or fence (or round a camp) → **Finish** → pick the kind and name.
6. Drag points to move them. **Start view** saves where the map opens.

Clients (non-admin users) see the map, the status and the On / Off buttons. Editing and alert settings are admin-only.

## Mapping cheat-sheet

Everything is optional – map what the point has.

| Field | Typical entity |
|---|---|
| Switch / relay | Shelly / Sonoff / contactor relay, `valve.*`, `cover.*` (gate motor). Gives On / Off (Open / Close) buttons – tap twice to confirm, so a stray tap in the bakkie doesn't stop a pivot. |
| Running signal | VFD "running", pivot running contact, generator running. If not mapped: power above 20 W, or the relay. |
| Power | Shelly power, energy meter or VFD output power (W or kW) |
| Energy meter | kWh total – *today* is counted from midnight |
| Supply present | Voltage sensor (below 150 V = **No power**) or an on/off "power present" input |
| Fault / alarm | Binary sensor, or a VFD fault code (0 = OK) |
| Level | Tank / dam level % (0–1 is read as a fraction) |
| Pivot position | Angle in degrees, 0° = north, clockwise – draws the arm |
| Hamlet Pump | Pick a pump from the Pumps page – status, protection and modes come from there; *Pump page* opens it |
| Also show | Any other entities: cameras show a picture, switches get a button |

**Colours:** green = running · blue = on / open · amber = Eskom power on · grey = off · orange = attention (low level, gate open) · red = fault / no power · dashed grey = offline (no signal – often the Shelly lost power or Wi-Fi).

## Alerts

A point with *Alert when this point has a problem* on (default) alerts when it is **faulted, has no power, is offline or low** for longer than *Alert after* (default 2 min, so a blip doesn't alert), and again when it's back to normal. Alerts show on the map page, as Home Assistant notifications and, if set, on a phone via *Send alerts to* (e.g. `notify.mobile_app_wynand`).

## Map pictures

Satellite and Hybrid use Esri World Imagery (free, no key); Map uses OpenStreetMap. The map library is part of the app, but the pictures come from the internet – on a farm without internet the points and status still work over the local network, only the background stays blank. Pictures already looked at are kept by the browser.

**Directions** on any point opens Google Maps navigation to it – handy for a technician who hasn't been to the farm.

## Dashboard card

Loaded automatically. Edit dashboard → **Add card** → **Hamlet Farm map**, or:

```yaml
type: custom:hamlet-farm-card
farm: Doornkloof   # optional – default is the first farm
height: 400        # px
style: satellite   # optional: satellite / hybrid / map
labels: true       # names under the points
```

Tap a point for its status; *Open on the map page* goes to it on the Farm map page.

## Entities (per farm)

`sensor.<farm>_running` (points running – names in attributes), `sensor.<farm>_alerts` (count – list in attributes), `sensor.<farm>_eskom_power` (W, all Eskom points), `sensor.<farm>_eskom_energy_today` (kWh).

## Tests

```
pip install -r requirements_test.txt
pytest
```
