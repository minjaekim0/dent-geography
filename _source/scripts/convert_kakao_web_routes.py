"""Convert only observed public Kakao route coordinates through the official API."""
import json
import math
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from reconcile_kakao_locations import ROOT, api_key, save_json, valid_point

ENDPOINT = 'https://dapi.kakao.com/v2/local/geo/transcoord.json'
FOLDER = ROOT / 'data/processed/kakao-reconciliation/current/web-review-2026-11-06'


def route_input(route):
    url = urllib.parse.urlparse(route['routeUrl'])
    query = urllib.parse.parse_qs(url.query)
    if url.scheme != 'https' or url.netloc != 'map.kakao.com' or query.get('rtIds', [''])[0].split(',')[-1] != route['placeId']:
        raise ValueError('Public route identity mismatch')
    xy = query.get('rt', [''])[0].split(',')[-2:]
    if len(xy) != 2:
        raise ValueError('Public route has no destination coordinates')
    x, y = map(float, xy)
    if not all(math.isfinite(v) for v in [x, y]) or [x, y] != [route['inputX'], route['inputY']]:
        raise ValueError('Public route coordinate mismatch')
    return {'x': x, 'y': y, 'input_coord': 'WCONGNAMUL', 'output_coord': 'WGS84'}


def convert(route, key, folder, before_request=lambda: None):
    params = route_input(route)
    target = folder / (route['placeId'] + '.json')
    if target.exists():
        old = json.loads(target.read_text())
        if old['endpoint'] != ENDPOINT or old['input'] != params:
            raise ValueError('Coordinate conversion cache mismatch')
        return old
    req = urllib.request.Request(ENDPOINT + '?' + urllib.parse.urlencode(params), headers={'Authorization': 'KakaoAK ' + key})
    for attempt in range(3):
        before_request()
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                body = response.read()
            if key.encode() in body:
                raise ValueError('Credential echoed')
            result = json.loads(body)
            point = result['documents'][0]
            if not valid_point(point['x'], point['y']):
                raise ValueError('Invalid converted point')
            break
        except Exception:
            if attempt == 2:
                raise RuntimeError('Official coordinate conversion failed; response suppressed') from None
            time.sleep(.5 * (attempt + 1))
    exported = {'endpoint': ENDPOINT, 'input': params, 'response': {'meta': {'total_count': 1}, 'documents': [{'x': point['x'], 'y': point['y']}]}}
    save_json(target, exported)
    return exported


def main(folder=FOLDER):
    routes = {r['placeId']: r for r in map(json.loads, (folder / 'routes.jsonl').read_text().splitlines())}
    output = folder / 'coordinate-transforms'
    output.mkdir(exist_ok=True)
    key = api_key()
    if not key:
        raise RuntimeError('API key is not configured')
    lock = threading.Lock()
    previous = [0.0]
    def throttle():
        with lock:
            time.sleep(max(0, previous[0] + .15 - time.monotonic()))
            previous[0] = time.monotonic()
    failures = []
    def task(route):
        try:
            convert(route, key, output, throttle)
        except (RuntimeError, ValueError) as error:
            failures.append({'placeId': route['placeId'], 'name': route['document']['place_name'], 'error': str(error)})
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(task, routes.values()))
    save_json(folder / 'conversion-errors.json', failures)
    print(json.dumps({'routePlaces': len(routes), 'converted': len(list(output.glob('*.json'))), 'failed': len(failures)}))
    return bool(failures)


if __name__ == '__main__':
    raise SystemExit(main())
