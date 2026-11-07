"""FarmController: keeps the farm's map points, follows their entities and raises alerts."""
from __future__ import annotations

import logging
import secrets
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

from . import docs as docs_mod, logic, notes as notes_mod, offline
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
        self.notes: dict[str, list[dict]] = {}
        self.docs: list[dict] = []
        self.offline: list[dict] = []
        self.tile_token: str = ""
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
        self.tile_token = data.get("tile_token") or secrets.token_urlsafe(18)
        self.notes = {k: v for k, v in (data.get("notes") or {}).items() if isinstance(v, list)}
        self.docs = [d for d in (data.get("docs") or []) if d.get("size")]   # drop uploads that never got their file
        await self.hass.async_add_executor_job(notes_mod.clean_orphans, self.hass, self.entry.entry_id, self._photo_ids())
        self.offline = []
        for layer in data.get("offline") or []:
            if layer.get("status") == "ready":
                self.offline.append(layer)
            else:   # an upload that never finished (browser closed) – throw it away
                await self.hass.async_add_executor_job(
                    offline.remove_tree, offline.layer_dir(self.hass, self.entry.entry_id, layer["id"]))
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
            "tile_token": self.tile_token, "offline": self.offline, "notes": self.notes, "docs": self.docs,
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
        self._drop_notes(pid)
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
        self._drop_notes(sid)
        self._changed()

    # ------------------------------------------------------------ notes / site log
    def _bg(self, fn, *args) -> None:
        """Run blocking file work in the background (tracked, so it finishes before Home Assistant stops)."""
        async def run() -> None:
            await self.hass.async_add_executor_job(fn, *args)
        self.hass.async_create_task(run())

    def _photo_ids(self) -> set[str]:
        return {n["photo"] for lst in self.notes.values() for n in lst if n.get("photo")}

    def photo_known(self, photo_id: str) -> bool:
        return photo_id in self._photo_ids()

    def _target_exists(self, target: str) -> bool:
        return any(p["id"] == target for p in self.points) or any(s["id"] == target for s in self.shapes)

    def notes_for(self, target: str) -> list[dict]:
        return list(reversed(self.notes.get(target, [])))

    def note_add(self, target: str, text: str, user, photo: str | None = None) -> dict:
        if not self._target_exists(target):
            raise ValueError("That point is not on the map any more")
        text = str(text or "").strip()[:2000]
        if photo is not None and not notes_mod.PHOTO_ID.match(str(photo)):
            raise ValueError("bad photo")
        if not text and not photo:
            raise ValueError("Write a note or add a photo")
        note = {"id": logic.new_id(), "t": dt_util.now().isoformat(), "text": text, "photo": photo,
                "user_id": user.id if user else None, "user": (user.name if user else None) or "Someone"}
        lst = self.notes.setdefault(target, [])
        lst.append(note)
        dropped = lst[:-300]
        self.notes[target] = lst[-300:]
        if dropped:
            self._bg(notes_mod.delete_photos, self.hass, self.entry.entry_id,
                                             [n["photo"] for n in dropped if n.get("photo")])
        self._save()
        self._recompute()
        return note

    def note_delete(self, target: str, note_id: str, user) -> None:
        lst = self.notes.get(target, [])
        note = next((n for n in lst if n["id"] == note_id), None)
        if note is None:
            raise ValueError("Note not found")
        if not (user and (user.is_admin or user.id == note.get("user_id"))):
            raise PermissionError("Only an admin or the person who wrote it can delete a note")
        lst.remove(note)
        if note.get("photo"):
            self._bg(notes_mod.delete_photos, self.hass, self.entry.entry_id, [note["photo"]])
        self._save()
        self._recompute()

    # ------------------------------------------------------------ quotes / documents
    def doc(self, doc_id: str) -> dict | None:
        return next((d for d in self.docs if d["id"] == doc_id), None)

    def docs_for(self, user) -> list[dict]:
        out = [d for d in self.docs if d.get("size") and docs_mod.can_see(d, user)]
        if not (user and user.is_admin):   # clients don't need to see who else it is shared with
            out = [{k: v for k, v in d.items() if k != "users"} for d in out]
        return sorted(out, key=lambda d: d.get("created", ""), reverse=True)

    def _clean_doc(self, raw: dict, doc: dict) -> dict:
        if "title" in raw:
            doc["title"] = str(raw.get("title") or "").strip()[:100] or doc.get("title") or "Quote"
        if "kind" in raw:
            doc["kind"] = raw["kind"] if raw["kind"] in docs_mod.KINDS else "other"
        if "amount" in raw:
            doc["amount"] = str(raw.get("amount") or "").strip()[:40]
        if "notes" in raw:
            doc["notes"] = str(raw.get("notes") or "").strip()[:1000]
        if "point" in raw:
            pt = raw.get("point") or None
            doc["point"] = pt if pt and (any(p["id"] == pt for p in self.points) or any(x["id"] == pt for x in self.shapes)) else None
        if "users" in raw:
            if not isinstance(raw["users"], list):
                raise ValueError("users must be a list")
            doc["users"] = [str(u)[:64] for u in raw["users"]][:50]
        return doc

    def doc_create(self, raw: dict, user) -> dict:
        doc = {"id": logic.new_id() + logic.new_id(), "title": "Quote", "kind": "quote", "amount": "", "notes": "", "point": None,
               "users": [], "filename": str(raw.get("filename") or "document")[:120], "mime": None, "size": 0,
               "created": dt_util.now().isoformat(), "by": (user.name if user else None) or "Admin",
               "status": "new", "status_by": None, "status_at": None, "status_note": ""}
        self._clean_doc(raw, doc)
        self.docs.append(doc)
        return doc

    def doc_file_saved(self, doc_id: str, mime: str, size: int) -> None:
        if doc := self.doc(doc_id):
            doc["mime"], doc["size"] = mime, size
            self._save()

    def doc_update(self, raw: dict) -> dict:
        doc = self.doc(str(raw.get("id")))
        if doc is None:
            raise ValueError("Document not found")
        self._clean_doc(raw, doc)
        if raw.get("reset_status"):
            doc.update(status="new", status_by=None, status_at=None, status_note="")
        self._save()
        return doc

    async def async_doc_delete(self, doc_id: str) -> None:
        doc = self.doc(doc_id)
        if doc is None:
            raise ValueError("Document not found")
        self.docs.remove(doc)
        self._save()
        await self.hass.async_add_executor_job(lambda: docs_mod.doc_path(self.hass, self.entry.entry_id, doc_id).unlink(missing_ok=True))

    def doc_respond(self, doc_id: str, answer: str, note: str, user) -> dict:
        doc = self.doc(doc_id)
        if doc is None or not docs_mod.can_see(doc, user):
            raise ValueError("Document not found")
        if doc.get("kind") != "quote":
            raise ValueError("Only quotes can be accepted or declined")
        if answer not in ("accepted", "declined"):
            raise ValueError("bad answer")
        doc.update(status=answer, status_by=(user.name if user else None) or "Someone", status_at=dt_util.now().isoformat(),
                   status_note=str(note or "").strip()[:1000])
        self._save()
        msg = f"Quote “{doc['title']}”{' (' + doc['amount'] + ')' if doc.get('amount') else ''} was {answer} by {doc['status_by']}."
        if doc["status_note"]:
            msg += f"\n“{doc['status_note']}”"
        self.hass.async_create_task(self._send_doc_msg(doc, msg))
        return doc

    async def _send_doc_msg(self, doc: dict, msg: str) -> None:
        title = f"{self.name} – quote {doc['status']}"
        if self.hass.services.has_service("persistent_notification", "create"):
            await self.hass.services.async_call("persistent_notification", "create",
                                                {"title": title, "message": msg, "notification_id": f"{DOMAIN}_doc_{doc['id']}"}, blocking=False)
        svc = self.settings.get("notify_service") or ""
        if svc.startswith("notify.") and self.hass.services.has_service("notify", svc.split(".", 1)[1]):
            try:
                await self.hass.services.async_call("notify", svc.split(".", 1)[1], {"title": title, "message": msg}, blocking=False)
            except Exception as err:  # noqa: BLE001
                _LOGGER.warning("%s: notify %s failed: %s", self.name, svc, err)

    def _drop_notes(self, target: str) -> None:
        for d in self.docs:
            if d.get("point") == target:
                d["point"] = None
        gone = self.notes.pop(target, [])
        photos = [n["photo"] for n in gone if n.get("photo")]
        if photos:
            self._bg(notes_mod.delete_photos, self.hass, self.entry.entry_id, photos)

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

    # ------------------------------------------------------------ offline pictures
    def offline_layer(self, layer_id: str) -> dict | None:
        return next((x for x in self.offline if x["id"] == layer_id), None)

    def offline_create(self, raw: dict) -> dict:
        b = raw.get("bounds")
        try:
            (s, w), (n, e) = b
            s, w, n, e = float(s), float(w), float(n), float(e)
        except (TypeError, ValueError) as err:
            raise ValueError("bad picture bounds") from err
        if not (-90 <= s < n <= 90 and -180 <= w < e <= 180):
            raise ValueError("bad picture bounds")
        zmin, zmax = int(raw.get("minzoom", 12)), int(raw.get("maxzoom", 19))
        if not 0 <= zmin <= zmax <= 22:
            raise ValueError("bad zoom range")
        layer = {
            "id": logic.new_id() + logic.new_id(), "name": str(raw.get("name") or "Aerial photo")[:80],
            "source": str(raw.get("source") or "")[:120], "bounds": [[s, w], [n, e]],
            "minzoom": zmin, "maxzoom": zmax, "count": 0, "bytes": 0, "status": "uploading",
            "created": dt_util.now().isoformat(), "visible": True,
        }
        self.offline.append(layer)
        self._save()
        return layer

    def offline_progress(self, layer_id: str, count: int, size: int) -> None:
        if layer := self.offline_layer(layer_id):
            layer["count"] += count
            layer["bytes"] += size

    def offline_finish(self, layer_id: str) -> dict:
        layer = self.offline_layer(layer_id)
        if layer is None:
            raise ValueError("Picture not found")
        if not layer["count"]:
            raise ValueError("No part of the picture was saved")
        layer["status"] = "ready"
        self._changed()
        return layer

    def offline_visible(self, raw: dict) -> None:
        layer = self.offline_layer(str(raw.get("id")))
        if layer is None:
            raise ValueError("Picture not found")
        layer["visible"] = bool(raw.get("visible"))
        self._changed()

    async def async_offline_delete(self, layer_id: str) -> None:
        layer = self.offline_layer(layer_id)
        if layer is None:
            raise ValueError("Picture not found")
        self.offline.remove(layer)
        self._changed()
        await self.hass.async_add_executor_job(offline.remove_tree, offline.layer_dir(self.hass, self.entry.entry_id, layer_id))

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
            "offline": [x for x in self.offline if x.get("status") == "ready"],
            "tile_url": f"/api/hamlet_farm/tiles/{self.tile_token}",
            "photo_url": f"/api/hamlet_farm/photos/{self.tile_token}",
            "note_counts": {k: len(v) for k, v in self.notes.items() if v},
        }
