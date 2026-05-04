#!/usr/bin/env python3
"""
Parallel geocoding for missing Turkish districts using Open-Meteo.

Usage examples:
  python scripts/parallel_geocode.py --limit 50 --workers 5 --delay 0.6 --dry-run
  python scripts/parallel_geocode.py --limit 0 --workers 5 --delay 0.6

This script:
- Loads `--data` (default: data/il-ilce-with-loc.json)
- Uses/updates `--cache` (default: data/geocode-cache.json)
- Finds missing district coordinates and queries the geocoding API in parallel
- Respects a per-worker `--delay` between requests
- Saves cache and enriched `--out` file (unless `--dry-run`)

Note: be considerate with `--workers` and `--delay` values to avoid API rate limits.
"""

import argparse
import json
import os
import sys
import time
import urllib.parse
import unicodedata
import threading
import queue

try:
    import requests
    HAVE_REQUESTS = True
except Exception:
    import urllib.request as _urllib
    HAVE_REQUESTS = False


def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def normalize_text(s):
    if not s:
        return ''
    s2 = str(s).strip()
    s2 = s2.replace('İ','I').replace('ı','i').replace('Ç','C').replace('ç','c').replace('Ğ','G').replace('ğ','g').replace('Ö','O').replace('ö','o').replace('Ş','S').replace('ş','s').replace('Ü','U').replace('ü','u')
    s2 = unicodedata.normalize('NFKD', s2)
    s2 = ''.join(c for c in s2 if not unicodedata.combining(c))
    return s2.strip().lower()


def candidate_is_valid(candidate):
    if not candidate:
        return False, 'missing'
    lat = candidate.get('latitude')
    lon = candidate.get('longitude')
    if lat in (None, '') or lon in (None, ''):
        return False, 'missing'
    try:
        latf = float(lat)
        lonf = float(lon)
    except Exception:
        return False, 'not-numeric'
    # approximate Turkey bbox
    if not (35 <= latf <= 43 and 25 <= lonf <= 45):
        return False, 'outside-bbox'
    country = (candidate.get('country') or '').lower()
    if country and ('tur' not in country and 'tr' not in country and 'tür' not in country):
        return False, 'country-mismatch'
    return True, None


