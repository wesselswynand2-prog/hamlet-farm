"""FarmController: keeps the farm's map points, follows their entities and raises alerts."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Callable

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import (
    async_call_later,
    async_track_state_change_event,
    async_track_time_interval,
)
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from . import logic
from .const import CONF_NAME, DOMAIN, MAX_EVENTS, PUSH_DEBOUNCE_S, SIGNAL_UPDATE, STORE_VERSION, TICK_S

_LOGGER = logging.getLogger(__name__)
PUMP_DOMAIN = "hamlet_pump"

DEFAULT_SETTINGS = {"notify_service": "", "alert_delay_s": 120, "base": "satellite"}


class FarmController:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self._store: Store = Store(hass, STORE_VERSION, f"{DOMAIN}.{entry.entry_id}")
        self.points: list[dict] = []
        self.shapes: list[dict] = []
        self.view: dict | None = None
        self.settings: dict[str, Any] = dict(DEFAULT_SETTINGS)
        self.events: list[dict] = []
        self.energy_base: dict[str, Any] = {"date": None, "base": {}}
        self.statuses: dict[str, dict] = {}
        self.summary: dict = logic.summary([], {})
        self._listeners: list[Callable[[], None]] = []
        self._unsubs: list[CALLBACK_TYPE] = []
        self._track_unsub: CALLBACK_TYPE | None = None
        self._pump_unsubs: dict[str, CALLBACK_TYPE] = {}
        self._push_handle: CALLBACK_TYPE | None = None
        self._alert_since: dict[str, datetime] = {}
        self._alerted: set[str] = set()

    @property
    def name(self) -> str:
        return self.entry.options.get(CONF_NAME) or self.entry.data.get(CONF_NAME) or "Farm"

    # ------------------------------------------------------------ lifecycle
    async def async_start(self) -> None:
        data = await self._store.async_load() or {}
        self.points = [p for p in (self._safe(logic.clean_point, p) for p in data.get("points", [])) if p]
        self.shapes = [s for s in (self._safe(logic.clean_shape, s) for s in data.get("shapes", [])) if s]
        self.view = logic.clean_view(data.get("view"))
        self.settings = {**DEFAULT_SETTINGS, **(data.get("settings") or {})}
        self.events = list(data.get("events") or [])[-MAX_EVENTS:]
        self.energy_base = data.get("energy_base") or {"date": None, "base": {}}
        self._alerted = set(data.get("alerted") or [])
        self._retrack()
        self._unsubs.append(async_track_time_interval(self.hass, self._tick, timedelta(seconds=TICK_S)))
        self._recompute()
        self._tick()

    async def async_stop(self) -> None:
        for u in self._unsubs:
            u()
        self._unsubs.clear()
        if self._track_unsub:
            self._track_unsub()
            self._track_unsub = None
        for u in self._pump_unsubs.values():
            u()
        self._pump_unsubs.clear()
        if self._push_handle:
            self._push_handle()
            self._push_handle = None
        await self._store.async_save(self._data())

    @staticmethod
    def _safe(fn, raw):
        try:
            return fn(raw)
        except ValueError:
            return None

    def _data(self) -> dict:
        return {
            "points": self.points, "shapes": self.shapes, "view": self.view, "settings": self.settings,
            "events": self.events[-MAX_EVENTS:], "energy_base": self.energy_base, "alerted": sorted(self._alerted),
        }

    def _save(self) -> None:
        self._store.async_delay_save(self._data, 5)

    # ------------------------------------------------------------ listeners
    def add_listener(self, cb: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(cb)

        def remove() -> None:
            if cb in self._listeners:
                self._listeners.remove(cb)

        return remove

    @callback
    def _notify_listeners(self) -> None:
        for cb in list(self._listeners):
            try:
                cb()
            except Exception:  # noqa: BLE001 - one bad websocket mustn't stop the rest
                _LOGGER.exception("hamlet_farm listener failed")
        async_dispatcher_send(self.hass, SIGNAL_UPDATE.format(self.entry.entry_id))

    @callback
    def _schedule_push(self, *_: Any) -> None:
        if self._push_handle:
            return

        @callback
        def run(_now: Any) -> None:
            self._push_handle = None
            self._recompute()

        self._push_handle = async_call_later(self.hass, PUSH_DEBOUNCE_S, run)

    # ------------------------------------------------------------ tracking
    def _retrack(self) -> None:
        if self._track_unsub:
            self._track_unsub()
            self._track_unsub = None
        ents = sorted({e for p in self.points for e in logic.point_entities(p)})
        if ents:
            self._track_unsub = async_track_state_change_event(self.hass, ents, self._on_state)
        self._link_pumps()

    @callback
    def _on_state(self, event: Event) -> None:
        self._schedule_push()

    def _pump_controllers(self) -> dict[str, Any]:
        return {k: v for k, v in self.hass.data.get(PUMP_DOMAIN, {}).items() if hasattr(v, "snapshot")}

    def _link_pumps(self) -> None:
        """Follow linked Hamlet Pump controllers (they may load after us, so this re-runs every tick)."""
        pumps = self._pump_controllers()
        wanted = {p["pump_entry"] for p in self.points if p.get("pump_entry")}
        for pid in list(self._pump_unsubs):
            if pid not in wanted or pid not in pumps:
                self._pump_unsubs.pop(pid)()
        for pid in wanted:
            if pid in pumps and pid not in self._pump_unsubs and hasattr(pumps[pid], "add_listener"):
                self._pump_unsubs[pid] = pumps[pid].add_listener(self._schedule_push)

    def pump_list(self) -> list[dict]:
        return [{"entry_id": k, "name": getattr(v, "name", k), "type": getattr(v, "pump_type", "")}
                for k, v in self._pump_controllers().items()]

    # ------------------------------------------------------------ status
    def _read(self, entity_id: str) -> logic.Reading | None:
        st = self.hass.states.get(entity_id)
        if st is None:
            return None
        return logic.Reading(st.state, st.attributes.get("unit_of_measurement"))

    @callback
    def _recompute(self) -> None:
        pumps = self._pump_controllers()
        statuses = {}
        for p in self.points:
            snap = None
            if p.get("pump_entry") and (pc := pumps.get(p["pump_entry"])):
                try:
                    snap = pc.snapshot()
                except Exception:  # noqa: BLE001
                    snap = None
            statuses[p["id"]] = logic.point_status(p, self._read, snap, self._energy_today(p))
        self.statuses = statuses
        self.summary = logic.summary(self.points, statuses)
        self._notify_listeners()

    def _energy_today(self, p: dict) -> float | None:
        ent = p.get("entities", {}).get("energy")
        if not ent:
            return None
        cur = logic.kwh(self._read(ent))
        if cur is None:
            return None
        base = self.energy_base.setdefault("base", {})
        b = base.get(p["id"])
        if b is None or cur < b:     # first reading today, or the meter was reset
            base[p["id"]] = cur
            self._save()
            return 0.0
        return cur - b

    @callback
    def _tick(self, now: datetime | None = None) -> None:
        now = now or dt_util.now()
        today = dt_util.as_local(now).date().isoformat()
        if self.energy_base.get("date") != today:
            # new day: today's usage starts from the meter reading now
            self.energy_base = {"date": today, "base": {}}
            self._save()
        self._link_pumps()
        self._recompute()
        self._check_alerts(now)

    # ------------------------------------------------------------ alerts
    def _check_alerts(self, now: datetime) -> None:
        delay = float(self.settings.get("alert_delay_s") or 0)
        ids = {p["id"] for p in self.points}
        for pid in list(self._alert_since):
            if pid not in ids:
                self._alert_since.pop(pid)
        self._alerted &= ids
        for p in self.points:
            st = self.statuses.get(p["id"])
            if not st:
                continue
            if st["alert"] and p.get("alert", True):
                since = self._alert_since.setdefault(p["id"], now)
                if p["id"] not in self._alerted and (now - since).total_seconds() >= delay:
                    self._alerted.add(p["id"])
                    self._event(p, st["status"], st["cls"])
                    self.hass.async_create_task(self._send(p, f"⚠ {p['name']}: {st['status']}", st["cls"]))
            else:
                self._alert_since.pop(p["id"], None)
                if p["id"] in self._alerted:
                    self._alerted.discard(p["id"])
                    self._event(p, f"back to normal – {st['status'] or 'OK'}", "ok")
                    self.hass.async_create_task(self._send(p, f"✓ {p['name']}: back to normal ({st['status'] or 'OK'})", "ok"))

    def _event(self, p: dict, text: str, cls: str) -> None:
        self.events.append({"t": dt_util.now().isoformat(), "point": p["id"], "name": p["name"], "text": text, "cls": cls})
        self.events = self.events[-MAX_EVENTS:]
        self._save()

    async def _send(self, p: dict, msg: str, cls: str) -> None:
        title = f"{self.name} – farm map"
        nid = f"{DOMAIN}_{self.entry.entry_id}_{p['id']}"
        if self.hass.services.has_service("persistent_notification", "create"):
            if cls != "ok":
                await self.hass.services.async_call("persistent_notification", "create",
                                                    {"title": title, "message": msg, "notification_id": nid}, blocking=False)
            else:
                await self.hass.services.async_call("persistent_notification", "dismiss", {"notification_id": nid}, blocking=False)
        svc = self.settings.get("notify_service") or ""
        if svc.startswith("notify.") and self.hass.services.has_service("notify", svc.split(".", 1)[1]):
            try:
                await self.hass.services.async_call("notify", svc.split(".", 1)[1], {"title": title, "message": msg}, blocking=False)
            except Exception as err:  # noqa: BLE001
                _LOGGER.warning("%s: notify %s failed: %s", self.name, svc, err)

    # ------------------------------------------------------------ editing (from the panel)
    def save_point(self, raw: dict) -> dict:
        point = logic.clean_point(raw)
        for i, p in enumerate(self.points):
            if p["id"] == point["id"]:
                self.points[i] = point
                break
        else:
            self.points.append(point)
        self._changed()
        return point

    def delete_point(self, pid: str) -> None:
        self.points = [p for p in self.points if p["id"] != pid]
        self._changed()

    def save_shape(self, raw: dict) -> dict:
        shape = logic.clean_shape(raw)
        for i, s in enumerate(self.shapes):
            if s["id"] == shape["id"]:
                self.shapes[i] = shape
                break
        else:
            self.shapes.append(shape)
        self._changed()
        return shape

    def delete_shape(self, sid: str) -> None:
        self.shapes = [s for s in self.shapes if s["id"] != sid]
        self._changed()

    def save_view(self, raw: dict) -> None:
        self.view = logic.clean_view(raw)
        self._changed()

    def save_settings(self, raw: dict) -> None:
        s = dict(self.settings)
        if "notify_service" in raw:
            svc = str(raw["notify_service"] or "").strip()
            if svc and not svc.startswith("notify."):
                raise ValueError("Alerts service must start with notify.")
            s["notify_service"] = svc
        if "alert_delay_s" in raw:
            s["alert_delay_s"] = max(0, min(3600, int(float(raw["alert_delay_s"]))))
        if "base" in raw:
            if raw["base"] not in ("satellite", "hybrid", "map"):
                raise ValueError("unknown map style")
            s["base"] = raw["base"]
        self.settings = s
        self._changed()

    def _changed(self) -> None:
        self._save()
        self._retrack()
        self._recompute()

    # ------------------------------------------------------------ snapshot
    def snapshot(self) -> dict:
        return {
            "entry_id": self.entry.entry_id,
            "name": self.name,
            "points": self.points,
            "shapes": self.shapes,
            "view": self.view,
            "settings": self.settings,
            "statuses": self.statuses,
            "summary": self.summary,
            "events": list(reversed(self.events[-10:])),
        }
