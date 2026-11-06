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


async def _async_register_panel(hass: HomeAssistant) -> None:
    data = hass.data[DOMAIN]
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
                    ws_delete_shape, ws_save_view, ws_save_settings):
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
