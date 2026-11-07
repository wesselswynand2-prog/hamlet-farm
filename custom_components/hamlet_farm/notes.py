"""Notes and photos on map points and lines – the site log technicians keep per pump, pivot or marking."""
from __future__ import annotations

import logging
import re
import secrets
import time
from pathlib import Path
from typing import TYPE_CHECKING

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import DOMAIN

if TYPE_CHECKING:
    from .controller import FarmController

_LOGGER = logging.getLogger(__name__)
MAX_PHOTO_BYTES = 4_000_000
PHOTO_ID = re.compile(r"^[A-Za-z0-9_-]{8,40}$")


def photo_dir(hass: HomeAssistant, entry_id: str) -> Path:
    return Path(hass.config.path(DOMAIN, entry_id, "photos"))


def photo_path(hass: HomeAssistant, entry_id: str, photo_id: str) -> Path:
    if not PHOTO_ID.match(photo_id):
        raise ValueError("bad photo id")
    return photo_dir(hass, entry_id) / f"{photo_id}.jpg"


def delete_photos(hass: HomeAssistant, entry_id: str, ids: list[str]) -> None:
    for pid in ids:
        try:
            photo_path(hass, entry_id, pid).unlink(missing_ok=True)
        except (ValueError, OSError):
            pass


def clean_orphans(hass: HomeAssistant, entry_id: str, keep: set[str]) -> None:
    """Remove photos that were uploaded but never added to a note (older than a day)."""
    d = photo_dir(hass, entry_id)
    if not d.is_dir():
        return
    cutoff = time.time() - 86400
    for f in d.glob("*.jpg"):
        if f.stem not in keep and f.stat().st_mtime < cutoff:
            f.unlink(missing_ok=True)


def _farm(hass: HomeAssistant, entry_id: str) -> FarmController | None:
    from .controller import FarmController  # noqa: PLC0415

    c = hass.data.get(DOMAIN, {}).get(entry_id)
    return c if isinstance(c, FarmController) else None


class PhotoUploadView(HomeAssistantView):
    """POST a JPEG (already shrunk by the browser). Any logged-in user – technicians add photos on site."""

    url = "/api/hamlet_farm/photo/{entry_id}"
    name = "api:hamlet_farm:photo"
    requires_auth = True

    async def post(self, request: web.Request, entry_id: str) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        if _farm(hass, entry_id) is None:
            return self.json_message("Farm not found", 404)
        data = await request.read()
        if len(data) > MAX_PHOTO_BYTES:
            return self.json_message("Photo too big", 413)
        if data[:3] != b"\xff\xd8\xff":
            return self.json_message("Not a JPEG photo", 400)
        pid = secrets.token_urlsafe(12)
        path = photo_path(hass, entry_id, pid)

        def write() -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

        try:
            await hass.async_add_executor_job(write)
        except OSError as err:
            return self.json_message(f"Could not save: {err}", 500)
        return self.json({"photo": pid})


class PhotoView(HomeAssistantView):
    """GET a photo. <img> tags can't send the login header, so the URL carries the farm's secret token."""

    url = "/api/hamlet_farm/photos/{token}/{photo_id}"
    name = "api:hamlet_farm:photos"
    requires_auth = False

    async def get(self, request: web.Request, token: str, photo_id: str) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        c = next((c for c in hass.data.get(DOMAIN, {}).values()
                  if hasattr(c, "tile_token") and c.tile_token == token), None)
        photo_id = photo_id.removesuffix(".jpg")
        if c is None or not c.photo_known(photo_id):
            return web.Response(status=404)
        try:
            path = photo_path(hass, c.entry.entry_id, photo_id)
        except ValueError:
            return web.Response(status=404)
        data = await hass.async_add_executor_job(lambda: path.read_bytes() if path.is_file() else None)
        if data is None:
            return web.Response(status=404)
        return web.Response(body=data, content_type="image/jpeg", headers={"Cache-Control": "private, max-age=2592000, immutable"})
