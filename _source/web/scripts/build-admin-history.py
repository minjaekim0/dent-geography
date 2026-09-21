"""Extract administrative (NOT legal-dong) crosswalks from official MOIS tables.

Usage: bundled-python web/scripts/build-admin-history.py /tmp
Inputs: admin-{gangwon,jeonbuk,hwaseong,jeonnam,incheon}.xlsx.
No statistical observations or geometry are rewritten.
"""
import hashlib
import json
import re
import sys
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
INPUT = Path(sys.argv[1])
BASE = 'https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000052&nttId='
events = []

def event(key, date, title, page, **extra):
    item = dict(id=key, effective=date, title=title, source=BASE+str(page), pairs=[], **extra)
    events.append(item)
    return item

def pair(e, old, new, old_name='', new_name='', row=None):
    old, new = str(old), str(new)
    assert re.fullmatch(r'\d{10}', old) and re.fullmatch(r'\d{10}', new), (old, new)
    if old == new:
        return
    p = dict(before=old, after=new, beforeName=old_name, afterName=new_name)
    if row is not None:
        p['sourceRow'] = row
    found = next((x for x in e['pairs'] if x['before'] == old), None)
    if found:
        assert found['after'] == new, ('one-to-many mapping', old)
    else:
        assert not any(x['after'] == new for x in e['pairs']), ('many-to-one mapping', new)
        e['pairs'].append(p)

def sheet(e, key):
    path = INPUT / f'admin-{key}.xlsx'
    e['attachmentSha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    file_id, file_sn = {
        'gangwon': ('FILE_001181807m12AjO', 3), 'jeonbuk': ('FILE_00124307vmKCi3I', 3),
        'hwaseong': ('FILE_00141445_RCEOIj', 4), 'jeonnam': ('FILE_00146280tlU2Y2B', 6),
        'incheon': ('FILE_00146280tlU2Y2B', 8),
    }[key]
    e['attachmentUrl'] = f'https://www.mois.go.kr/cmm/fms/FileDown.do?atchFileId={file_id}&fileSn={file_sn}'
    book = openpyxl.load_workbook(path, data_only=True, read_only=True)
    e['sheet'] = book.worksheets[0].title
    return enumerate(book.worksheets[0].iter_rows(max_col=14, values_only=True), 1)

def component(value):
    return re.search(r'\((\d{5})\)', str(value)).group(1)

def label(value):
    return re.sub(r'\(\d+\)', '', str(value)).replace('\n', ' ').strip()

for key, date, title, page in [
    ('gangwon', '2023-06-11', '강원도 → 강원특별자치도', 100684),
    ('jeonbuk', '2024-01-18', '전라북도 → 전북특별자치도', 106428),
]:
    e = event(key, date, title, page, kind='rename')
    for i, r in sheet(e, key):
        if re.fullmatch(r'\d{10}', str(r[0])):
            pair(e, r[0], r[7], ' '.join(str(v) for v in r[1:4] if v), ' '.join(str(v) for v in r[8:11] if v), i)

for key, date, title, kind, page in [
    ('hwaseong', '2026-02-01', '화성시 4개 일반구 설치 · 기존 읍면동 코드 연결', 'recode', 122595),
    ('jeonnam', '2026-07-01', '전남광주통합특별시 출범 · 하위 시군구·읍면동 코드 연결', 'transfer', 127039),
]:
    e = event(key, date, title, page, kind=kind)
    old_parent = new_parent = old_label = new_label = None
    for i, r in sheet(e, key):
        if i < 4:
            continue
        if r[0]:
            old_parent, old_label = component(r[0]), label(r[0])
        if r[4]:
            new_parent, new_label = component(r[4]), label(r[4])
        if key == 'jeonnam' and r[0]:
            pair(e, old_parent+'00000', new_parent+'00000', old_label, new_label, i)
        if r[1] and r[6] and '(' in str(r[1]):
            pair(e, old_parent+component(r[1]), new_parent+component(r[6]), old_label+' '+label(r[1]), new_label+' '+label(r[6]), i)

