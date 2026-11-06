"""Offline farm pictures: map tiles made in the browser from an aerial photo, stored on Home Assistant.

The browser cuts the photo (e.g. a CD:NGI GeoTIFF) into normal 256 px web-map tiles and uploads them here;
Home Assistant stores them under /config/hamlet_farm/<entry>/<layer>/<z>/<x>/<y>.jpg|png and serves them to the map,
so the farm background shows even with no internet.
"""
from __future__ import annotations

import base64
import binascii
import logging
import re
import shutil
from pathlib import Path
from typing import TYPE_CHECKING

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import DOMAIN

if TYPE_CHECKING:
    from .controller import FarmController

_LOGGER = logging.getLogger(__name__)

MAX_TILE_BYTES = 400_000
MAX_LAYER_TILES = 60_000
_ID = re.compile(r"^[A-Za-z0-9_-]{4,40}$")
# 1x1 transparent PNG for tiles the picture doesn't cover
EMPTY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def root_dir(hass: HomeAssistant, entry_id: str) -> Path:
    return Path(hass.config.path(DOMAIN, entry_id))


def layer_dir(hass: HomeAssistant, entry_id: str, layer_id: str) -> Path:
    if not _ID.match(layer_id):
        raise ValueError("bad picture id")
    return root_dir(hass, entry_id) / layer_id


def remove_tree(path: Path) -> None:
    shutil.rmtree(path, ignore_errors=True)


def _write_tiles(base: Path, tiles: list) -> tuple[int, int]:
    count = size = 0
    for t in tiles:
        z, x, y, ext, data = t
        z, x, y = int(z), int(x), int(y)
        if not (0 <= z <= 22 and 0 <= x < 2**z and 0 <= y < 2**z) or ext not in ("jpg", "png"):
            raise ValueError("bad tile")
        raw = base64.b64decode(data, validate=True)
        if len(raw) > MAX_TILE_BYTES or raw[:3] not in (b"\xff\xd8\xff", b"\x89PN"):
            raise ValueError("tile is not a JPEG / PNG")
        d = base / str(z) / str(x)
        d.mkdir(parents=True, exist_ok=True)
        other = d / f"{y}.{'png' if ext == 'jpg' else 'jpg'}"
        if other.exists():
            other.unlink()
        (d / f"{y}.{ext}").write_bytes(raw)
        count += 1
        size += len(raw)
    return count, size


def _read_tile(base: Path, z: int, x: int, y: int) -> tuple[bytes, str] | None:
    for ext, ctype in (("jpg", "image/jpeg"), ("png", "image/png")):
        f = base / str(z) / str(x) / f"{y}.{ext}"
        if f.is_file():
            return f.read_bytes(), ctype
    return None


def _farm(hass: HomeAssistant, entry_id: str) -> FarmController | None:
    from .controller import FarmController  # noqa: PLC0415 - avoid an import cycle

    c = hass.data.get(DOMAIN, {}).get(entry_id)
    return c if isinstance(c, FarmController) else None


class OfflineUploadView(HomeAssistantView):
    """POST a batch of tiles for a picture that is being saved (admin only)."""

    url = "/api/hamlet_farm/upload/{entry_id}/{layer_id}"
    name = "api:hamlet_farm:upload"
    requires_auth = True

    async def post(self, request: web.Request, entry_id: str, layer_id: str) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        user = request.get("hass_user")
        if user is None or not user.is_admin:
            return self.json_message("Admin only", 403)
        c = _farm(hass, entry_id)
        layer = c.offline_layer(layer_id) if c else None
        if layer is None or layer.get("status") != "uploading":
            return self.json_message("Picture not found – start again", 404)
        try:
            body = await request.json()
            tiles = body["tiles"]
            if not isinstance(tiles, list) or len(tiles) > 500:
                raise ValueError("bad batch")
            if layer.get("count", 0) + len(tiles) > MAX_LAYER_TILES:
                raise ValueError("Too many tiles – pick a smaller area")
            count, size = await hass.async_add_executor_job(_write_tiles, layer_dir(hass, entry_id, layer_id), tiles)
        except (ValueError, KeyError, TypeError, binascii.Error) as err:
            return self.json_message(str(err), 400)
        except OSError as err:
            _LOGGER.error("Could not save farm picture tiles: %s", err)
            return self.json_message(f"Could not save: {err}", 500)
        c.offline_progress(layer_id, count, size)
        return self.json({"count": layer["count"], "bytes": layer["bytes"]})


class OfflineTileView(HomeAssistantView):
    """GET a tile. Map tiles are plain <img> requests (no login header), so the URL carries a secret token."""

    url = "/api/hamlet_farm/tiles/{token}/{layer_id}/{z}/{x}/{y}"
    name = "api:hamlet_farm:tiles"
    requires_auth = False

    async def get(self, request: web.Request, token: str, layer_id: str, z: str, x: str, y: str) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        c = next((c for c in hass.data.get(DOMAIN, {}).values()
                  if hasattr(c, "tile_token") and c.tile_token == token), None)
        if c is None or c.offline_layer(layer_id) is None:
            return web.Response(status=404)
        try:
            zi, xi, yi = int(z), int(x), int(y.split(".")[0])
        except ValueError:
            return web.Response(status=404)
        hit = await hass.async_add_executor_job(_read_tile, layer_dir(hass, c.entry.entry_id, layer_id), zi, xi, yi)
        headers = {"Cache-Control": "private, max-age=604800, immutable"}
        if hit is None:
            return web.Response(body=EMPTY_PNG, content_type="image/png", headers=headers)
        return web.Response(body=hit[0], content_type=hit[1], headers=headers)
