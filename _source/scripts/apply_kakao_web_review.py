"""Apply separately preserved public-map evidence after identity/coordinate checks."""
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from reconcile_kakao_locations import ROOT, VERSION, compact, decide, place_evidence, same_building_address, save_json
from convert_kakao_web_routes import route_input
from review_kakao_web_searches import FOLDER, summarize

BASE = ROOT / 'data/processed/kakao-reconciliation/current'


def build_supplement(facility, candidate, route, transform):
    d = candidate['document']
    if d['id'] != route['placeId'] or transform['input'] != route_input(route):
        raise ValueError('Reviewed place/coordinate identity mismatch')
    if compact(d['place_name']) != compact(route['detailName']):
        raise ValueError('Search and detailed place names differ')
    address = d.get('road_address_name') or d.get('address_name') or ''
    if not same_building_address(address, route['detailAddress']) and compact(address) != compact(route['detailAddress']):
        raise ValueError('Search and detailed place addresses differ')
    xy = transform['response']['documents'][0]
    document = {**d, 'x': str(xy['x']), 'y': str(xy['y'])}
    evidence = {'source': 'kakao_map_public_ui', 'facilityKey': facility['facility_key'],
                'verifiedAt': route['verifiedAt'], 'detailUrl': route['detailUrl'],
                'routeUrl': route['routeUrl'], 'transform': transform, 'document': document,
                'searchEvidence': {'query': candidate['query'], 'queriedAt': candidate['queriedAt'],
                                   'detailName': route['detailName'], 'detailAddress': route['detailAddress']}}
    # Reuse the production evidence validator and identity rules; never set a
    # matched status directly or borrow HIRA/nearby-shop coordinates.
    docs, _ = place_evidence(facility, {'documents': [], 'queriedAt': candidate['queriedAt'], 'verifiedSupplements': [evidence]})
    result = decide(facility, docs)
    if result['status'] != 'matched' or result['match']['placeId'] != d['id']:
        raise ValueError('Public-map evidence does not prove this institution')
    return evidence


def main(base=BASE, folder=FOLDER):
    report = summarize(folder)
    if report['searched'] != report['total']:
        raise ValueError('Every held institution must have a completed web search')
    facilities = {f['facility_key']: f for f in json.loads((base/'input.json').read_text())}
    old = json.loads((base/'audit.json').read_text())
    used = {r['match']['placeId'] for r in old if r['status'] == 'matched'}
    routes = {r['placeId']: r for r in map(json.loads, (folder/'routes.jsonl').read_text().splitlines())}
    candidates = json.loads((folder/'identity-candidates.json').read_text())
    backup = base/'before-national-web-review-2026-11-07'
    backup.mkdir(exist_ok=True)
    for name in ['audit.json','current-clinics.geojson','summary.json','review.csv','remaining-review.csv','full-review.json','manifest.json']:
        if not (backup/name).exists():
            shutil.copy2(base/name, backup/name)
    (backup/'responses').mkdir(exist_ok=True)
    applied, held = [], []
    for c in candidates:
        f = facilities[c['facilityKey']]
        place_id = c['document']['id']
        target = folder/'coordinate-transforms'/(place_id+'.json')
        if place_id in used:
            held.append({'facilityKey': f['facility_key'], 'placeId': place_id, 'reason': 'already_linked_to_another_institution'})
            continue
        if place_id not in routes or not target.exists():
            held.append({'facilityKey': f['facility_key'], 'placeId': place_id, 'reason': 'public_coordinate_not_verified'})
            continue
        evidence = build_supplement(f, c, routes[place_id], json.loads(target.read_text()))
        query = f"{' '.join((f['address'] or '').split()[:2])} {f['name']}"
        fingerprint = hashlib.sha256(json.dumps([VERSION, f, query], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        path = base/'responses'/(fingerprint+'.json')
        response = json.loads(path.read_text())
        if not (backup/'responses'/path.name).exists():
            shutil.copy2(path, backup/'responses'/path.name)
        # The original documents/query/date remain unchanged.
        supplements = [s for s in response.get('verifiedSupplements', []) if s['document']['id'] != place_id]
        response['verifiedSupplements'] = [*supplements, evidence]
        save_json(path, response)
        applied.append({'facilityKey': f['facility_key'], 'placeId': place_id})
    summary = {'webSearches': report, 'supplementsApplied': len(applied), 'deferred': held,
               'applied': applied, 'appliedAt': datetime.now(timezone.utc).isoformat()}
    save_json(folder/'application.json', summary)
    print(json.dumps({'searched': report['searched'], 'candidates': len(candidates), 'supplementsApplied': len(applied), 'deferred': len(held)}))


if __name__ == '__main__':
    main()