e = event('incheon', '2026-07-01', '인천 제물포구·영종구·검단구 설치 · 기존 행정동 코드 연결', 127039, kind='transfer')
for i, r in sheet(e, 'incheon'):
    if i < 3:
        continue
    if r[0]:
        old_parent, old_label = component(r[0]), label(r[0]).replace('인천 ', '인천광역시 ')
    if r[5]:
        new_parent, new_label = component(r[5]), label(r[5]).replace('인천 ', '인천광역시 ')
    if isinstance(r[2], (int, float)) and isinstance(r[7], (int, float)):
        # The source wraps 화수1·화평동 over rows 51–52 rather than within a cell.
        old_dong = '화수1·화평동' if r[1] == '화수1·' else r[1]
        new_dong = '화수1·화평동' if r[6] == '화수1·' else r[6]
        pair(e, old_parent+str(int(r[2])), new_parent+str(int(r[7])), old_label+' '+old_dong, new_label+' '+new_dong, i)

def snapshot(period):
    return json.loads((ROOT/'dist/data/population'/f'{period}.json').read_text())['records']

def match_renamed_parent(e, before_period, after_period, old_prefix, new_prefix):
    # Only inside an explicitly verified whole-parent rename/transfer; never a nationwide name join.
    before, after = snapshot(before_period), snapshot(after_period)
    norm = lambda s: re.sub(r'[\s,.·ㆍ]', '', s.split(' ', 2)[-1])
    for code, r in before.items():
        if not code.startswith(old_prefix):
            continue
        candidates = [(c, s) for c, s in after.items() if c.startswith(new_prefix) and
                      ((code.endswith('00000') and c.endswith('00000')) or norm(r['name']) == norm(s['name']))]
        assert len(candidates) == 1, (code, candidates)
        c, s = candidates[0]
        pair(e, code, c, r['name'], s['name'])

e = event('michuhol', '2018-07-01', '인천 남구 → 미추홀구', 64259, kind='rename')
match_renamed_parent(e, '2017-12', '2018-12', '28170', '28177')
e = event('samgukyusa', '2021-01-01', '군위군 고로면 → 삼국유사면', 81799, kind='rename')
pair(e, '4772037000', '4772038000', '경상북도 군위군 고로면', '경상북도 군위군 삼국유사면')
e = event('gunwi', '2023-07-01', '군위군 경상북도 → 대구광역시 편입', 101209, kind='transfer')
match_renamed_parent(e, '2022-12', '2023-12', '47720', '27720')
e = event('anyang', '2026-07-01', '안양8·9동 → 명학동·병목안동', 127039, kind='rename')
pair(e, '4117158000', '4117158200', '경기도 안양시 만안구 안양8동', '경기도 안양시 만안구 명학동')
pair(e, '4117158100', '4117158300', '경기도 안양시 만안구 안양9동', '경기도 안양시 만안구 병목안동')

for key, date, old, new, law in [
    ('dangjin', '2012-01-01', '충청남도 당진군', '충청남도 당진시', '011441'),
    ('yeoju', '2013-09-23', '경기도 여주군', '경기도 여주시', '011870'),
]:
    # County-wide identities only: former 읍 subdivisions are not a rename.
    events.append(dict(id=key, effective=date, title=old+' → '+new, kind='rename',
                       source=f'https://www.law.go.kr/LSW/lsRvsDocListP.do?chrClsCd=010202&lsId={law}&lsRvsGubun=all', pairs=[], names=[[old,new]]))
events.sort(key=lambda e: (e['effective'], e['id']))
result = dict(schemaVersion=1, reviewedAt='2026-09-21', scope='검증한 명칭·코드·소속 변경의 일대일 연결. 전국 모든 분할·통합·경계 변경을 망라하거나 과거 경계를 복원한 자료가 아닙니다.', events=events,
              seriesGroups=sorted(p.stem.removeprefix('series-') for p in (ROOT/'dist/data/population').glob('series-*.json')))
(ROOT/'dist/data/admin-history.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':'))+'\n')
print([(e['id'], len(e['pairs'])) for e in events])
