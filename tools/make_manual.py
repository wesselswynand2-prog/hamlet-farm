"""Write MANUAL.md (for GitHub) from the in-app manual: custom_components/hamlet_farm/frontend/manual.md."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "custom_components/hamlet_farm/frontend/manual.md"
DOTS = {"run": "🟢", "on": "🔵", "power": "🟡", "off": "⚫", "warn": "🟠", "bad": "🔴", "offline": "◌", "info": "⚪"}


def convert(md: str) -> str:
    md = re.sub(r"\{dot:(\w+)\}", lambda m: DOTS.get(m.group(1), "•"), md)
    md = re.sub(r"\{line:#[0-9a-fA-F]+\}", "▬", md)
    md = re.sub(r"\s*\{icon:mdi:[a-z0-9-]+\}", "", md)
    md = re.sub(r"\s*\{admin\}", " (admin)", md)
    head = "<!-- Generated from custom_components/hamlet_farm/frontend/manual.md by tools/make_manual.py – edit that file. -->\n"
    return head + md


if __name__ == "__main__":
    (ROOT / "MANUAL.md").write_text(convert(SRC.read_text(encoding="utf-8")), encoding="utf-8")
    print("MANUAL.md written")
