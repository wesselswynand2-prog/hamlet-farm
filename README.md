# Hamlet Farm

A satellite map of the client's farm in Home Assistant – like Google Maps, but every pump, centre pivot, Eskom point, tank, gate and camera on it is live and controllable.

| On the map | What it shows / does |
|---|---|
| **Borehole / pressure pump** | Running (green, pulsing), off, fault, offline. Power, level, pressure, flow. On / Off buttons – or link a **Hamlet Pump** and get its status, protection and Auto / Run / On / Off modes. |
| **Irrigation** | Link an irrigation **Hamlet Pump** and put each valve zone on a piece of land – the land turns blue while that zone waters. Zones, program and next start on the point's page. |
| **Centre pivot** | The pivot circle drawn to size on the land, the arm at its live position (°), running or stopped, hectares. |
| **Eskom point** | The client's Eskom supply: account number, meter number, pole / transformer number, transformer size, NMD, supply voltage and tariff. Live: power on / **No power**, kW now, a kWh meter (used today, this month, meter reading) and load ≈ % of the NMD – **Above NMD** when over. **Report to Eskom** calls 08600 37566 with the account and pole number on screen. |
| **Transformer** | Size (kVA) and voltages (e.g. 22 kV → 1000 V), full-load current, power on / no power, and load ≈ % of its kVA from a power meter – **Overloaded** above 100 %. |
| **Tank / dam** | Level %, **Low** alert below a set level. |
| **Valve, gate, generator, solar, building, camera, weather station** | Open / closed, on / off, camera picture, any extra sensors. |
| **Lines and land** | Water pipes, cables – **400 V** (lime), **1 000 V** (orange), **3 300 V** (purple) and **MV** (red) – overhead power lines, fences, roads and camps / lands. Each shows its length (or hectares) and an optional detail like *95 mm² 4-core Cu SWA*. |

📖 **[Manual](MANUAL.md)** – also built in: tap **Help** at the top of the Farm map page.

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
5. **Line / land** → pick what you are drawing in the bar (water pipe, cable 400 V / 1 000 V / 3 300 V / MV, overhead line, fence, road, land) → tap along it → **Finish** → name it.
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

## Point page and site log

Tap a pump, pivot, Eskom point – or a line, drawing or piece of land – to open its own page:

- **Now:** live status, On / Off (or Auto / Run / On / Off for a linked Hamlet Pump) and the readings. A linked Hamlet Pump shows its full pump card too.
- **About:** the notes from setup, the linked entities (tap one for Home Assistant's history graph) and GPS. **Directions** opens Google Maps navigation.
- **Service:** service reports with work done, readings, parts, labour and pricing (VAT 15 %), next service due, print / save as PDF – prices only for the people you share them with. Installation details (installed on, borehole depth, pump depth, motor kW, pump / motor model, starter, cable, pipe) on the page and on every report.
- **History:** graphs for 24 hours / 7 days / 30 days – running time and starts, power, kWh per hour / day, level, pressure, pivot position, supply voltage, extra sensors – with min / avg / max and a touch read-out.
- **Site log:** anyone logged in can add a note – what was found, what was done, parts used – with a photo from the phone camera. Notes show who wrote them and when; the writer or an admin can delete one. Photos are shrunk on the phone before uploading and kept in `/config/hamlet_farm/` (in backups). Points with notes show a 📝 count in the list.

**Map** goes back to the map at that point.

### Dashboard cards on a point's page (e.g. the panel meter)

Any Home Assistant dashboard card can be shown on a point's page – the [Panel Meter Card](https://github.com/wesselswynand2-prog/panel-meter-card), the VFD card, a history graph… Edit the point → **Cards on the point's page** → paste the card's YAML, or tap **Add panel meter** for a ready template (it fills in the point's kWh meter) and change the sensor names to the meter's own. Several cards: put `---` between them.

```yaml
type: custom:panel-meter-card
model: DMED 330
energy: sensor.meter_energy_import
pages:
  - unit: V
    max: 460
    cells:
      - { entity: sensor.meter_voltage_l1, top: L1 }
      - { entity: sensor.meter_voltage_l2, top: L2 }
      - { entity: sensor.meter_voltage_l3, top: L3 }
```

Custom cards must be installed on that Home Assistant (e.g. through HACS) – the page loads them by itself.

## Quotes and documents

Share quotes, invoices, COCs and plans with the client – only with the people you pick.

