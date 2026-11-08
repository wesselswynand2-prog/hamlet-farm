<!-- Generated from custom_components/hamlet_farm/frontend/manual.md by tools/make_manual.py – edit that file. -->
# Hamlet Farm – manual

## Getting started

**Farm map** in the Home Assistant sidebar shows the farm on a satellite picture, with every pump, centre pivot, Eskom point, transformer, tank, gate and camera that Home Assistant controls. Everything on it is live – colours and readings change as things happen.

- **On the left:** the map. Tap a point (or a line) to open its page.
- **On the right:** a summary (running, alerts, Eskom power), the list of points, quotes & documents and recent alerts. On a phone this list is below the map.
- **Several farms:** tabs at the top switch between them.

Nothing on the map can be changed by accident – On / Off buttons need **two taps**, and only admins can edit the map.

## Colours and what they mean

| Colour | Means |
|---|---|
| 🟢 Green, pulsing | Running |
| 🔵 Blue | On / open, not running |
| 🟡 Amber | Eskom / transformer / solar power on |
| ⚫ Dark grey | Off |
| 🟠 Orange with **!** | Needs attention – tank low, gate open, transformer or NMD over 100 % |
| 🔴 Red with **!** | Fault, **No power**, locked out |
| ◌ Grey, dashed | Offline – no signal. Often the Shelly / meter lost power or Wi-Fi |
| ⚪ White | Just a marker, nothing linked |

**Lines:** ▬ water pipe · ▬ cable 1 000 V · ▬ cable 3 300 V · ▬ MV cable · ▬ overhead power line · ▬ fence · ▬ road · ▬ land / camp.

## Moving around the map

