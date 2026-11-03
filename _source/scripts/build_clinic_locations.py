"""Export the selected current locations with a public-field allowlist."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def main():
    source = ROOT / 'data/processed/kakao-reconciliation/current/current-clinics.geojson'
    data = json.loads(source.read_text())
    rows = []
    missing = 0
    for f in data['features']:
        if not f['geometry']:
            missing += 1
            continue
        p = f['properties']
        lon, lat = f['geometry']['coordinates']
        rows.append({'id': hashlib.sha256(p['facilityKey'].encode()).hexdigest()[:20],
                     'name': p['name'], 'address': p['address'], 'kind': p['kind'],
                     'lng': lon, 'lat': lat, 'source': p['coordinateSource'],
                     'placeUrl': p.get('kakaoPlaceUrl') if p['coordinateSource'] == 'kakao' else None,
                     'queriedAt': p.get('kakaoQueriedAt') if p['coordinateSource'] == 'kakao' else None,
                     'largeDifference': p.get('largeDifferenceReview', False) if p['coordinateSource'] == 'kakao' else False})
    result = {'hiraAsOf': '2026-06-30', 'kakaoQueriedOn': '2026-11-03', 'total': len(data['features']),
              'unlocated': missing, 'scope': '심평원 분기 현황의 치과의원·치과병원 전체(대학·부속 등 포함)',
              'locations': rows}
    target = ROOT / 'web/dist/data/current-clinics.json'
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
    print(json.dumps({'located': len(rows), 'unlocated': missing, 'bytes': target.stat().st_size}))

if __name__ == '__main__':
    main()
