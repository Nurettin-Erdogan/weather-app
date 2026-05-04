#!/usr/bin/env python3
"""
Merge BuNick Turkey dataset into local data/il-ilce-with-loc.json

Usage: python scripts/merge_bunick.py
"""
import json
import os
import re
import time
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(__file__))
LOCAL_PATH = os.path.join(ROOT, 'data', 'il-ilce-with-loc.json')
EXTERNAL_URL = 'https://raw.githubusercontent.com/BuNickTamYirmiHarfli/turkey-cities-districts-json/main/cities.json'


def normalize(s):
    if not s:
        return ''
    s = str(s).strip().lower()
    trans = {
        'ç': 'c', 'ğ': 'g', 'ı': 'i', 'İ': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a'
    }
    for k, v in trans.items():
        s = s.replace(k, v).replace(k.upper(), v)
    s = re.sub(r'[^a-z0-9]', '', s)
    return s


def fetch_external():
    with urllib.request.urlopen(EXTERNAL_URL) as r:
        data = r.read().decode('utf-8')
        return json.loads(data)


def load_local():
    with open(LOCAL_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def main():
    if not os.path.exists(LOCAL_PATH):
        print('Local file missing:', LOCAL_PATH)
        sys.exit(1)

    bak = LOCAL_PATH + '.bak.' + str(int(time.time()))
    import shutil
    shutil.copyfile(LOCAL_PATH, bak)
    print('Backup written to', bak)

    local = load_local()
    try:
        external = fetch_external()
    except Exception as e:
        print('Failed to fetch external dataset:', e)
        sys.exit(1)

    # Build external map
    ext_map = {}
    for prov in external:
        pname = prov.get('name') or prov.get('il') or ''
        pnorm = normalize(pname)
        towns = prov.get('towns') or []
        town_map = {}
        for t in towns:
            tname = t.get('name') or ''
            town_map[normalize(tname)] = (t.get('latitude'), t.get('longitude'), t)
        ext_map[pnorm] = {
            'province_coord': (prov.get('latitude'), prov.get('longitude')),
            'towns': town_map,
        }

    filled = 0
    total_missing_before = 0

    for prov in local.get('data', []):
        pname = prov.get('il_adi', '')
        pnorm = normalize(pname)
        ext = ext_map.get(pnorm)
        for ilce in prov.get('ilceler', []):
            lat = ilce.get('latitude')
            lon = ilce.get('longitude')
            if lat is None or lon is None or lat == '' or lon == '':
                total_missing_before += 1
                ilce_name = ilce.get('ilce_adi') or ''
                inorm = normalize(ilce_name)
                matched = False
                if ext:
                    # If district is 'Merkez' or equals province name, use province coord
                    if inorm == 'merkez' or inorm == normalize(pname):
                        prov_coord = ext.get('province_coord')
                        if prov_coord and prov_coord[0] is not None:
                            ilce['latitude'] = prov_coord[0]
                            ilce['longitude'] = prov_coord[1]
                            ilce['_merged_from'] = 'bunick:province'
                            filled += 1
                            matched = True
                    if not matched:
                        town = ext['towns'].get(inorm)
                        if town and town[0] is not None:
                            ilce['latitude'] = town[0]
                            ilce['longitude'] = town[1]
                            ilce['_merged_from'] = 'bunick:town'
                            filled += 1
                            matched = True
                        else:
                            # fuzzy match: contains/startswith
                            for tnorm, (tlat, tlon, tobj) in ext['towns'].items():
                                if inorm == tnorm or inorm.startswith(tnorm) or tnorm.startswith(inorm) or inorm in tnorm or tnorm in inorm:
                                    if tlat is not None:
                                        ilce['latitude'] = tlat
                                        ilce['longitude'] = tlon
                                        ilce['_merged_from'] = 'bunick:town-fuzzy'
                                        filled += 1
                                        matched = True
                                        break

    # write back
    with open(LOCAL_PATH, 'w', encoding='utf-8') as f:
        json.dump(local, f, ensure_ascii=False, indent=2)

    total_after_missing = 0
    for prov in local.get('data', []):
        for ilce in prov.get('ilceler', []):
            if ilce.get('latitude') is None or ilce.get('longitude') is None or ilce.get('latitude') == '':
                total_after_missing += 1

    print('filled:', filled, 'missing_before:', total_missing_before, 'remaining_missing:', total_after_missing)
    if total_after_missing > 0:
        print('Some entries remain missing; consider running scripts/parallel_geocode.py to fill them.')


if __name__ == '__main__':
    main()