- **Zoom:** pinch, the mouse wheel or **+ / −**. **Move:** drag.
- **Satellite / Hybrid / Map** (top right) changes the background. Hybrid adds road and place names.
- **Search** (top left – or press **/** on a keyboard): results show while you type, grouped as points (by name, type, status, **Eskom account / meter / pole number**, kVA, tariff, or a **linked sensor**), lines & land (name, cable details), quotes & documents, **site log notes** (words in a note or who wrote it), other sensors & switches (opens their history), and **Find the place** / GPS like `-25.86, 28.10`. Use ↑ ↓ and Enter, or tap a result: points and lines open their page, notes open the page at the site log.
- **Show the whole farm.**
- **Layers:** choose what is shown – names, drawings, pipes, cables, overhead lines, fences, roads, land, the offline photo. Each phone / PC remembers its own choice.
- **My location:** shows where you stand (needs Home Assistant over https, e.g. Nabu Casa, and location permission).
- **Measure:** see *Measuring distance and area*.

## A point's page

Tap a pump, pivot, Eskom point or any line to open its page. **Map** (top left) goes back.

- **Now:** the status, the readings (power, kWh today / this month, level, pressure, pivot position, load %) and the controls.
- **Controls:** **On / Off** (or **Open / Close** for gates and valves). Tap once – the button asks *Tap again* – tap again to send. A linked Hamlet Pump shows **Auto / Run 30m / On / Off** and its pump card.
- **Dashboard cards:** some points show extra cards here, like the panel meter.
- **About:** notes, sizes (transformers, Eskom account), the linked sensors – **tap a sensor to see its history graph** – and the GPS position.
- **History** tab (next to *Overview*): graphs of the point's readings for the last **24 hours, 7 days or 30 days** – running / on time (with hours run and how many starts), power, kWh used per hour or per day, level, pressure, flow, pivot position, supply voltage and any extra sensors. Each graph shows min / average / max; touch or hover a graph to read the value at that time. A drop to 0 on supply voltage shows exactly when the power was off.
- **Directions:** opens Google Maps navigation to the point (needs mobile data).
- **Report to Eskom** (Eskom points): calls 08600 37566 – the account, meter and pole number are on the same page.

## Site log – notes and photos

Every point and line has a **site log** on its page. Anyone logged in can add to it.

1. Open the point's page.
2. Type what you found or did, parts used, settings.
3. **Photo** to add a picture from the phone camera (it is made smaller before uploading, so it works on slow Wi-Fi).
4. **Add note.**

Notes show who wrote them and when, newest first. Tap a photo to see it big. You (or an admin) can delete your own note – tap the bin twice. Points with notes show 📝 and a count in the list.

## Measuring distance and area

1. Tap on the map.
2. Tap along the route – or tap a point to start or end exactly on it. Every corner shows the distance so far; the bar shows the total.
3. **Area** closes the shape and shows hectares. **Undo** removes the last tap, **Clear** starts over.
4. **Done** when finished. Measurements are not saved – admins can tap **Save as line** to keep it as a pipe, cable or land.

## Quotes and documents

Quotes, invoices, COCs and plans shared with you are in **Quotes & documents** in the list (and on the point's page they belong to).

1. Tap one to see the details, then **Open** to view it. **Save** downloads it.
2. For a quote: add a comment if you like and tap **Accept quote** or **Decline** – twice to confirm. The installer is told straight away.

You only see documents that were shared with you.

## Alerts

A point alerts when it has a **fault**, **no power**, is **offline**, a tank is **low**, or a transformer / Eskom NMD is **over 100 %** – after it has lasted a while (2 minutes unless changed), so a short blip doesn't alert. You get a message again when it is back to normal.

Alerts show in **Alerts** on the map page, as Home Assistant notifications (the bell) and – if set up – on a phone.

## Dashboard card

The farm map can also sit on any dashboard: Edit dashboard → **Add card** → **Hamlet Farm map**. Tap a point for its status; **Open on the map page** goes to it.

```yaml
type: custom:hamlet-farm-card
farm: Doornkloof   # optional
height: 400
```

## Setting up a farm (admin)

1. **Settings → Devices & services → Add integration → Hamlet Farm**, give the farm a name.
2. Open **Farm map** → **Edit** (top right – admins only).
3. Find the farm (search a place or GPS, or zoom in) and tap **Start view** so the map always opens there.
4. **Point** → tap where the pump / pivot / Eskom point is, or **Where I stand** on site to use the phone's GPS.
5. Pick the **type**, give it a **name** and link the sensors (below). **Save.**
6. Drag points to move them. Tap a point in Edit to change or delete it.

**Linking sensors** – start typing in a field and pick from the list; the value now is shown next to it. Everything is optional:

| Field | Typical entity |
|---|---|
| Switch / relay | Shelly, Sonoff, contactor relay, `valve.*`, `cover.*` gate – gives the On / Off buttons |
| Running signal | VFD running, pivot running contact – otherwise worked out from power above 20 W |
| Power | Shelly / meter / VFD power, W or kW |
| kWh meter (total) | The meter's total kWh – *used today* and *this month* are counted from it |
| Supply present | A voltage (below 150 V = **No power**) or a "power on" input |
| Fault / alarm | On, or a fault code other than 0 |
| Level | Tank / dam level % |
| Pressure, Flow | Any sensor |
| Pivot position | Angle in degrees, 0° = north – draws the pivot arm |
| Also show | Any other entities – cameras show a picture, switches get a button |

**Pivot:** set the **radius** (centre to the last tower) so the circle is drawn to size. **Tank:** set **Low level alert below**.

## Lines, cables and land (admin)

1. **Edit → Line / land.**
2. Pick what you are drawing in the bar: water pipe, cable 1 000 V / 3 300 V / MV, overhead power line, fence, road, land / camp. The bar shows the length (or hectares) so far.
3. Tap along the route. **Undo** removes the last point.
4. **Finish** → give it a name and **Details** (e.g. *95 mm² 4-core Cu SWA*). **Save.**

Tap a line in Edit to rename it, change its type, switch **Show the length on the map** on, or **Delete** it (tap twice).

## Drawing, planning lines and deleting (admin)

- **Edit → Draw:** drag a finger or the mouse on the map. Pick a colour in the bar. **Length** writes each line's length next to it. **Undo** takes back the last stroke.
- **Planning** in the Draw bar (or *Planning / demo only* in a line's settings) hides the drawing from the map. Admins show planning lines with **Layers → Planning lines**; clients never see them.
- **Delete one drawing or line:** Edit → tap it → **Delete** (twice).
- **Delete all drawings:** **Layers → Delete all drawings** (twice). Pipes, cables and other lines stay.

## Transformers and Eskom points (admin)

**Transformer:** enter the **size (kVA)** and **primary / secondary voltage**. The page shows the full-load current. Link a power meter to see the **load %** (kW against kVA – an estimate) and get **Overloaded** above 100 %.

**Eskom point:** enter the **Eskom account number**, **meter number**, **pole / transformer number**, **transformer size**, **NMD**, **supply voltage** and **tariff**. Link the **kWh meter (total)** for kWh used today, this month and the meter reading, and a power sensor for the **load % of the NMD** – **Above NMD** when over. Anyone who can open the farm map sees these details.

## Pumps and dashboard cards on a page (admin)

- **Hamlet Pump:** for a borehole or pressure pump, pick the pump under **Hamlet Pump** in the point's settings. Its status, protection and modes come from the Pumps page; its pump card shows on the point's page.
- **Any dashboard card** (e.g. the panel meter card): in the point's settings, **Cards on the point's page** → paste the card's YAML, or tap **Add panel meter** for a template and change the sensor names to the meter's own. Put `---` between several cards. Custom cards must be installed through HACS on that Home Assistant.

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

## Offline farm photo (admin)

Keeps an aerial photo of the farm on Home Assistant, so the map has a picture without internet.

1. Get a **CD:NGI aerial photo** (GeoTIFF, free from the CD:NGI geospatial portal) of the 1:10 000 sheet the farm is on – or any JPG / PNG of the farm, e.g. a drone photo.
2. Bottom of the list → **Offline farm photo → Add a photo** (best on a PC – NGI files are big).
3. **GeoTIFF:** it places itself – zoom so the white frame is around the farm, or keep the whole photo. **JPG / PNG:** drag the round corners until it lines up with the satellite map.
4. **Save to Home Assistant** and keep the page open until it says *saved*.

Turn a photo off with the eye, or delete it, in the same list.

## Sharing quotes and documents (admin)

1. **Quotes & documents → Upload** (or **Upload** on a point's page to link it there).
2. Pick the PDF / JPG / PNG (max 15 MB), title, type, amount and a note.
3. Tick **who may see it** – the client's Home Assistant users (Settings → People).
4. They can open it, and accept or decline a quote. You get a notification – on your phone too if *Send alerts to* is set. **Ask again** resets the answer.

**Admins always see every document**, so give the client's people normal (non-admin) accounts.

## Alert settings (admin)

At the bottom of the list (admins only):

- **Send alerts to:** a phone, e.g. `notify.mobile_app_wynand` – blank = Home Assistant notifications only.
- **Alert after:** how long a problem must last before it alerts (default 120 s).
- **Map style for everyone:** Satellite, Hybrid or Map.

Each point has **Alert when this point has a problem** in its settings – switch it off for points that should never alert.

## Problems and questions

**A point shows *Offline – no signal*.** Home Assistant can't reach the sensor. Check the Shelly / meter has power and Wi-Fi. On an Eskom point it often means the power is off.

**The map background is blank.** The map pictures come from the internet. Without internet the points still work over the farm's Wi-Fi – an admin can save an *Offline farm photo*.

**I can't see the Edit button.** Only Home Assistant admins can edit the map.

***My location* or *Where I stand* doesn't work.** It needs Home Assistant opened over https (e.g. Nabu Casa) and location permission for the browser / app.

**A card on a point's page says it can't be shown.** The custom card isn't installed on this Home Assistant – install it through HACS and refresh.

**The On / Off button does nothing.** Tap it twice – the first tap asks *Tap again*. If it still doesn't switch, check the linked switch works in Home Assistant.

**Updates:** HACS → Updates → Hamlet Farm, then refresh the browser (Ctrl+F5, or pull down in the app).
