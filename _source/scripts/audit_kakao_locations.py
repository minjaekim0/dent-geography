"""Audit every chosen address/coordinate against preserved Kakao evidence."""
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path

from reconcile_kakao_locations import ROOT, VERSION, name_match_evidence, compatible_locality, same_building_address, selected_point, valid_point, dental_place


def audit(folder):
    facilities = json.loads((folder / 'input.json').read_text())
    results = json.loads((folder / 'audit.json').read_text())
    features = json.loads((folder / 'current-clinics.geojson').read_text())['features']
    assert len(facilities) == len(results) == len(features)
    assert len({f['facility_key'] for f in facilities}) == len(facilities)
    held = []
    ids = []
    reasons = Counter()
    for f, r, feature in zip(facilities, results, features):
        assert f['facility_key'] == r['facilityKey'] == feature['properties']['facilityKey']
        query = f"{' '.join((f['address'] or '').split()[:2])} {f['name']}"
        fingerprint = hashlib.sha256(json.dumps([VERSION, f, query], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        response = json.loads((folder / 'responses' / (fingerprint + '.json')).read_text())
        assert response['fingerprint'] == fingerprint
        docs = response['documents']
        coords, source = selected_point(f, r)
        assert source == feature['properties']['coordinateSource']
        assert coords == (feature['geometry']['coordinates'] if feature['geometry'] else None)
        assert feature['properties']['hiraAddress'] == f['address']
        if r['status'] == 'matched':
            m = r['match']
            ids.append(m['placeId'])
            places = [d for d in docs if str(d.get('id')) == m['placeId']]
            assert len(places) >= 1
            d = places[-1]
            selected_address = d.get('road_address_name') or d.get('address_name')
            same_building = same_building_address(f['address'], d.get('road_address_name'))
            assert m['sameBuilding'] == same_building
            assert name_match_evidence(f['name'], d['place_name'], f['address'], selected_address, same_building)
            assert dental_place(d, same_building)
            assert valid_point(d['x'], d['y'])
            assert coords == [float(d['x']), float(d['y'])]
            assert feature['properties']['address'] == (d.get('road_address_name') or d.get('address_name'))
            assert feature['properties']['addressSource'] == 'kakao'
            assert same_building or compatible_locality(f['address'], selected_address)
            continue
        assert feature['properties']['address'] == f['address']
        assert feature['properties']['addressSource'] == 'hira'
        reason = {'truncated_review': '검색 노출 한도', 'ambiguous_review': '같은 이름 복수 후보',
                  'place_reused_review': '기관 간 장소 중복'}.get(r['status'])
        if reason is None:
            dental = [d for d in docs if dental_place(d, same_building_address(f['address'], d.get('road_address_name')))]
            names = [d for d in dental if name_match_evidence(f['name'], d.get('place_name'), f['address'],
                     d.get('road_address_name') or d.get('address_name'), same_building_address(f['address'], d.get('road_address_name')))]
            valid = [d for d in names if valid_point(d.get('x'), d.get('y'))]
            if not docs:
                reason = '검색 결과 없음'
            elif not dental:
                reason = '치과 분류 후보 없음'
            elif not names:
                reason = '기관명 일치 후보 없음'
            elif not valid:
                reason = '후보 좌표 무효'
            else:
                reason = '다른 시군구 동명 후보 또는 지역 해석 불가'
        reasons[reason] += 1
        held.append([f['name'], f['address'], reason, source,
                     ' | '.join(f"{d.get('place_name', '')}: {d.get('road_address_name') or d.get('address_name', '')}" for d in docs)])
    assert len(ids) == len(set(ids)), 'A Kakao place cannot be assigned to two HIRA records'
    assert len(ids) + len(held) == len(facilities)
    with (folder / 'remaining-review.csv').open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.writer(handle)
        writer.writerow(['기관명', '심평원 주소', '보류 사유', '좌표 출처', '카카오 검색 후보'])
        writer.writerows(held)
    before = folder / 'before-flexible-evidence-2026-11-03' / 'audit.json'
    old = {r['facilityKey']: r for r in json.loads(before.read_text())} if before.exists() else {}
    report = {'checked': len(facilities), 'kakaoMatches': len(ids), 'remaining': len(held),
              'remainingReasons': dict(reasons), 'additionalMatches': sum(r['status'] == 'matched' and old.get(r['facilityKey'], {}).get('status') != 'matched' for r in results),
              'previousMatchesNowHeld': sum(r['status'] != 'matched' and old.get(r['facilityKey'], {}).get('status') == 'matched' for r in results),
              'checks': ['source_coordinates_match', 'selected_address_matches_source', 'original_hira_address_preserved',
                         'every_cache_bound_to_input', 'unique_kakao_place_ids', 'all_records_accounted_for'],
              'fieldLocationSurvey': False}
    (folder / 'full-review.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    return report


if __name__ == '__main__':
    print(json.dumps(audit(ROOT / 'data/processed/kakao-reconciliation/current'), ensure_ascii=False, indent=2))
