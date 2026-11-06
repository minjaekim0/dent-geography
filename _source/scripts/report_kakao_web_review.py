"""Write a readable per-institution report from completed web review and final decisions."""
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from reconcile_kakao_locations import ROOT, selected_point
from review_kakao_web_searches import FOLDER

BASE = ROOT / 'data/processed/kakao-reconciliation/current'
LABELS = {'differentIdentityOrAddress': '기관명·주소 일치 확인 안 됨', 'noResults': '웹 재검색에서도 치과 장소 결과 없음',
          'morePages': '검색 노출 범위 추가 확인', 'multipleCandidates': '동일 기관 후보 복수',
          'place_reused_review': '다른 기관과 카카오 장소 중복', 'truncated_review': '기존 후보의 검색 한도 추가 확인',
          'ambiguous_review': '기존 후보와 복수 기관 관계 확인'}


def main(base=BASE, folder=FOLDER):
    queue = json.loads((folder/'queue.json').read_text())
    observations = defaultdict(list)
    for r in map(json.loads, (folder/'searches.jsonl').read_text().splitlines()):
        observations[r['facilityKey']].append(r)
    pending = {r['facilityKey']: r['reason'] for r in json.loads((folder/'pending-search-review.json').read_text())}
    final = {r['facilityKey']: r for r in json.loads((base/'audit.json').read_text())}
    baseline = {r['facilityKey']: r for r in json.loads((base/'before-national-web-review-2026-11-07/audit.json').read_text())}
    for key, r in baseline.items():
        if r['status'] == 'matched':
            n = final[key]
            assert n['status'] == 'matched'
            assert all(n['match'][k] == r['match'][k] for k in ['placeId', 'longitude', 'latitude', 'selectedAddress'])
    reasons = Counter()
    rows = []
    matched = 0
    for f in queue:
        key = f['facility_key'];r = final[key]
        assert key in observations
        docs = {d['id']: d for o in observations[key] for d in o['documents'] if d.get('id')}
        coords, source = selected_point(f, r)
        m = r.get('match', {}) if r['status'] == 'matched' else {}
        if r['status'] == 'matched':
            status = '추가 연결';reason = '웹 기관명·주소와 카카오 위치 링크 대조';matched += 1
        else:
            status = '보류';reason = LABELS.get(r['status'], LABELS.get(pending.get(key), '기존 후보와 추가 대조 필요'));reasons[reason] += 1
        candidates = ' | '.join(f"{d.get('place_name','')}: {d.get('road_address_name') or d.get('address_name','')} ({d.get('place_url','')})" for d in docs.values())
        rows.append([f['name'], f['address'], len(observations[key]), status, reason,
                     m.get('placeName',''), m.get('selectedAddress', f['address']),
                     '카카오' if source == 'kakao' else '심평원(미검증)' if source == 'hira_unverified' else '좌표 없음',
                     coords[0] if coords else '', coords[1] if coords else '', m.get('placeUrl',''),
                     r['queriedAt'] if r['status'] == 'matched' else '', candidates])
    assert len(rows) == len(queue) == 1852
    target = folder/'final-review.csv'
    with target.open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.writer(handle, lineterminator='\n')
        writer.writerow(['기관명','원래 심평원 주소','웹 검색 횟수','최종 상태','검수 결과','카카오 명칭','선택 주소','좌표 출처','경도','위도','카카오 장소 링크','카카오 위치 확인 시각(UTC)','웹 검색에서 관찰한 후보'])
        writer.writerows(rows)
    sources = Counter(r['status'] == 'matched' for r in final.values())
    report = {'reviewedInstitutions': len(queue), 'webSearchQueries': sum(map(len, observations.values())),
              'newMatches': matched, 'remaining': len(queue)-matched,
              'remainingWebReasons': dict(reasons), 'totalKakaoMatches': sources[True],
              'previousMatchesLost': 0, 'previousLocationsChanged': 0,
              'fieldLocationSurvey': False, 'csv': target.name}
    (folder/'final-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