def geocode_query(q):
    url = f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(q)}&count=5&language=tr&format=json"
    headers = {'User-Agent': 'weather-app-parallel-geocode/1.0'}
    if HAVE_REQUESTS:
        try:
            resp = requests.get(url, headers=headers, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return {}
    else:
        req = _urllib.Request(url, headers=headers)
        try:
            with _urllib.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except Exception:
            return {}


def worker_loop(tid, q_tasks, cache, cache_lock, results_lock, total, args, updated_count):
    while True:
        try:
            item = q_tasks.get_nowait()
        except queue.Empty:
            return
        province = item['province']
        district = item['district']
        ilce_obj = item['ilce_obj']
        idx = item['idx']

        key_orig = f"{province}|||{district}"
        norm_key = f"{normalize_text(province)}|||{normalize_text(district)}"

        # Check cache lookup by normalized map
        with cache_lock:
            cached_v = cache.get(key_orig)
            if not cached_v:
                # try normalized fallback keys - build mapping once outside would be more efficient
                for ck, cv in list(cache.items()):
                    if normalize_text(ck.split('|||')[0]) == normalize_text(province) and normalize_text(ck.split('|||')[-1]) == normalize_text(district):
                        cached_v = cv
                        break
        if cached_v and cached_v.get('latitude') not in (None, ''):
            # update ilce_obj
            with results_lock:
                ilce_obj['latitude'] = cached_v.get('latitude')
                ilce_obj['longitude'] = cached_v.get('longitude')
                if cached_v.get('name'):
                    ilce_obj['_geocoded_name'] = cached_v.get('name')
                updated_count[0] += 1
            q_tasks.task_done()
            continue

        patterns = [
            f"{district}, {province}, Turkey",
            f"{district} {province} Turkey",
            f"{district}, {province}",
            f"{district} Turkey",
            f"{district}"
        ]

        chosen = None
        chosen_key = None

        for ptn in patterns:
            try:
                res = geocode_query(ptn)
            except Exception:
                res = {}
            if not res or not res.get('results'):
                # print(no candidates)
                # continue
                continue
            candidates = res.get('results', [])
            prov_norm = normalize_text(province or '')
            best = None
            for c in candidates:
                adm1 = c.get('admin1') or ''
                if normalize_text(adm1) == prov_norm:
                    best = c
                    break
            if not best and candidates:
                best = candidates[0]
            if not best:
                continue
            valid, reason = candidate_is_valid(best)
            if not valid:
                # rejected candidate
                continue
            chosen = best
            break

        if chosen:
            with cache_lock:
                cache[key_orig] = {
                    'latitude': chosen.get('latitude'),
                    'longitude': chosen.get('longitude'),
                    'name': chosen.get('name'),
                    'admin1': chosen.get('admin1'),
                    'country': chosen.get('country')
                }
                # persist cache incrementally
                try:
                    save_json(args.cache, cache)
                except Exception:
                    pass
            with results_lock:
                ilce_obj['latitude'] = chosen.get('latitude')
                ilce_obj['longitude'] = chosen.get('longitude')
                if chosen.get('name'):
                    ilce_obj['_geocoded_name'] = chosen.get('name')
                updated_count[0] += 1
            print(f"[{tid}] [{idx}/{total}] -> match: {district} / {province} -> {chosen.get('latitude')},{chosen.get('longitude')}")
        else:
            print(f"[{tid}] [{idx}/{total}] -> no match for: {district} / {province}")

        q_tasks.task_done()
        time.sleep(args.delay)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', default='data/il-ilce-with-loc.json')
    parser.add_argument('--out', default='data/il-ilce-with-loc.json')
    parser.add_argument('--cache', default='data/geocode-cache.json')
    parser.add_argument('--workers', type=int, default=5)
    parser.add_argument('--delay', type=float, default=0.6)
    parser.add_argument('--start', type=int, default=0)
    parser.add_argument('--limit', type=int, default=0)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    if not os.path.exists(args.data):
        print('Data file not found:', args.data, file=sys.stderr)
        sys.exit(1)

    data = load_json(args.data)

    cache = {}
    if os.path.exists(args.cache):
        try:
            cache = load_json(args.cache)
        except Exception:
            cache = {}

    tasks = []
    total = 0
    for prov in data.get('data', []):
        province = prov.get('il_adi') or prov.get('il') or ''
        for ilce in prov.get('ilceler', []):
            total += 1
            lat = ilce.get('latitude')
            lon = ilce.get('longitude')
            if lat in (None, '') or lon in (None, ''):
                tasks.append({'province': province, 'district': ilce.get('ilce_adi') or ilce.get('ilce') or ilce.get('name') or '', 'ilce_obj': ilce})

    if not tasks:
        print('No missing coordinates found. Nothing to do.')
        return

    # slice by start/limit
    start = args.start
    end = None if args.limit == 0 else start + args.limit
    slice_tasks = tasks[start:end]
    total_to_process = len(slice_tasks)
    print(f"Found {len(tasks)} missing entries; processing {total_to_process} (start={start}, limit={args.limit}) with {args.workers} workers and {args.delay}s delay.")

    q_tasks = queue.Queue()
    for idx, t in enumerate(slice_tasks, start=1+start):
        t['idx'] = idx
        q_tasks.put(t)

    cache_lock = threading.Lock()
    results_lock = threading.Lock()
    updated_count = [0]

    threads = []
    for i in range(args.workers):
        th = threading.Thread(target=worker_loop, args=(i+1, q_tasks, cache, cache_lock, results_lock, total_to_process, args, updated_count), daemon=True)
        th.start()
        threads.append(th)

    # wait for queue to empty
    try:
        while any(t.is_alive() for t in threads):
            time.sleep(0.5)
    except KeyboardInterrupt:
        print('Interrupted; saving cache and exiting.')

    # final save
    if not args.dry_run:
        try:
            save_json(args.out, data)
            save_json(args.cache, cache)
        except Exception as e:
            print('Failed to write output files:', e)
    print(json.dumps({'processed': total_to_process, 'filled': updated_count[0], 'remaining': len(tasks) - updated_count[0]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
