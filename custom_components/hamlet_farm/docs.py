"""Quotes and documents: the installer uploads, only the people picked can open them, and they can accept or decline a quote."""
from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import TYPE_CHECKING

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import DOMAIN

if TYPE_CHECKING:
    from .controller import FarmController

_LOGGER = logging.getLogger(__name__)
MAX_DOC_BYTES = 15_000_000
DOC_ID = re.compile(r"^[A-Za-z0-9]{8,32}$")
KINDS = {"quote": "Quote", "invoice": "Invoice", "coc": "COC / certificate", "drawing": "Drawing / plan", "other": "Document"}
# file type from its first bytes -> (mime, extension)
MAGIC = (
    (b"%PDF", "application/pdf", "pdf"),
    (b"\xff\xd8\xff", "image/jpeg", "jpg"),
    (b"\x89PNG", "image/png", "png"),
)


def doc_path(hass: HomeAssistant, entry_id: str, doc_id: str) -> Path:
    if not DOC_ID.match(doc_id):
        raise ValueError("bad document id")
    return Path(hass.config.path(DOMAIN, entry_id, "docs", doc_id))


def sniff(data: bytes) -> tuple[str, str] | None:
    for magic, mime, ext in MAGIC:
        if data.startswith(magic):
            return mime, ext
    return None


def can_see(doc: dict, user) -> bool:
    return bool(user and (user.is_admin or user.id in doc.get("users", [])))


def _farm(hass: HomeAssistant, entry_id: str) -> FarmController | None:
    from .controller import FarmController  # noqa: PLC0415

    c = hass.data.get(DOMAIN, {}).get(entry_id)
    return c if isinstance(c, FarmController) else None


class DocFileView(HomeAssistantView):
    """POST (admin) uploads the file of a document; GET downloads it for an admin or someone it is shared with."""

    url = "/api/hamlet_farm/doc/{entry_id}/{doc_id}"
    name = "api:hamlet_farm:doc"
    requires_auth = True

    async def post(self, request: web.Request, entry_id: str, doc_id: str) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        user = request.get("hass_user")
        if user is None or not user.is_admin:
            return self.json_message("Admin only", 403)
        c = _farm(hass, entry_id)
        doc = c.doc(doc_id) if c else None
        if doc is None:
            return self.json_message("Document not found", 404)
        data = await request.read()
        if len(data) > MAX_DOC_BYTES:
            return self.json_message("File too big (15 MB max)", 413)
        kind = sniff(data)
        if kind is None:
            return self.json_message("Only PDF, JPG or PNG files", 400)
        path = doc_path(hass, entry_id, doc_id)

        def write() -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

        try:
            await hass.async_add_executor_job(write)
        except OSError as err:
            return self.json_message(f"Could not save: {err}", 500)
        c.doc_file_saved(doc_id, kind[0], len(data))
        return self.json({"ok": True})

    async def get(self, request: web.Request, entry_id: str, doc_id: str) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        c = _farm(hass, entry_id)
        doc = c.doc(doc_id) if c else None
        if doc is None or not can_see(doc, request.get("hass_user")) or not doc.get("size"):
            return web.Response(status=404)
        path = doc_path(hass, entry_id, doc_id)
        data = await hass.async_add_executor_job(lambda: path.read_bytes() if path.is_file() else None)
        if data is None:
            return web.Response(status=404)
        safe = re.sub(r"[^A-Za-z0-9 ._-]", "", doc.get("filename") or "document")[:80] or "document"
        return web.Response(body=data, content_type=doc.get("mime") or "application/octet-stream",
                            headers={"Content-Disposition": f'inline; filename="{safe}"', "Cache-Control": "no-store"})