1. Farm map → **Quotes & documents** → **Upload** (admin). Or **Upload** on a point's page to link it to that pump or pivot.
2. Pick the file (PDF, JPG or PNG, up to 15 MB), give it a title, type and amount, and tick **who may see it** – the client's Home Assistant users (Settings → People).
3. Those people see it in the list (and on the point's page) and can **Open** it, save it, and for a quote **Accept** or **Decline** with a comment. You get a notification (and on your phone, if *Send alerts to* is set) straight away.

Who can see what: only the users you ticked, plus **every admin** of that Home Assistant – admins can always see everything, so give the client's people normal (non-admin) accounts. Files are kept in `/config/hamlet_farm/` on the client's Home Assistant and are part of its backups; they are only sent to someone who is logged in and allowed to see them.

## Measure and draw

- **Measure** (ruler button on the map, for everyone): tap the map – or a point to snap to it – to measure a pipe or cable run; every corner shows the distance so far. **Area** closes the shape and shows hectares. Admins can **Save as line** to keep it as a pipe, power line or land.
- **Draw** (admin, Edit → **Draw**): drag a finger or the mouse to draw on the map in red, yellow, white, green, blue, orange or black – mark a leak, a new trench or where to dig. **Length** (on by default) writes each line's length next to it while you draw and on the map afterwards; the bar shows the last line's length. **Undo** takes back the last stroke; tap a drawing in edit mode to rename, recolour, turn the length on / off or delete it.
- Saved lines show their length when you hover or tap them (or always, with *Show the length on the map* in the line's settings), and land shows its hectares. While drawing a line with **Line / land**, the bar shows the length so far.

## Layers, planning lines and deleting drawings

- **Layers** button (top right of the map): tick what to show – names, drawings, water pipes, cables, overhead lines, fences, roads, land, the offline photo. Remembered per phone / PC.
- **Temperature probes**: a *Temperature probe* point (or the Temperature field on any point) shows °C and humidity on the map, with optional frost / high temperature alerts.
- **Sticky notes** (admin): Edit → *Sticky note* → tap the map and write. Notes are planning-only by default (clients never see them); switch that off to show a note to everyone. Drag to move in Edit.
- **Planning lines** (admin): lines and drawings for planning or a demonstration can be marked *Planning / demo only* – in the line's settings, or with **Planning** in the Draw bar. They are hidden from the map; an admin shows them by ticking *Planning lines* under Layers. Clients never see them (not on the map page and not on the dashboard card).
- **Delete a line or drawing:** Edit → tap the line (thin drawings are easy to hit now) → **Delete** (tap twice). **Delete all drawings** under Layers clears every freehand drawing at once.

## Alerts

A point with *Alert when this point has a problem* on (default) alerts when it is **faulted, has no power, is offline or low** for longer than *Alert after* (default 2 min, so a blip doesn't alert), and again when it's back to normal. Alerts show on the map page, as Home Assistant notifications and, if set, on a phone via *Send alerts to* (e.g. `notify.mobile_app_wynand`).

## Map pictures

Satellite and Hybrid use Esri World Imagery and Map uses the Esri World Street Map (free, no key). Those pictures come from the internet. For farms with poor or no internet, save an **offline farm photo** on Home Assistant (below).

## Offline farm photo (no internet needed)

Keeps an aerial photo of the farm on the client's Home Assistant, so the map always has a picture behind the pumps and pivots – over the farm's own Wi-Fi, without internet.

1. Get an aerial photo of the farm:
   - **CD:NGI aerial photos** (government, 25–50 cm detail, free): from the CD:NGI geospatial portal or the NGI office. Download the GeoTIFF sheet(s) that cover the farm – the 1:10 000 sheet number is like `2528CA12`. Lat/long (WGS84, EPSG:4326), Lo (Hartebeesthoek94 or Cape) and UTM files all work.
   - Or any **JPG / PNG** photo of the farm (drone photo, survey photo) – you line it up by hand.
2. Farm map page → **Offline farm photo** (bottom of the list, admin only) → **Add a photo** and pick the file. Best done on a PC – NGI files are big.
3. **GeoTIFF:** it places itself. Zoom the map so the white frame is around the farm (*The map view now*), or keep *The whole photo*.
   **JPG / PNG:** drag the round corners until it lines up with the satellite map, then save.
4. **Save to Home Assistant.** The browser cuts the photo into map tiles and uploads them – keep the page open until it says *saved*. A 3 × 3 km farm at 25 cm is roughly 3 000 tiles / 60 MB.

Farms across two NGI sheets: add both. Photos can be turned off (eye), shown or deleted from the same list. They're stored in `/config/hamlet_farm/` and included in Home Assistant backups.

Only the photo is offline – Google Maps *Directions* still need mobile data.

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
