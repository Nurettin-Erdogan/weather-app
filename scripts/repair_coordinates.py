#!/usr/bin/env python3
"""Repair and validate district coordinates using exact-name matches only.

The external dataset is used only when both province and district names match
after Turkish-aware normalization. A small override table covers districts
that are absent from that source and were independently verified.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = ROOT / "data" / "il-ilce-with-loc.json"
SOURCE_URL = (
    "https://raw.githubusercontent.com/"
    "BuNickTamYirmiHarfli/turkey-cities-districts-json/main/cities.json"
)

# Verified against OpenStreetMap/Nominatim administrative results on 2026-06-14.
OVERRIDES = {
    ("kocaeli", "darica"): (40.7574799, 29.3840563),
    ("kayseri", "sariz"): (38.4802377, 36.4970264),
    ("bingol", "adakli"): (39.2285335, 40.4826578),
    ("kirklareli", "pinarhisar"): (41.6254954, 27.5157753),
}


def normalize(value: object) -> str:
    text = str(value or "").strip().lower().replace("ı", "i")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]", "", text)


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def fetch_source():
    request = urllib.request.Request(
        SOURCE_URL,
        headers={"User-Agent": "weather-app-coordinate-repair/2.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def build_source_map(source):
    result = {}
    for province in source:
        province_name = normalize(province.get("name"))
        towns = {
            normalize(town.get("name")): (
                town.get("latitude"),
                town.get("longitude"),
            )
            for town in province.get("towns", [])
        }
        result[province_name] = {
            "province": (province.get("latitude"), province.get("longitude")),
            "towns": towns,
        }
    return result


def repair(data, source_map):
    changes = []
    for province in data.get("data", []):
        province_name = province.get("il_adi", "")
        province_key = normalize(province_name)
        source_province = source_map.get(province_key)

        for district in province.get("ilceler", []):
            district_name = district.get("ilce_adi", "")
            district_key = normalize(district_name)
            key = (province_key, district_key)
            coordinates = OVERRIDES.get(key)
            source_name = "nominatim:administrative" if coordinates else ""

            if not coordinates and source_province:
                if district_key == "merkez":
                    coordinates = source_province["province"]
                    source_name = "bunick:province"
                else:
                    coordinates = source_province["towns"].get(district_key)
                    source_name = "bunick:town"

            if not coordinates or coordinates[0] is None or coordinates[1] is None:
                continue

            old = (float(district.get("latitude")), float(district.get("longitude")))
            new = (float(coordinates[0]), float(coordinates[1]))
            if abs(old[0] - new[0]) <= 0.01 and abs(old[1] - new[1]) <= 0.01:
                continue

            district["latitude"], district["longitude"] = new
            district.pop("_geocoded_name", None)
            district["_coordinate_source"] = source_name
            changes.append((province_name, district_name, old, new, source_name))

    return changes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    data = load_json(args.data)
    changes = repair(data, build_source_map(fetch_source()))

    for province, district, old, new, source in changes:
        print(f"{province} / {district}: {old} -> {new} ({source})")

    print(json.dumps({"changes": len(changes), "applied": args.apply}))
    if args.apply:
        args.data.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
