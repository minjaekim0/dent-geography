"""Match current HIRA dental facilities to Kakao places without changing source DB."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import re
import sqlite3
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json'
VERSION = 1
MATCHING_VERSION = 5


def compact(value):
    return re.sub(r'[^가-힣a-z0-9]', '', unicodedata.normalize('NFKC', value or '').casefold())


def dental_name(value):
    """Allow the optional clinic suffix while preserving brand and branch names."""
    return re.sub(r'치과의원$', '치과', compact(value))


def building(value):
    """Conservative road-address building key; no fuzzy or substring matching."""
    text = unicodedata.normalize('NFKC', value or '').strip()
    aliases = {'서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구',
               '인천광역시': '인천', '광주광역시': '광주', '대전광역시': '대전',
               '울산광역시': '울산', '세종특별자치시': '세종', '경기도': '경기',
               '강원특별자치도': '강원', '강원도': '강원', '충청북도': '충북',
               '충청남도': '충남', '전북특별자치도': '전북', '전라북도': '전북',
               '전라남도': '전남', '경상북도': '경북', '경상남도': '경남',
               '제주특별자치도': '제주'}
    parts = text.split()
    if parts:
        parts[0] = aliases.get(parts[0], parts[0])
    text = ' '.join(parts)
    # Keep province, municipality, road and exact main/sub building number.
    match = re.match(r'^(.+?(?:대로|로|길))\s+(\d+(?:-\d+)?)(?=$|[\s,(])', text)
    return compact(match.group(1)) + ':' + match.group(2) if match else None


def valid_point(lon, lat):
    try:
        return math.isfinite(float(lon)) and math.isfinite(float(lat)) and 124 <= float(lon) <= 132 and 33 <= float(lat) <= 39.5
    except (ValueError, TypeError):
        return False


def distance(a, b):
    if not valid_point(a[0], a[1]) or not valid_point(b[0], b[1]):
        return None
    lon1, lat1, lon2, lat2 = map(math.radians, map(float, (*a, *b)))
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return round(6371000 * 2 * math.asin(min(1, math.sqrt(h))), 1)


def locality(address):
    """Compare municipality context without requiring the same street/building."""
    parts = (address or '').split()
    if len(parts) < 2:
        return None
    province = {'서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구',
                '인천광역시': '인천', '광주광역시': '광주', '대전광역시': '대전',
                '울산광역시': '울산', '세종특별자치시': '세종', '경기도': '경기',
                '강원도': '강원', '강원특별자치도': '강원', '충청북도': '충북',
                '충청남도': '충남', '전라북도': '전북', '전북특별자치도': '전북',
                '전라남도': '전남', '경상북도': '경북', '경상남도': '경남',
                '제주특별자치도': '제주'}.get(parts[0], parts[0])
    if province == '세종':
        return (province,)
    if not parts[1].endswith(('시', '군', '구')):
        return None
    municipality = parts[1:3] if len(parts) > 2 and parts[1].endswith('시') and parts[2].endswith('구') else parts[1:2]
    return (province, *municipality)


def compatible_locality(first, second):
    a, b = locality(first), locality(second)
    if not a or not b:
        return False
    if a == b:
        return True
    # Old Seo-gu overlaps both successors, but the successors are NOT aliases
    # for each other. This relationship is used for clinic identity only.
    transitions = {'서구': {'서해구', '검단구'}, '동구': {'제물포구'}, '중구': {'제물포구', '영종구'}}
    return (a[0] == b[0] == '인천' and len(a) == len(b) == 2 and
            (b[1] in transitions.get(a[1], set()) or a[1] in transitions.get(b[1], set())))


def street_building(value):
    m = re.search(r'([가-힣a-zA-Z0-9·.]+(?:대로|로|길))\s+(\d+(?:-\d+)?)(?=$|[\s,(])', value or '')
    return (compact(m.group(1)), m.group(2)) if m else None


def same_building_address(first, second):
    original = building(first)
    if original and original == building(second):
        return True
    a, b = locality(first), locality(second)
    # The same road/building within one city is stronger evidence than an
    # outdated ward label, including ward-boundary adjustments in nested cities.
    same_city = bool(a and b and len(a) > 1 and len(b) > 1 and a[0] == b[0] and a[1] == b[1] and a[1].endswith('시'))
    if not compatible_locality(first, second) and not same_city:
        return False
    # Keep the road and full building number while allowing the gu name to
    # change under the explicitly supported split above.
    a, b = street_building(first), street_building(second)
    return bool(a and a == b)


LETTER_NAMES = dict(zip('abcdefghijklmnopqrstuvwxyz',
    ['에이','비','씨','디','이','에프','지','에이치','아이','제이','케이','엘','엠','엔','오','피','큐','알','에스','티','유','브이','더블유','엑스','와이','제트']))
SPOKEN_WORDS = {'the':'더', 'dr':'닥터', 'one':'원', 'rapha':'라파', 'lim':'림',
                'top':'탑', 'sky':'스카이', 'smile':'스마일', 'white':'화이트', 'best':'베스트',
                'plus':'플러스', 'good':'굿', 'new':'뉴', 'line':'라인', 'star':'스타', 'smart':'스마트',
                'happy':'해피', 'dream':'드림', 'clear':'클리어', 'dental':'덴탈'}


def spoken_names(value):
    text = unicodedata.normalize('NFKC', value or '').casefold()
    def letters(m):
        return ''.join(LETTER_NAMES[c] for c in m.group())
    # Drop a parenthetical spelling only when it actually repeats its prefix.
    # Thus 에스(S) is redundant, while a branch marker such as 강남(A) survives.
    def bilingual(m):
        body, prefix = m.group(1), text[:m.start()]
        latin = compact(body)
        if latin and re.fullmatch('[a-z]+', latin):
            pronunciations = {''.join(LETTER_NAMES[c] for c in latin), SPOKEN_WORDS.get(latin, '')} - {''}
            if any(compact(prefix).endswith(p) for p in pronunciations):
                return ''
        previous = re.search('[a-z]+$', prefix)
        if previous:
            latin = previous.group()
            if compact(body) in {''.join(LETTER_NAMES[c] for c in latin), SPOKEN_WORDS.get(latin, '')}:
                return ''
        return m.group()
    text = re.sub(r'\(([^()]*)\)', bilingual, text)
    text = text.replace('&', '앤').replace("'s", '스').replace('`s', '스')
    return {re.sub('[a-z]+', letters, text),
            re.sub('[a-z]+', lambda m: SPOKEN_WORDS.get(m.group(), letters(m)), text)}


def name_match_evidence(first, second, first_address='', second_address='', same_building=False):
    if dental_name(first) and dental_name(first) == dental_name(second):
        return 'normalized_exact'
    if (same_building or compatible_locality(first_address, second_address)) and re.search('[a-zA-Z]', (first or '') + (second or '')):
        for a in spoken_names(first):
            for b in spoken_names(second):
                if name_match_evidence(a, b, first_address, second_address, same_building):
                    return 'phonetic_or_bilingual_name'
    regions = set()
    for address in (first_address, second_address):
        area = locality(address)
        if area and len(area[0]) >= 2:
            regions.add(compact(area[0]))
        for stem in re.findall(r'(?<![가-힣])([가-힣0-9]+?)(?:특별자치시|광역시|시|군|구|읍|면|동)(?=[\s,()·]|$)', address or ''):
            if len(stem) >= 2:
                regions.add(compact(stem))
    for name in (first, second):
        for word in re.findall(r'[가-힣a-zA-Z0-9]+', name or ''):
            if '치과' not in word and word not in ('의원', '병원') and len(word.removesuffix('점')) >= 2:
                word = compact(word.removesuffix('점'))
                if not any(region in word for region in regions):
                    regions.add(word)
    def parts(value):
        name = compact(value).replace('치과의원', '치과')
        if name.count('치과') != 1:
            return None
        head, tail = name.split('치과')
        if not head or (tail and not tail.endswith('점') and tail not in regions):
            return None
        return head, tail.removesuffix('점')
    a, b = parts(first), parts(second)
    if not a or not b:
        return None
    # Explicit branch names on both sides are retained, never erased.
    keys = regions | {p[1] for p in (a, b) if len(p[1]) >= 2}
    def tokens(parts):
        if not keys:
            return Counter([parts[0] + parts[1]])
        pattern = '(' + '|'.join(re.escape(k) for k in sorted(keys, key=lambda s: (-len(s), s))) + ')'
        return Counter(piece for piece in re.split(pattern, parts[0] + parts[1]) if piece)
    if tokens(a) == tokens(b):
        return 'reordered_location_branch'
    if same_building and a[0] == b[0] and bool(a[1]) != bool(b[1]):
        return 'optional_branch_same_building'
    return None


def name_strength(match):
    return {'normalized_exact': 3, 'reordered_location_branch': 2,
            'phonetic_or_bilingual_name': 2, 'optional_branch_same_building': 1}.get(match.get('nameEvidence'), 0)


def identity_strength(match):
    return (name_strength(match), not match.get('categoryCorroboratedByNameAndAddress', False),
            match.get('literalNameAgrees', False), match.get('telephoneAgrees', False))


def dental_place(document, same_building=False):
    category = document.get('category_name', '')
    name = document.get('place_name', '')
    if any(word in category + ' ' + name for word in ('주차장', '기공소', '기공실', '의료기기', '의료용품', '연구소', '치과재료')):
        return False
    medical = '의료' in category or category in {'의원', '병원', '치과의원', '치과병원', '종합병원', '대학병원'}
    return '치과' in category or (same_building and '치과' in name and medical)


def decide(facility, documents, truncated=False):
    candidates = {str(d['id']): d for d in documents if d.get('id')}
    matches = []
    for place_id, d in candidates.items():
        if not valid_point(d.get('x'), d.get('y')):
            continue
        # Telephone agreement is diagnostic only, per the user's preference.
        hira_phone = re.sub(r'\D', '', facility.get('phone') or '')
        kakao_phone = re.sub(r'\D', '', d.get('phone') or '')
        selected_address = d.get('road_address_name') or d.get('address_name') or ''
        same_building = same_building_address(facility['address'], d.get('road_address_name'))
        same_locality = compatible_locality(facility['address'], selected_address)
        if not dental_place(d, same_building):
            continue
        name_evidence = name_match_evidence(facility['name'], d.get('place_name'), facility['address'], selected_address, same_building)
        if not name_evidence:
            continue
        if not same_building and not same_locality:
            continue
        matches.append({'placeId': place_id, 'longitude': float(d['x']), 'latitude': float(d['y']),
                        'placeName': d['place_name'], 'roadAddress': d.get('road_address_name'),
                        'selectedAddress': selected_address, 'sameBuilding': same_building,
                        'sameLocality': same_locality, 'addressPriorityApplied': not same_building,
                        'nameEvidence': name_evidence,
                        'literalNameAgrees': compact(facility['name']) == compact(d['place_name']),
                        'administrativeTransition': locality(facility['address']) != locality(selected_address),
                        'categoryCorroboratedByNameAndAddress': '치과' not in d.get('category_name', ''),
                        'placeUrl': d.get('place_url'),
                        'evidence': ('exact_name_and_road_building' if compact(facility['name']) == compact(d.get('place_name'))
                                     else 'optional_clinic_suffix_and_road_building') if same_building and name_evidence == 'normalized_exact'
                                    else 'name_order_or_branch_and_road_building' if same_building
                                    else 'unique_name_in_municipality_kakao_address_priority',
                        'telephoneAgrees': bool(hira_phone and hira_phone == kakao_phone)})
    # Exact building matches disambiguate common names. Otherwise accept one
    # normalized-name candidate in the same municipality, using its Kakao address.
    exact = [match for match in matches if match['sameBuilding']]
    if exact:
        matches = exact
    if matches:
        best = max(identity_strength(match) for match in matches)
        matches = [match for match in matches if identity_strength(match) == best]
    duplicate_ids = []
    if len(matches) > 1 and all(match['sameBuilding'] for match in matches):
        places = [candidates[match['placeId']] for match in matches]
        phones = {re.sub(r'\D', '', p.get('phone') or '') for p in places} - {''}
        first = matches[0]
        equivalent = all(name_match_evidence(first['placeName'], m['placeName'], first['selectedAddress'], m['selectedAddress'], True)
                         and distance((first['longitude'], first['latitude']), (m['longitude'], m['latitude'])) <= 30 for m in matches)
        if equivalent and len(phones) <= 1:
            duplicate_ids = sorted(m['placeId'] for m in matches)
            matches = [min(matches, key=lambda m: (len(m['placeId']), m['placeId']))]
    result = {'status': 'no_unique_match', 'candidateCount': len(candidates)}
    if truncated and not exact:
        result['status'] = 'truncated_review'
    elif len(matches) > 1:
        result['status'] = 'ambiguous_review'
    elif len(matches) == 1:
        result.update(status='matched', match=matches[0])
        if duplicate_ids:
            result['duplicateListingsCollapsed'] = duplicate_ids
        result['searchLimited'] = truncated
        result['coordinateDifferenceM'] = distance((facility['longitude'], facility['latitude']),
                                                  (matches[0]['longitude'], matches[0]['latitude']))
        result['largeDifferenceReview'] = result['coordinateDifferenceM'] is not None and result['coordinateDifferenceM'] > 100
    return result


def reject_reused_places(results):
    linked = defaultdict(list)
    for result in results:
        if result['status'] == 'matched':
            linked[result['match']['placeId']].append(result)
    for group in linked.values():
        if len(group) > 1:
            score = lambda result: (bool(result['match'].get('sameBuilding')), *identity_strength(result['match']))
            best = max(score(result) for result in group)
            strongest = [result for result in group if score(result) == best]
            winner = strongest[0] if len(strongest) == 1 else None
            for result in group:
                if result is not winner:
                    result['status'] = 'place_reused_review'


def selected_point(facility, result):
    if result['status'] == 'matched':
        m = result['match']
        return [m['longitude'], m['latitude']], 'kakao'
    if valid_point(facility['longitude'], facility['latitude']):
        return [facility['longitude'], facility['latitude']], 'hira_unverified'
    return None, 'unlocated'


def load_facilities(db):
    con = sqlite3.connect(f'file:{db.resolve()}?mode=ro', uri=True)
    con.row_factory = sqlite3.Row
    try:
        as_of = con.execute("SELECT max(observed_at) FROM raw_files WHERE source LIKE 'hira_snapshot_%'").fetchone()[0]
        if not as_of:
            raise ValueError('No HIRA snapshot available')
        rows = con.execute("""SELECT facility_key, name, address, latitude, longitude, raw_json
            FROM facilities WHERE last_seen=? AND status='OPEN'
            AND facility_type IN ('DENTAL_CLINIC','DENTAL_HOSPITAL') ORDER BY facility_key""", (as_of,)).fetchall()
        facilities = []
        for row in rows:
            item = dict(row)
            raw = json.loads(item.pop('raw_json'))
            item['phone'] = raw.get('전화번호', '')
            item['kind'] = raw.get('종별코드명', '')
            facilities.append(item)
        return as_of, facilities
    finally:
        con.close()


def api_key():
    values = {}
    path = ROOT / '.env'
    if path.exists():
        for line in path.read_text().splitlines():
            name, sep, value = line.strip().removeprefix('export ').partition('=')
            if sep and name == 'KAKAO_REST_API_KEY':
                values[name] = value.strip().strip('\"\'')
    return os.environ.get('KAKAO_REST_API_KEY') or values.get('KAKAO_REST_API_KEY')


def request_page(query, page, key, timeout):
    params = {'query': query, 'page': page, 'size': 15}
    req = urllib.request.Request(ENDPOINT + '?' + urllib.parse.urlencode(params),
                                 headers={'Authorization': 'KakaoAK ' + key})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            body = response.read()
        if key.encode() in body:
            raise RuntimeError('Credential echoed by server; response discarded')
        data = json.loads(body)
        if not isinstance(data.get('documents'), list) or not isinstance(data.get('meta'), dict):
            raise ValueError('Unexpected response')
        return data
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f'Kakao HTTP {exc.code}; stopped, response suppressed') from None
    except Exception:
        raise RuntimeError('Kakao request failed; stopped, response suppressed') from None


def save_json(path, value):
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    temp.replace(path)


def place_evidence(facility, response):
    """Keep REST responses intact; accept separately reviewed public-map evidence."""
    documents = list(response['documents'])
    observed = response['queriedAt']
    for evidence in response.get('verifiedSupplements', []):
        d = evidence['document']
        place_id = str(d['id'])
        if evidence['source'] != 'kakao_map_public_ui' or evidence['facilityKey'] != facility['facility_key']:
            raise ValueError('Supplement identity mismatch')
        if evidence['detailUrl'] != f'https://place.map.kakao.com/{place_id}' or d['place_url'] != evidence['detailUrl']:
            raise ValueError('Supplement place URL mismatch')
        route = urllib.parse.urlparse(evidence['routeUrl'])
        query = urllib.parse.parse_qs(route.query)
        transform = evidence['transform']
        raw = transform['input']
        if (route.scheme != 'https' or route.netloc != 'map.kakao.com'
                or query.get('rtIds', [''])[0].split(',')[-1] != place_id
                or transform['endpoint'] != 'https://dapi.kakao.com/v2/local/geo/transcoord.json'
                or raw['input_coord'] != 'WCONGNAMUL' or raw['output_coord'] != 'WGS84'):
            raise ValueError('Supplement coordinate provenance mismatch')
        xy = query['rt'][0].split(',')[-2:]
        converted = transform['response']['documents'][0]
        if (not all(math.isclose(float(a), float(b), abs_tol=1e-7) for a, b in zip(xy, [raw['x'], raw['y']]))
                or [float(d['x']), float(d['y'])] != [converted['x'], converted['y']]
                or not valid_point(d['x'], d['y'])):
            raise ValueError('Supplement coordinates mismatch')
        documents.append(d)
        observed = max(observed, evidence['verifiedAt'])
    return documents, observed


def collect_one(f, key, folder, budget, delay, timeout):
    # No radius anchored to HIRA coordinates: those coordinates are being checked.
    locality = ' '.join((f['address'] or '').split()[:2])
    query = f"{locality} {f['name']}"
    fingerprint = hashlib.sha256(json.dumps([VERSION, f, query], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    path = folder / (fingerprint + '.json')
    if path.exists():
        cached = json.loads(path.read_text())
        if cached.get('fingerprint') != fingerprint:
            raise RuntimeError('Cache identity mismatch')
        documents, observed = place_evidence(f, cached)
        return decide(f, documents, cached['truncated']), observed
    documents = []
    observed = datetime.now(timezone.utc).isoformat()
    truncated = False
    # Complete all exposed pages. Do not cache a partial result when budget stops.
    for page in range(1, 4):
        with budget.get('lock', threading.Lock()):
            if budget.get('stopped'):
                raise RuntimeError(budget['stopped'])
            if budget['remaining'] <= 0:
                raise RuntimeError('Request budget exhausted; resume the same output folder')
            if budget['used']:
                time.sleep(delay)
            budget['remaining'] -= 1
            budget['used'] += 1
        data = request_page(query, page, key, timeout)
        documents.extend(data['documents'])
        meta = data['meta']
        truncated = meta.get('total_count', 0) > meta.get('pageable_count', 0)
        if meta.get('is_end'):
            break
    else:
        truncated = True
    # Keep only the documented place fields; credentials are never persisted.
    fields = ('id', 'place_name', 'category_name', 'road_address_name', 'address_name', 'phone', 'x', 'y', 'place_url')
    documents = [{k: d[k] for k in fields if k in d} for d in documents]
    save_json(path, {'fingerprint': fingerprint, 'query': query, 'queriedAt': observed,
                     'documents': documents, 'truncated': truncated})
    return decide(f, documents, truncated), observed


def run(args):
    as_of, facilities = load_facilities(args.db)
    digest = hashlib.sha256(json.dumps(facilities, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    manifest = {'version': VERSION, 'hiraAsOf': as_of, 'inputSha256': digest,
                'matchingVersion': MATCHING_VERSION, 'telephoneRequired': False,
                'nameNormalization': 'clinic_suffix_location_word_order_optional_same_building_branch',
                'administrativeTransitions': {'인천 서구': ['인천 서해구', '인천 검단구'], '인천 동구': ['인천 제물포구'], '인천 중구': ['인천 제물포구', '인천 영종구']},
                'addressPriority': 'kakao_after_unique_identity_match',
                'facilities': len(facilities), 'priority': ['kakao_matched', 'hira_unverified'],
                'endpoint': ENDPOINT, 'mode': 'collect' if args.collect else 'prepare',
                'nationalCompletenessVerified': False}
    manifest_path = out / 'manifest.json'
    if manifest_path.exists():
        old = json.loads(manifest_path.read_text())
        if old['inputSha256'] != digest or old['version'] != VERSION:
            raise ValueError('Inputs changed; use a new output directory')
        if old.get('mode') == 'collect' and not args.collect:
            raise ValueError('Existing collection output; use --collect to resume or a different --output for preparation')
    save_json(manifest_path, manifest)
    save_json(out / 'input.json', facilities)
    key = api_key() if args.collect else None
    budget = {'remaining': args.max_requests, 'used': 0, 'lock': threading.Lock()}
    cache = out / 'responses'
    cache.mkdir(exist_ok=True)
    results = [dict(status='not_queried', facilityKey=f['facility_key'], queriedAt=None) for f in facilities]
    stopped = None
    if args.collect and not key:
        stopped = 'KAKAO_REST_API_KEY is not configured'
    if args.collect and not stopped:
        def task(index):
            f = facilities[index]
            try:
                result, observed = collect_one(f, key, cache, budget, args.delay, args.timeout)
                return index, dict(result, facilityKey=f['facility_key'], queriedAt=observed)
            except RuntimeError as exc:
                with budget['lock']:
                    budget.setdefault('stopped', str(exc))
                return index, results[index]
        with ThreadPoolExecutor(max_workers=getattr(args, 'workers', 1)) as executor:
            futures = [executor.submit(task, index) for index in range(len(facilities))]
            for count, future in enumerate(as_completed(futures), 1):
                index, result = future.result()
                results[index] = result
                if count % 500 == 0 and not budget.get('stopped'):
                    print(json.dumps({'processed': count, 'total': len(facilities), 'requests': budget['used']}), flush=True)
        stopped = budget.get('stopped')
    reject_reused_places(results)
    features = []
    sources = Counter()
    for f, result in zip(facilities, results):
        coords, source = selected_point(f, result)
        selected_address = result['match']['selectedAddress'] if source == 'kakao' else f['address']
        sources[source] += 1
        features.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': coords} if coords else None,
                         'properties': {'facilityKey': f['facility_key'], 'name': f['name'], 'address': selected_address,
                                        'hiraAddress': f['address'], 'addressSource': 'kakao' if source == 'kakao' else 'hira',
                                        'addressPriorityApplied': result.get('match', {}).get('addressPriorityApplied', False) if source == 'kakao' else False,
                                        'kind': f['kind'], 'hiraAsOf': as_of, 'coordinateSource': source,
                                        'matchStatus': result['status'], 'kakaoQueriedAt': result['queriedAt'],
                                        'kakaoName': result.get('match', {}).get('placeName') if source == 'kakao' else None,
                                        'kakaoPlaceUrl': result.get('match', {}).get('placeUrl'),
                                        'coordinateDifferenceM': result.get('coordinateDifferenceM'),
                                        'largeDifferenceReview': result.get('largeDifferenceReview', False),
                                        'physicalLocationVerified': False}})
    summary = {'facilities': len(facilities), 'hiraAsOf': as_of, 'requestsThisRun': budget['used'],
               'matchingVersion': MATCHING_VERSION,
               'statuses': dict(Counter(r['status'] for r in results)), 'coordinateSources': dict(sources),
               'largeCoordinateDifferences': sum(r['status'] == 'matched' and r.get('largeDifferenceReview', False) for r in results),
               'noSearchResults': sum(r.get('candidateCount') == 0 for r in results),
               'kakaoAddressPriorityMatches': sum(r['status'] == 'matched' and r['match']['addressPriorityApplied'] for r in results),
               'reorderedOrBranchMatches': sum(r['status'] == 'matched' and r['match']['nameEvidence'] != 'normalized_exact' for r in results),
               'administrativeTransitionMatches': sum(r['status'] == 'matched' and r['match']['administrativeTransition'] for r in results),
               'phoneticMatches': sum(r['status'] == 'matched' and r['match']['nameEvidence'] == 'phonetic_or_bilingual_name' for r in results),
               'categoryCorroboratedMatches': sum(r['status'] == 'matched' and r['match']['categoryCorroboratedByNameAndAddress'] for r in results),
               'limitedSearchExactAddressMatches': sum(r['status'] == 'matched' and r.get('searchLimited', False) for r in results),
               'duplicateListingMatches': sum(r['status'] == 'matched' and bool(r.get('duplicateListingsCollapsed')) for r in results),
               'stopped': stopped, 'complete': all(r['status'] != 'not_queried' for r in results),
               'nationalCompletenessVerified': False}
    save_json(out / 'audit.json', results)
    save_json(out / 'current-clinics.geojson', {'type': 'FeatureCollection', 'features': features})
    with (out / 'review.csv').open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.writer(handle)
        status_labels = {'matched': '자동 연결', 'no_unique_match': '연결 보류',
                         'truncated_review': '검색 결과 제한 검토', 'ambiguous_review': '복수 후보 검토',
                         'place_reused_review': '기관 간 장소 중복 검토', 'not_queried': '미조회'}
        source_labels = {'kakao': '카카오', 'hira_unverified': '심평원(미검증)', 'unlocated': '좌표 없음'}
        writer.writerow(['기관명', '심평원 주소', '선택 주소', '주소 출처', '주소 차이 카카오 우선', '연결 상태', '좌표 출처', '심평원 경도', '심평원 위도',
                         '선택 경도', '선택 위도', '좌표 차이(m)', '100m 초과 검토', '카카오 장소', '조회일'])
        for f, result, feature in zip(facilities, results, features):
            coords = feature['geometry']['coordinates'] if feature['geometry'] else [None, None]
            writer.writerow([f['name'], f['address'], feature['properties']['address'], feature['properties']['addressSource'],
                             '적용' if feature['properties']['addressPriorityApplied'] else '', status_labels[result['status']], source_labels[feature['properties']['coordinateSource']],
                             f['longitude'], f['latitude'], *coords, result.get('coordinateDifferenceM'),
                             '필요' if result.get('largeDifferenceReview', False) else '', result.get('match', {}).get('placeUrl'),
                             result['queriedAt']])
    save_json(out / 'summary.json', summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 2 if stopped else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, default=ROOT / 'data/processed/dent_geography.sqlite')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/processed/kakao-reconciliation/current')
    parser.add_argument('--collect', action='store_true')
    parser.add_argument('--max-requests', type=int, default=100)
    parser.add_argument('--delay', type=float, default=0.3)
    parser.add_argument('--timeout', type=float, default=20)
    parser.add_argument('--workers', type=int, default=1)
    args = parser.parse_args()
    if args.max_requests < 1 or args.delay < 0 or args.timeout <= 0 or not 1 <= args.workers <= 16:
        parser.error('Invalid request budget, delay or timeout')
    raise SystemExit(run(args))


if __name__ == '__main__':
    main()
