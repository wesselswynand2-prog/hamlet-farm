# Hamlet Farm – manual

## Getting started {icon:mdi:map-marker-radius}

**Farm map** in the Home Assistant sidebar shows the farm on a satellite picture, with every pump, centre pivot, Eskom point, transformer, tank, gate and camera that Home Assistant controls. Everything on it is live – colours and readings change as things happen.

- **On the left:** the map. Tap a point (or a line) to open its page.
- **On the right:** a summary (running, alerts, Eskom power), the list of points, quotes & documents and recent alerts. On a phone this list is below the map.
- **Several farms:** tabs at the top switch between them.

Nothing on the map can be changed by accident – On / Off buttons need **two taps**, and only admins can edit the map.

## Colours and what they mean {icon:mdi:palette-outline}

| Colour | Means |
|---|---|
| {dot:run} Green, pulsing | Running |
| {dot:on} Blue | On / open, not running |
| {dot:power} Amber | Eskom / transformer / solar power on |
| {dot:off} Dark grey | Off |
| {dot:warn} Orange with **!** | Needs attention – tank low, gate open, transformer or NMD over 100 % |
| {dot:bad} Red with **!** | Fault, **No power**, locked out |
| {dot:offline} Grey, dashed | Offline – no signal. Often the Shelly / meter lost power or Wi-Fi |
| {dot:info} White | Just a marker, nothing linked |

