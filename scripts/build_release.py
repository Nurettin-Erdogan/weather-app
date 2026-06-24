#!/usr/bin/env python3
"""Build a clean, self-contained static release under dist/."""

from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
APP_DIR = DIST / "weather-app"
ZIP_PATH = DIST / "weather-app-release.zip"

FILES = [
    "index.html",
    "style.css",
    "app.js",
    "favicon.svg",
    "manifest.webmanifest",
    "service-worker.js",
    "README.md",
    "LICENSE",
    "QUICKSTART.md",
    "run-local.bat",
    "run-local.sh",
    "launch-local.bat",
    "data/il-ilce-with-loc.json",
    "icons/icon.svg",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "js/api.js",
    "js/chart.js",
    "js/i18n.js",
    "js/search.js",
    "js/storage.js",
    "js/utils.js",
    "js/weather-alerts.js",
    "js/weather-codes.js",
]


def validate_data():
    payload = json.loads((ROOT / "data/il-ilce-with-loc.json").read_text(encoding="utf-8"))
    provinces = payload.get("data", [])
    if len(provinces) != 81:
        raise RuntimeError(f"Expected 81 provinces, found {len(provinces)}")
    districts = [district for province in provinces for district in province.get("ilceler", [])]
    if len(districts) != 973:
        raise RuntimeError(f"Expected 973 districts, found {len(districts)}")
    unnamed = [district for district in districts if not str(district.get("ilce_adi", "")).strip()]
    if unnamed:
        raise RuntimeError(f"Found {len(unnamed)} districts without a name")
    invalid = [
        district
        for district in districts
        if not (
            35 <= float(district["latitude"]) <= 43
            and 25 <= float(district["longitude"]) <= 45
        )
    ]
    if invalid:
        raise RuntimeError(f"Found {len(invalid)} coordinates outside Türkiye")
    coordinates = [
        (float(district["latitude"]), float(district["longitude"]))
        for district in districts
    ]
    if len(set(coordinates)) != len(coordinates):
        raise RuntimeError("Found duplicate district coordinates")


def main():
    validate_data()
    missing = [path for path in FILES if not (ROOT / path).is_file()]
    if missing:
        raise RuntimeError(f"Missing release files: {', '.join(missing)}")

    if APP_DIR.exists():
        resolved = APP_DIR.resolve()
        if DIST.resolve() not in resolved.parents:
            raise RuntimeError(f"Refusing to remove unexpected path: {resolved}")
        shutil.rmtree(APP_DIR)
    APP_DIR.mkdir(parents=True, exist_ok=True)

    for relative in FILES:
        source = ROOT / relative
        destination = APP_DIR / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)

    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(APP_DIR.rglob("*")):
            if path.is_file():
                archive.write(path, Path("weather-app") / path.relative_to(APP_DIR))

    print(f"Release directory: {APP_DIR}")
    print(f"Release archive: {ZIP_PATH} ({ZIP_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
