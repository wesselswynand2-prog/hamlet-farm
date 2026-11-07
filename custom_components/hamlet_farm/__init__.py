"""Hamlet Farm: a satellite map of the client's farm with live pumps, pivots, Eskom points and more."""
from __future__ import annotations

import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN, PANEL_COMPONENT, PANEL_URL_PATH, STATIC_URL, VERSION
from .controller import FarmController
from .docs import DocFileView
from .notes import PhotoUploadView, PhotoView
from .offline import OfflineTileView, OfflineUploadView, remove_tree, root_dir

_LOGGER = logging.getLogger(__name__)
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
CARD_URL = f"{STATIC_URL}/hamlet-farm-card.js?v={VERSION}"
PLATFORMS = [Platform.SENSOR]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    hass.data.setdefault(DOMAIN, {})
    _register_websocket(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    data = hass.data.setdefault(DOMAIN, {})
    controller = FarmController(hass, entry)
    data[entry.entry_id] = controller
    await controller.async_start()
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    await _async_register_panel(hass)
    entry.async_on_unload(entry.add_update_listener(_async_reload))
    return True


async def _async_reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if ok:
        controller: FarmController = hass.data[DOMAIN].pop(entry.entry_id)
        await controller.async_stop()
        if not _controllers(hass) and hass.data[DOMAIN].pop("_panel", False):
            frontend.async_remove_panel(hass, PANEL_URL_PATH)
        if not _controllers(hass) and hass.data[DOMAIN].pop("_card", False):
            frontend.remove_extra_js_url(hass, CARD_URL)
    return ok


def _controllers(hass: HomeAssistant) -> dict[str, FarmController]:
    return {k: v for k, v in hass.data.get(DOMAIN, {}).items() if isinstance(v, FarmController)}


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Farm deleted: remove its offline pictures from disk."""
    await hass.async_add_executor_job(remove_tree, root_dir(hass, entry.entry_id))


async def _async_register_panel(hass: HomeAssistant) -> None:
    data = hass.data[DOMAIN]
    if not data.get("_views"):
        hass.http.register_view(OfflineUploadView())
        hass.http.register_view(OfflineTileView())
        hass.http.register_view(PhotoUploadView())
        hass.http.register_view(PhotoView())
        hass.http.register_view(DocFileView())
        data["_views"] = True
    if not data.get("_static"):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(Path(__file__).parent / "frontend"), cache_headers=False)]
        )
        data["_static"] = True
    if not data.get("_card"):
        frontend.add_extra_js_url(hass, CARD_URL)
        data["_card"] = True
    if data.get("_panel"):
        return
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_COMPONENT,
        module_url=f"{STATIC_URL}/hamlet-farm-panel.js?v={VERSION}",
        sidebar_title="Farm map",
        sidebar_icon="mdi:map-marker-radius",
        require_admin=False,
        embed_iframe=False,
    )
    data["_panel"] = True


# ------------------------------------------------------------------ websocket
def _get(hass: HomeAssistant, connection, msg) -> FarmController | None:
    controller = _controllers(hass).get(msg["entry_id"])
    if controller is None:
        connection.send_error(msg["id"], "not_found", "Farm not found")
    return controller


def _register_websocket(hass: HomeAssistant) -> None:
    if hass.data[DOMAIN].get("_ws"):
        return
    hass.data[DOMAIN]["_ws"] = True
    for handler in (ws_list, ws_state, ws_subscribe, ws_save_point, ws_delete_point, ws_save_shape,
                    ws_delete_shape, ws_save_view, ws_save_settings, ws_offline_create, ws_offline_finish,
                    ws_offline_visible, ws_offline_delete, ws_notes, ws_note_add, ws_note_delete,
                    ws_docs, ws_doc_users, ws_doc_create, ws_doc_update, ws_doc_delete, ws_doc_respond):
        websocket_api.async_register_command(hass, handler)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/list"})
@callback
def ws_list(hass, connection, msg):
    connection.send_result(msg["id"], [{"entry_id": c.entry.entry_id, "name": c.name} for c in _controllers(hass).values()])


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/state", vol.Required("entry_id"): str})
@callback
def ws_state(hass, connection, msg):
    if controller := _get(hass, connection, msg):
        connection.send_result(msg["id"], {**controller.snapshot(), "is_admin": connection.user.is_admin,
                                           "pumps": controller.pump_list()})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/subscribe", vol.Required("entry_id"): str})
@callback
def ws_subscribe(hass, connection, msg):
    controller = _get(hass, connection, msg)
    if controller is None:
        return

    @callback
    def forward() -> None:
        connection.send_message(websocket_api.event_message(msg["id"], controller.snapshot()))

    connection.subscriptions[msg["id"]] = controller.add_listener(forward)
    connection.send_result(msg["id"])
    forward()


def _edit(name: str, schema: dict):
    """Admin-only edit command: calls controller.<name>(value) and returns the new snapshot."""
    key = next(iter(k for k in schema if str(k) not in ("type", "entry_id")))

    @websocket_api.require_admin
    @websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/{name}", vol.Required("entry_id"): str, **schema})
    @callback
    def handler(hass, connection, msg):
        if controller := _get(hass, connection, msg):
            try:
                result = getattr(controller, name)(msg[str(key)])
            except (ValueError, KeyError, TypeError) as err:
                connection.send_error(msg["id"], "invalid", str(err))
                return
            connection.send_result(msg["id"], {"result": result, **controller.snapshot()})

    handler.__name__ = f"ws_{name}"
    return handler


ws_save_point = _edit("save_point", {vol.Required("point"): dict})
ws_delete_point = _edit("delete_point", {vol.Required("point_id"): str})
ws_save_shape = _edit("save_shape", {vol.Required("shape"): dict})
ws_delete_shape = _edit("delete_shape", {vol.Required("shape_id"): str})
ws_save_view = _edit("save_view", {vol.Required("view"): dict})
ws_save_settings = _edit("save_settings", {vol.Required("settings"): dict})
ws_offline_create = _edit("offline_create", {vol.Required("layer"): dict})
ws_offline_finish = _edit("offline_finish", {vol.Required("layer_id"): str})
ws_offline_visible = _edit("offline_visible", {vol.Required("layer"): dict})


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/offline_delete", vol.Required("entry_id"): str,
                                  vol.Required("layer_id"): str})
@websocket_api.async_response
async def ws_offline_delete(hass, connection, msg):
    if controller := _get(hass, connection, msg):
        try:
            await controller.async_offline_delete(msg["layer_id"])
        except ValueError as err:
            connection.send_error(msg["id"], "invalid", str(err))
            return
        connection.send_result(msg["id"], {"result": None, **controller.snapshot()})


# ------------------------------------------------------------------ notes (any logged-in user)
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/notes", vol.Required("entry_id"): str, vol.Required("target"): str})
@callback
def ws_notes(hass, connection, msg):
    if controller := _get(hass, connection, msg):
        connection.send_result(msg["id"], {"notes": controller.notes_for(msg["target"]), "user_id": connection.user.id,
                                           "is_admin": connection.user.is_admin})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/note_add", vol.Required("entry_id"): str, vol.Required("target"): str,
                                  vol.Optional("text", default=""): str, vol.Optional("photo"): vol.Any(str, None)})
@callback
def ws_note_add(hass, connection, msg):
    if controller := _get(hass, connection, msg):
        try:
            note = controller.note_add(msg["target"], msg["text"], connection.user, msg.get("photo"))
        except ValueError as err:
            connection.send_error(msg["id"], "invalid", str(err))
            return
        connection.send_result(msg["id"], {"note": note, "notes": controller.notes_for(msg["target"])})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/note_delete", vol.Required("entry_id"): str,
                                  vol.Required("target"): str, vol.Required("note_id"): str})
@callback
def ws_note_delete(hass, connection, msg):
    if controller := _get(hass, connection, msg):
        try:
            controller.note_delete(msg["target"], msg["note_id"], connection.user)
        except PermissionError as err:
            connection.send_error(msg["id"], "unauthorized", str(err))
            return
        except ValueError as err:
            connection.send_error(msg["id"], "invalid", str(err))
            return
        connection.send_result(msg["id"], {"notes": controller.notes_for(msg["target"])})


# ------------------------------------------------------------------ quotes / documents
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/docs", vol.Required("entry_id"): str})
@callback
def ws_docs(hass, connection, msg):
    if controller := _get(hass, connection, msg):
        connection.send_result(msg["id"], {"docs": controller.docs_for(connection.user), "is_admin": connection.user.is_admin})


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/doc_users", vol.Required("entry_id"): str})
@websocket_api.async_response
async def ws_doc_users(hass, connection, msg):
    users = await hass.auth.async_get_users()
    connection.send_result(msg["id"], [{"id": u.id, "name": u.name or "?", "admin": u.is_admin}
                                       for u in users if u.is_active and not u.system_generated])


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/doc_create", vol.Required("entry_id"): str, vol.Required("doc"): dict})
@callback
def ws_doc_create(hass, connection, msg):
    if controller := _get(hass, connection, msg):
        try:
            doc = controller.doc_create(msg["doc"], connection.user)
        except ValueError as err:
            connection.send_error(msg["id"], "invalid", str(err))
            return
        connection.send_result(msg["id"], doc)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/doc_update", vol.Required("entry_id"): str, vol.Required("doc"): dict})
@callback
def ws_doc_update(hass, connection, msg):
    if controller := _get(hass, connection, msg):
        try:
            controller.doc_update(msg["doc"])
        except ValueError as err:
            connection.send_error(msg["id"], "invalid", str(err))
            return
        connection.send_result(msg["id"], {"docs": controller.docs_for(connection.user)})


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/doc_delete", vol.Required("entry_id"): str, vol.Required("doc_id"): str})
@websocket_api.async_response
async def ws_doc_delete(hass, connection, msg):
    if controller := _get(hass, connection, msg):
        try:
            await controller.async_doc_delete(msg["doc_id"])
        except ValueError as err:
            connection.send_error(msg["id"], "invalid", str(err))
            return
        connection.send_result(msg["id"], {"docs": controller.docs_for(connection.user)})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/doc_respond", vol.Required("entry_id"): str, vol.Required("doc_id"): str,
                                  vol.Required("answer"): vol.In(["accepted", "declined"]), vol.Optional("note", default=""): str})
@callback
def ws_doc_respond(hass, connection, msg):
    if controller := _get(hass, connection, msg):
        try:
            controller.doc_respond(msg["doc_id"], msg["answer"], msg["note"], connection.user)
        except ValueError as err:
            connection.send_error(msg["id"], "invalid", str(err))
            return
        connection.send_result(msg["id"], {"docs": controller.docs_for(connection.user)})
