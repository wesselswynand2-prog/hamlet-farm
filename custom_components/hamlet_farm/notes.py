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
MAX_FILE_BYTES = 15_000_000
PHOTO_ID = re.compile(r"^[A-Za-z0-9_-]{8,40}$")
FILE_TYPES = ((b"%PDF", "application/pdf"), (b"\xff\xd8\xff", "image/jpeg"), (b"\x89PNG", "image/png"))


def file_path(hass: HomeAssistant, entry_id: str, file_id: str) -> Path:
    if not PHOTO_ID.match(file_id):
        raise ValueError("bad file id")
    return Path(hass.config.path(DOMAIN, entry_id, "files", file_id))


def delete_files(hass: HomeAssistant, entry_id: str, ids: list[str]) -> None:
    for fid in ids:
        try:
            file_path(hass, entry_id, fid).unlink(missing_ok=True)
        except (ValueError, OSError):
            pass


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
    """Remove photos / files that were uploaded but never added to a note (older than a day)."""
    cutoff = time.time() - 86400
    for d, pattern in ((photo_dir(hass, entry_id), "*.jpg"), (Path(hass.config.path(DOMAIN, entry_id, "files")), "*")):
        if not d.is_dir():
            continue
        for f in d.glob(pattern):
            if f.stem not in keep and f.name not in keep and f.stat().st_mtime < cutoff:
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


class FileView(HomeAssistantView):
    """Site-log attachments (PDF / JPG / PNG). POST: any logged-in user. GET: any logged-in user, for files in a note."""

    url = "/api/hamlet_farm/file/{entry_id}/{file_id}"
    name = "api:hamlet_farm:file"
    requires_auth = True

    async def post(self, request: web.Request, entry_id: str, file_id: str) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        if _farm(hass, entry_id) is None or file_id != "new":
            return self.json_message("Not found", 404)
        data = await request.read()
        if len(data) > MAX_FILE_BYTES:
            return self.json_message("File too big (15 MB max)", 413)
        mime = next((m for magic, m in FILE_TYPES if data.startswith(magic)), None)
        if mime is None:
            return self.json_message("Only PDF, JPG or PNG files", 400)
        fid = secrets.token_urlsafe(12)
        path = file_path(hass, entry_id, fid)

        def write() -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

        try:
            await hass.async_add_executor_job(write)
        except OSError as err:
            return self.json_message(f"Could not save: {err}", 500)
        return self.json({"file": fid, "mime": mime, "size": len(data)})

    async def get(self, request: web.Request, entry_id: str, file_id: str) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        c = _farm(hass, entry_id)
        meta = c.file_meta(file_id) if c else None
        if meta is None:
            return web.Response(status=404)
        try:
            path = file_path(hass, entry_id, file_id)
        except ValueError:
            return web.Response(status=404)
        data = await hass.async_add_executor_job(lambda: path.read_bytes() if path.is_file() else None)
        if data is None:
            return web.Response(status=404)
        safe = re.sub(r"[^A-Za-z0-9 ._-]", "", meta.get("file_name") or "file")[:80] or "file"
        return web.Response(body=data, content_type=meta.get("file_mime") or "application/octet-stream",
                            headers={"Content-Disposition": f'inline; filename="{safe}"', "Cache-Control": "private, max-age=86400"})
