"""Add the reviewed Seo-gu split without aliasing either whole successor gu."""
import hashlib
import json
from pathlib import Path

SOURCE = 'https://isel.seo.incheon.kr/open_content/main/open_info/boundary/faq.jsp'


def extend_incheon_registry(registry, project):
    old_path = project / 'data/reference/boundaries/administrative_dong_2026_04.geojson'
    new_path = project / 'data/reference/boundaries/administrative_dong_2026_07.geojson'
    old = [f for f in json.loads(old_path.read_text())['features']
           if f['properties']['adm_nm'].startswith('인천광역시 서구 ')]
    new = [f for f in json.loads(new_path.read_text())['features']
           if f['properties'].get('sggnm') == '서해구' and f['properties'].get('sido') == '28']
    assert len(old) == 24 and len(new) == 16
    pairs, changed = [], []
    for feature in new:
        props = feature['properties']
        name = props['adm_nm'].split()[-1]
        matches = [f for f in old if f['properties']['adm_nm'].split()[-1] == name]
        assert len(matches) == 1
        previous = matches[0]
        if previous['geometry'] != feature['geometry']:
            changed.append({'before': previous['properties']['adm_cd2'], 'after': props['adm_cd2'],
                            'beforeName': previous['properties']['adm_nm'], 'afterName': props['adm_nm'],
                            'reason': 'boundary_geometry_changed_no_statistical_alias'})
            continue
        pairs.append({'before': previous['properties']['adm_cd2'], 'after': props['adm_cd2'],
                      'beforeName': previous['properties']['adm_nm'], 'afterName': props['adm_nm'],
                      'evidence': 'identical_full_geometry_and_dong_name_in_2026_04_and_07'})
    assert len({p['before'] for p in pairs}) == len({p['after'] for p in pairs}) == 15
    assert len(changed) == 1 and changed[0]['afterName'].endswith('검암경서동')
    registry['events'] = [e for e in registry['events'] if e['id'] != 'incheon-seohae']
    existing = {p['before'] for e in registry['events'] for p in e['pairs']}
    assert not existing.intersection(p['before'] for p in pairs)
    event = next(e for e in registry['events'] if e['id'] == 'incheon')
    event['title'] = '인천 제물포구·영종구·서해구·검단구 개편 · 기존 행정동 코드 연결'
    event['splits'] = [{'before': '2826000000', 'beforeName': '인천광역시 서구',
                        'after': [{'code': '2827500000', 'name': '인천광역시 서해구'},
                                  {'code': '2829000000', 'name': '인천광역시 검단구'}], 'source': SOURCE}]
    registry['events'].append({'id': 'incheon-seohae', 'effective': '2026-07-01',
                               'title': '인천 서구 → 서해구 행정동 연결 (동일 경계 15개 · 경계 변경 1개 보류)',
                               'kind': 'transfer', 'source': SOURCE, 'pairs': pairs,
                               'unlinkedBoundaryChanges': changed,
                               'boundaryEvidence': {str(path.relative_to(project)): hashlib.sha256(path.read_bytes()).hexdigest()
                                                    for path in [old_path, new_path]}})
    registry['events'].sort(key=lambda e: (e['effective'], e['id']))
    registry['reviewedAt'] = '2026-11-03'
    return registry


if __name__ == '__main__':
    project = Path(__file__).resolve().parents[2]
    path = project / 'web/dist/data/admin-history.json'
    result = extend_incheon_registry(json.loads(path.read_text()), project)
    path.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    print('Verified 15 identical dong geometries; 1 changed boundary held; whole-gu split preserved separately')
