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
                     'kakaoName': p.get('kakaoName'),
                     'addressSource': p.get('addressSource'),
                     'addressPriorityApplied': p.get('addressPriorityApplied', False),
                     'lng': lon, 'lat': lat, 'source': p['coordinateSource'],
                     'placeUrl': p.get('kakaoPlaceUrl') if p['coordinateSource'] == 'kakao' else None,
                     'queriedAt': p.get('kakaoQueriedAt') if p['coordinateSource'] == 'kakao' else None,
                     'largeDifference': p.get('largeDifferenceReview', False) if p['coordinateSource'] == 'kakao' else False})
    result = {'hiraAsOf': '2026-06-30', 'kakaoQueriedOn': '2026-11-03', 'total': len(data['features']),
              'matchingVersion': 5,
              'unlocated': missing, 'scope': '심평원 분기 현황의 치과의원·치과병원 전체(대학·부속 등 포함)',
              'locations': rows}
    target = ROOT / 'web/dist/data/current-clinics.json'
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
    version = hashlib.sha256(target.read_bytes()).hexdigest()[:12]
    details = target.parent / 'clinic-details'
    details.mkdir(exist_ok=True)
    chunks, index_rows = [], []
    for start in range(0, len(rows), 500):
        filename = f'{start // 500:03}.json'
        chunks.append('clinic-details/' + filename)
        subset = rows[start:start + 500]
        (details / filename).write_text(json.dumps({r['id']: r for r in subset}, ensure_ascii=False, separators=(',', ':')))
        for r in subset:
            index_rows.append([r['id'], r['name'], r['lng'], r['lat'], 1 if r['source'] == 'kakao' else 0, start // 500])
    index = {k: v for k, v in result.items() if k != 'locations'}
    index.update(formatVersion=1, dataVersion=version, detailChunks=chunks, locations=index_rows)
    index_path = target.parent / 'current-clinics-index.json'
    index_path.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')))
    print(json.dumps({'located': len(rows), 'unlocated': missing, 'fullBytes': target.stat().st_size,
                      'initialIndexBytes': index_path.stat().st_size, 'detailChunks': len(chunks)}))

if __name__ == '__main__':
    main()