**Lines:** {line:#5aaeff} water pipe · {line:#ff6a00} cable 1 000 V · {line:#c86bff} cable 3 300 V · {line:#ff2d55} MV cable · {line:#ffcc33} overhead power line · {line:#f2f2f2} fence · {line:#e0cfa6} road · {line:#8fd16a} land / camp.

## Moving around the map {icon:mdi:gesture-swipe}

- **Zoom:** pinch, the mouse wheel or **+ / −**. **Move:** drag.
- **Satellite / Hybrid / Map** (top right) changes the background. Hybrid adds road and place names.
- **Search** (top left – or press **/** on a keyboard): results show while you type, grouped as points (by name, type, status, **Eskom account / meter / pole number**, kVA, tariff, or a **linked sensor**), lines & land (name, cable details), quotes & documents, **site log notes** (words in a note or who wrote it), other sensors & switches (opens their history), and **Find the place** / GPS like `-25.86, 28.10`. Use ↑ ↓ and Enter, or tap a result: points and lines open their page, notes open the page at the site log.
- {icon:mdi:fit-to-screen-outline} **Show the whole farm.**
- {icon:mdi:layers-outline} **Layers:** choose what is shown – names, drawings, pipes, cables, overhead lines, fences, roads, land, the offline photo. Each phone / PC remembers its own choice.
- {icon:mdi:crosshairs-gps} **My location:** shows where you stand (needs Home Assistant over https, e.g. Nabu Casa, and location permission).
- {icon:mdi:ruler} **Measure:** see *Measuring distance and area*.

## A point's page {icon:mdi:card-text-outline}

Tap a pump, pivot, Eskom point or any line to open its page. **Map** (top left) goes back.

- **Now:** the status, the readings (power, kWh today / this month, level, pressure, pivot position, load %) and the controls.
- **Controls:** **On / Off** (or **Open / Close** for gates and valves). Tap once – the button asks *Tap again* – tap again to send. A linked Hamlet Pump shows **Auto / Run 30m / On / Off** and its pump card.
- **Dashboard cards:** some points show extra cards here, like the panel meter.
- **About:** notes, sizes (transformers, Eskom account), the linked sensors – **tap a sensor to see its history graph** – and the GPS position.
- **History** tab (next to *Overview*): graphs of the point's readings for the last **24 hours, 7 days or 30 days** – running / on time (with hours run and how many starts), power, kWh used per hour or per day, level, pressure, flow, pivot position, supply voltage and any extra sensors. Each graph shows min / average / max; touch or hover a graph to read the value at that time. A drop to 0 on supply voltage shows exactly when the power was off.
- **Directions:** opens Google Maps navigation to the point (needs mobile data).
- **Report to Eskom** (Eskom points): calls 08600 37566 – the account, meter and pole number are on the same page.

## Service reports {icon:mdi:wrench-outline}

Pumps, pivots and other equipment have a **Service** tab on their page.

- **Everyone** sees the last service date and when the next service is due (orange within 30 days, red when overdue) – on the *Overview* under *About*, with the installation details (installed on, borehole depth, pump depth, water level, yield, motor size, pump and motor model, starter, cable, pipe).
- **Service reports** with the work done, readings, parts, labour and **prices** are only shown to the people the installer shared them with (and admins). Tap a report to see it, and **Print / save as PDF** for a printable copy with a signature line.

## Notes, photos and files {icon:mdi:note-text-outline}

Every point and line has a **site log** (*Notes, photos & files*) on its page. Anyone logged in can add to it. In Edit, **Notes, photos & files** in a point's or line's settings goes straight there.

1. Open the point's page.
2. Type what you found or did, parts used, settings.
3. **Photo** to add a picture from the phone camera (it is made smaller before uploading, so it works on slow Wi-Fi), or **File** to attach a **PDF**, JPG or PNG up to 15 MB – a manual, drawing, test sheet or COC. Tap a file in the log to open it.
4. **Add note.**

Notes show who wrote them and when, newest first. Tap a photo to see it big. You (or an admin) can delete your own note – tap the bin twice. Points with notes show 📝 and a count in the list.

## Measuring distance and area {icon:mdi:ruler}

1. Tap {icon:mdi:ruler} on the map.
2. Tap along the route – or tap a point to start or end exactly on it. Every corner shows the distance so far; the bar shows the total.
3. **Area** closes the shape and shows hectares. **Undo** removes the last tap, **Clear** starts over.
4. **Done** when finished. Measurements are not saved – admins can tap **Save as line** to keep it as a pipe, cable or land.

## Quotes and documents {icon:mdi:file-document-edit-outline}

Quotes, invoices, COCs and plans shared with you are in **Quotes & documents** in the list (and on the point's page they belong to).

1. Tap one to see the details, then **Open** to view it. **Save** downloads it.
2. For a quote: add a comment if you like and tap **Accept quote** or **Decline** – twice to confirm. The installer is told straight away.

You only see documents that were shared with you.

## Alerts {icon:mdi:alert-outline}

A point alerts when it has a **fault**, **no power**, is **offline**, a tank is **low**, or a transformer / Eskom NMD is **over 100 %** – after it has lasted a while (2 minutes unless changed), so a short blip doesn't alert. You get a message again when it is back to normal.

Alerts show in **Alerts** on the map page, as Home Assistant notifications (the bell) and – if set up – on a phone.

## Dashboard card {icon:mdi:view-dashboard-outline}

The farm map can also sit on any dashboard: Edit dashboard → **Add card** → **Hamlet Farm map**. Tap a point for its status; **Open on the map page** goes to it.

```yaml
type: custom:hamlet-farm-card
farm: Doornkloof   # optional
height: 400
```

## Setting up a farm {admin} {icon:mdi:cog-outline}

1. **Settings → Devices & services → Add integration → Hamlet Farm**, give the farm a name.
2. Open **Farm map** → **Edit** (top right – admins only).
3. Find the farm (search a place or GPS, or zoom in) and tap **Start view** so the map always opens there.
4. **Point** → tap where the pump / pivot / Eskom point is, **type its GPS** in the bar and tap **Add**, or **Where I stand** on site to use the phone's GPS. GPS can be typed or pasted as `-25.861234, 28.103456`, `25°51'40"S 28°06'12"E`, `S25 51 40 E28 06 12`, or a Google Maps link.
5. Pick the **type**, give it a **name** and link the sensors (below). **Save.**
6. Drag points to move them – or change **GPS position** in the point's settings (under the name) and tap **Move**. Tap a point in Edit to change or delete it.

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

**Colour and icon:** under the name, pick a **colour** for the point (**A** = automatic status colours, or the colour picker for any colour) and an **icon** (start typing, e.g. `mdi:barn`, `mdi:water-well`, `mdi:tractor` – any icon from materialdesignicons.com). The colour and icon are saved straight away – no need to tap Save. **Use this colour and icon for all …** copies it to every point of the same type. Running (green), attention (orange), fault (red) and offline (grey) still show their status colour, so a problem is never hidden.

## Installation details and service reports {admin} {icon:mdi:clipboard-text-outline}

**Installation details** – Edit → tap the pump / pivot → **Installation details**: installed on, borehole depth, pump installed at, static water level, yield, motor size (kW), motor and pump make / model, starter (DOL, star-delta, soft starter, VFD, pump controller, pressure / float switch), cable, delivery pipe, serial number, installed by. Pivots: make / model, towers, motor, starter, end gun. They show on the point's page and on every service report.

**New service report** – open the point → **Service** tab → **New report**:

1. Date, reference / job card number and a title (e.g. *6-month service, new non-return valve*).
2. **Work done** and **Readings** (amps per phase, pressure, water level, insulation…).
3. **Parts & labour**: a line per item with quantity and price – **+ Labour**, **+ Call-out** and **+ Travel** add the usual lines. Subtotal, **VAT 15 %** (switch off if not VAT registered) and total are worked out as you type.
4. **Next service due** – pick a date or tap **6 mo** / **1 yr**.
5. **Who may see it** – tick the client's people. Prices are only shown to them and admins.
6. **Save report.** Open it to **Print / save as PDF**, **Edit**, **Copy** (start the next report from this one) or **Delete**.

Put your **company name** and **contact details** for the top of the printed report under **Settings** at the bottom of the list.

## Lines, cables and land {admin} {icon:mdi:vector-polyline}

1. **Edit → Line / land.**
2. Pick what you are drawing in the bar: water pipe, cable 1 000 V / 3 300 V / MV, overhead power line, fence, road, land / camp. The bar shows the length (or hectares) so far.
3. Tap along the route. **Undo** removes the last point.
4. **Finish** → give it a name and **Details** (e.g. *95 mm² 4-core Cu SWA*). **Save.**

Tap a line in Edit to rename it, change its type, write **Notes** (pipe size, depth, joints…), switch **Show the length on the map** on, or **Delete** it (tap twice).

## Drawing, planning lines and deleting {admin} {icon:mdi:draw}

- **Edit → Draw:** drag a finger or the mouse on the map. Pick a colour in the bar. **Length** writes each line's length next to it. **Undo** takes back the last stroke.
- **Planning** in the Draw bar (or *Planning / demo only* in a line's settings) hides the drawing from the map. Admins show planning lines with **Layers → Planning lines**; clients never see them.
- **Delete one drawing or line:** Edit → tap it → **Delete** (twice).
- **Delete all drawings:** **Layers → Delete all drawings** (twice). Pipes, cables and other lines stay.

## Transformers and Eskom points {admin} {icon:mdi:flash-triangle}

**Transformer:** enter the **size (kVA)** and **primary / secondary voltage**. The page shows the full-load current. Link a power meter to see the **load %** (kW against kVA – an estimate) and get **Overloaded** above 100 %.

**Eskom point:** enter the **Eskom account number**, **meter number**, **pole / transformer number**, **transformer size**, **NMD**, **supply voltage** and **tariff**. Link the **kWh meter (total)** for kWh used today, this month and the meter reading, and a power sensor for the **load % of the NMD** – **Above NMD** when over. Anyone who can open the farm map sees these details.

## Pumps and dashboard cards on a page {admin} {icon:mdi:gauge}

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

## Offline farm photo {admin} {icon:mdi:image-filter-hdr}

Keeps an aerial photo of the farm on Home Assistant, so the map has a picture without internet.

1. Get a **CD:NGI aerial photo** (GeoTIFF, free from the CD:NGI geospatial portal) of the 1:10 000 sheet the farm is on – or any JPG / PNG of the farm, e.g. a drone photo.
2. Bottom of the list → **Offline farm photo → Add a photo** (best on a PC – NGI files are big).
3. **GeoTIFF:** it places itself – zoom so the white frame is around the farm, or keep the whole photo. **JPG / PNG:** drag the round corners until it lines up with the satellite map.
4. **Save to Home Assistant** and keep the page open until it says *saved*.

Turn a photo off with the eye, or delete it, in the same list.

## Sharing quotes and documents {admin} {icon:mdi:share-variant-outline}

1. **Quotes & documents → Upload** (or **Upload** on a point's page to link it there).
2. Pick the PDF / JPG / PNG (max 15 MB), title, type, amount and a note.
3. Tick **who may see it** – the client's Home Assistant users (Settings → People).
4. They can open it, and accept or decline a quote. You get a notification – on your phone too if *Send alerts to* is set. **Ask again** resets the answer.

**Admins always see every document**, so give the client's people normal (non-admin) accounts.

## Settings {admin} {icon:mdi:bell-cog-outline}

At the bottom of the list (admins only):

- **Company / contact on service reports:** printed at the top of every service report.

- **Send alerts to:** a phone, e.g. `notify.mobile_app_wynand` – blank = Home Assistant notifications only.
- **Alert after:** how long a problem must last before it alerts (default 120 s).
- **Map style for everyone:** Satellite, Hybrid or Map.

Each point has **Alert when this point has a problem** in its settings – switch it off for points that should never alert.

## Problems and questions {icon:mdi:help-circle-outline}

**A point shows *Offline – no signal*.** Home Assistant can't reach the sensor. Check the Shelly / meter has power and Wi-Fi. On an Eskom point it often means the power is off.

**The map background is blank.** The map pictures come from the internet. Without internet the points still work over the farm's Wi-Fi – an admin can save an *Offline farm photo*.

**I can't see the Edit button.** Only Home Assistant admins can edit the map.

***My location* or *Where I stand* doesn't work.** It needs Home Assistant opened over https (e.g. Nabu Casa) and location permission for the browser / app.

**A card on a point's page says it can't be shown.** The custom card isn't installed on this Home Assistant – install it through HACS and refresh.

**The On / Off button does nothing.** Tap it twice – the first tap asks *Tap again*. If it still doesn't switch, check the linked switch works in Home Assistant.

**Updates:** HACS → Updates → Hamlet Farm, then refresh the browser (Ctrl+F5, or pull down in the app).
