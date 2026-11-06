import argparse
import contextlib
import io
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import reconcile_kakao_locations as k


def facility(**kwargs):
    return dict({'facility_key': 'a', 'name': '예시치과의원',
                 'address': '서울특별시 강남구 예시로 10, 3층 (예시동)',
                 'phone': '02-123-4567', 'longitude': 127.0, 'latitude': 37.5}, **kwargs)


def place(**kwargs):
    return dict({'id': '123', 'place_name': '예시 치과의원',
                 'category_name': '의료,건강 > 병원 > 치과',
                 'road_address_name': '서울 강남구 예시로 10',
                 'phone': '02-123-4567', 'x': '127.01', 'y': '37.51'}, **kwargs)


class KakaoLocationTests(unittest.TestCase):
    def test_public_map_short_medical_category_uses_exact_name_and_address(self):
        self.assertEqual(k.decide(facility(), [place(category_name='의원')])['status'], 'matched')
        self.assertEqual(k.decide(facility(), [place(category_name='카페')])['status'], 'no_unique_match')

    def test_exact_match_prefers_kakao_even_when_hira_differs(self):
        f = facility()
        r = k.decide(f, [place()])
        self.assertEqual(r['status'], 'matched')
        self.assertEqual(k.selected_point(f, r), ([127.01, 37.51], 'kakao'))
        self.assertTrue(r['largeDifferenceReview'])

    def test_optional_branch_allowed_when_building_matches(self):
        self.assertEqual(k.decide(facility(), [place(place_name='예시치과의원 강남점')])['status'], 'matched')

    def test_branch_not_ignored_when_building_differs(self):
        self.assertEqual(k.decide(facility(), [place(place_name='예시치과의원 강남점', road_address_name='서울 강남구 다른로 1')])['status'], 'no_unique_match')

    def test_yud_yeosu_word_order(self):
        f = facility(name='유디여수치과의원', address='전남광주통합특별시 여수시 신월로 806, 2~3층 (서교동)')
        p = place(place_name='유디치과의원 여수점', road_address_name='전남광주통합특별시 여수시 신월로 806')
        r = k.decide(f, [p])
        self.assertEqual(r['status'], 'matched')
        self.assertEqual(r['match']['nameEvidence'], 'reordered_location_branch')
        self.assertTrue(k.name_match_evidence('유디여수 치과의원', '유디치과의원 여수점', f['address'], p['road_address_name'], True))

    def test_region_prefix_order_can_change(self):
        self.assertTrue(k.name_match_evidence('여수유디치과의원', '유디여수치과', '전남 여수시 신월로 1', '전남 여수시 신월로 1', True))
        self.assertTrue(k.name_match_evidence('서울미소치과의원', '미소서울치과', '서울특별시 강남구 예시로 1', '서울 강남구 예시로 1', True))
        self.assertFalse(k.name_match_evidence('김이치과의원', '이김치과의원', '서울 강남구 예시로 1', '서울 강남구 예시로 1', True))

    def test_different_explicit_branches_are_not_conflated(self):
        f = facility(name='유디치과의원 여수점', address='전남 여수시 신월로 1')
        p = place(place_name='유디치과의원 순천점', road_address_name='전남 여수시 신월로 1')
        self.assertEqual(k.decide(f,[p])['status'], 'no_unique_match')

    def test_incheon_split_addresses_can_match_same_building(self):
        for child in ('서해구', '검단구'):
            f = facility(address='인천광역시 서구 원당대로 1')
            p = place(road_address_name=f'인천 {child} 원당대로 1')
            r = k.decide(f, [p])
            self.assertEqual(r['status'], 'matched')
            self.assertTrue(r['match']['sameBuilding'])
            self.assertTrue(r['match']['administrativeTransition'])
        self.assertFalse(k.compatible_locality('인천 서해구 예시로 1','인천 검단구 예시로 1'))
        self.assertFalse(k.compatible_locality('인천 서구 예시로 1','부산 서구 예시로 1'))

    def test_stronger_name_preserves_existing_place_identity(self):
        strong = k.decide(facility(name='예시강남치과의원'), [place(place_name='예시강남치과의원')])
        weak = k.decide(facility(name='예시치과의원'), [place(place_name='예시치과의원 강남점')])
        k.reject_reused_places([strong,weak])
        self.assertEqual(strong['status'], 'matched')
        self.assertEqual(weak['status'], 'place_reused_review')

    def test_changed_building_prefers_kakao_for_unique_local_name(self):
        result = k.decide(facility(), [place(road_address_name='서울 강남구 예시로 100')])
        self.assertEqual(result['status'], 'matched')
        self.assertFalse(result['match']['sameBuilding'])
        self.assertTrue(result['match']['addressPriorityApplied'])
        self.assertEqual(result['match']['selectedAddress'], '서울 강남구 예시로 100')

    def test_other_region_not_accepted(self):
        self.assertEqual(k.decide(facility(), [place(road_address_name='서울 서초구 예시로 10')])['status'], 'no_unique_match')

    def test_phone_conflict_does_not_block_matching(self):
        result = k.decide(facility(), [place(phone='02-999-8888')])
        self.assertEqual(result['status'], 'matched')
        self.assertFalse(result['match']['telephoneAgrees'])

    def test_optional_clinic_suffix_and_phone_difference_allowed(self):
        result = k.decide(facility(), [place(place_name='예시치과', phone='02-999-8888')])
        self.assertEqual(result['status'], 'matched')
        self.assertEqual(result['match']['evidence'], 'optional_clinic_suffix_and_road_building')

    def test_similar_brand_not_accepted(self):
        self.assertEqual(k.decide(facility(), [place(place_name='예시서울치과')])['status'], 'no_unique_match')

    def test_suffix_and_changed_address_can_match(self):
        self.assertEqual(k.decide(facility(), [place(place_name='예시치과', road_address_name='서울 강남구 예시로 100')])['status'], 'matched')

    def test_multiple_local_relocation_candidates_are_held(self):
        result = k.decide(facility(), [place(road_address_name='서울 강남구 예시로 100'), place(id='456', road_address_name='서울 강남구 다른로 20')])
        self.assertEqual(result['status'], 'ambiguous_review')

    def test_exact_building_disambiguates_same_name(self):
        result = k.decide(facility(), [place(), place(id='456', road_address_name='서울 강남구 다른로 20')])
        self.assertEqual(result['status'], 'matched')
        self.assertEqual(result['match']['placeId'], '123')

    def test_nested_city_district_and_province_are_not_conflated(self):
        self.assertNotEqual(k.locality('경기 성남시 수정구 예시로 1'), k.locality('경기도 성남시 분당구 예시로 1'))
        self.assertNotEqual(k.locality('서울 강서구 예시로 1'), k.locality('부산 강서구 예시로 1'))

    def test_seoul_baegunhosu_relocation(self):
        f = facility(name='서울백운호수치과의원', address='경기도 의왕시 바라산로 16, 203~206호 (학의동)')
        p = place(place_name='서울백운호수치과의원', road_address_name='경기 의왕시 백운중앙로3길 7', x='127.00291837354568', y='37.37151397759283')
        result = k.decide(f, [p])
        self.assertEqual(result['status'], 'matched')
        self.assertEqual(result['match']['selectedAddress'], p['road_address_name'])

    def test_suffix_variants_still_require_unique_candidate(self):
        self.assertEqual(k.decide(facility(), [place(), place(id='456', place_name='예시치과')])['match']['placeId'], '123')

    def test_missing_phone_can_match_exact_name_and_building(self):
        self.assertEqual(k.decide(facility(), [place(phone='')])['status'], 'matched')

    def test_multiple_places_not_accepted(self):
        self.assertEqual(k.decide(facility(), [place(), place(id='456',x='127.2')])['status'], 'ambiguous_review')

    def test_same_name_address_and_nearby_duplicate_place_listings(self):
        r=k.decide(facility(),[place(),place(id='456',x='127.01001')])
        self.assertEqual(r['status'],'matched')
        self.assertEqual(r['duplicateListingsCollapsed'],['123','456'])

    def test_explicit_dental_listing_preferred_over_generic_duplicate(self):
        r=k.decide(facility(),[place(),place(id='456',category_name='의료,건강 > 병원')])
        self.assertEqual(r['status'],'matched')
        self.assertEqual(r['match']['placeId'],'123')

    def test_exact_name_and_address_can_match_with_limited_search(self):
        result = k.decide(facility(), [place()], True)
        self.assertEqual(result['status'], 'matched')
        self.assertTrue(result['searchLimited'])

    def test_limited_search_does_not_guess_relocated_clinic(self):
        self.assertEqual(k.decide(facility(), [place(road_address_name='서울 강남구 다른로 2')], True)['status'], 'truncated_review')

    def test_spelled_letters_and_korean_name_at_same_address(self):
        r = k.decide(facility(name='SM치과의원'), [place(place_name='에스엠치과의원')])
        self.assertEqual(r['status'], 'matched')
        self.assertEqual(r['match']['nameEvidence'], 'phonetic_or_bilingual_name')
        self.assertEqual(k.decide(facility(name='SM치과의원'), [place(place_name='에스엠치과의원',road_address_name='서울 강남구 다른로 2')])['status'], 'matched')
        self.assertEqual(k.decide(facility(name='SM치과의원'), [place(place_name='에스엠치과의원',road_address_name='부산 강서구 다른로 2')])['status'], 'no_unique_match')

    def test_bilingual_parentheses_and_common_words(self):
        for first, second in [('서울에스(S)치과의원','서울S치과의원'),('더(THE)착한치과의원','더착한치과의원'),('에이(A)플란트치과의원','A플란트치과의원'),('Dr.서치과의원','닥터서치과의원'),('센트럴D＆D치과의원','센트럴디앤디치과의원'),('화이트이(e)치과의원','화이트e치과의원 창원점')]:
            self.assertEqual(k.decide(facility(name=first),[place(place_name=second)])['status'],'matched',(first,second))
        self.assertTrue(k.name_match_evidence('SM(에스엠)치과의원','에스엠치과의원','서울 강남구 예시로 1','서울 강남구 예시로 1',True))
        self.assertFalse(k.name_match_evidence('강남(A)치과의원','강남(B)치과의원','서울 강남구 예시로 1','서울 강남구 예시로 1',True))

    def test_other_incheon_transitions_use_the_same_street(self):
        for old,new in [('동구','제물포구'),('중구','제물포구'),('중구','영종구')]:
            r=k.decide(facility(address=f'인천광역시 {old} 송미로 7'),[place(road_address_name=f'인천 {new} 송미로 7')])
            self.assertEqual(r['status'],'matched')
            self.assertTrue(r['match']['sameBuilding'])
        self.assertFalse(k.compatible_locality('인천 제물포구 송미로 7','인천 영종구 송미로 7'))

    def test_generic_medical_category_can_use_exact_dental_name_and_address(self):
        self.assertEqual(k.decide(facility(),[place(category_name='의료,건강 > 병원 > 일반의원')])['status'],'matched')
        for category in ['서비스 > 주차장','의료,건강 > 치과기공소','의료,건강 > 의료기기']:
            self.assertEqual(k.decide(facility(),[place(category_name=category)])['status'],'no_unique_match')

    def test_non_dental_and_invalid_coordinates_rejected(self):
        for p in [place(category_name='의료기기'), place(x='NaN'), place(y='0'), place(x=None)]:
            self.assertEqual(k.decide(facility(), [p])['status'], 'no_unique_match')

    def test_place_cannot_match_two_facilities(self):
        rows = [k.decide(facility(), [place()]), k.decide(facility(), [place()])]
        k.reject_reused_places(rows)
        self.assertTrue(all(r['status'] == 'place_reused_review' for r in rows))
        self.assertEqual(k.selected_point(facility(), rows[0])[1], 'hira_unverified')

    def test_exact_building_wins_place_id_conflict_with_relocation_candidate(self):
        strong = k.decide(facility(), [place()])
        weak = k.decide(facility(address='서울 강남구 다른로 1'), [place()])
        k.reject_reused_places([strong, weak])
        self.assertEqual(strong['status'], 'matched')
        self.assertEqual(weak['status'], 'place_reused_review')

    def test_unlocated_not_zero(self):
        self.assertEqual(k.selected_point(facility(longitude=None), {'status': 'not_queried'}), (None, 'unlocated'))

    def test_jibun_not_guessed(self):
        self.assertIsNone(k.building('서울 강남구 예시동 10'))

    def test_all_pages_and_cache_resume_without_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            pages = [{'documents': [], 'meta': {'is_end': False, 'total_count': 16, 'pageable_count': 16}},
                     {'documents': [place()], 'meta': {'is_end': True, 'total_count': 16, 'pageable_count': 16}}]
            b = {'used': 0, 'remaining': 2}
            with patch.object(k, 'request_page', side_effect=pages) as call:
                result, observed = k.collect_one(facility(), 'secret', Path(tmp), b, 0, 1)
                self.assertEqual(call.call_count, 2)
                self.assertEqual(result['status'], 'matched')
            with patch.object(k, 'request_page', side_effect=AssertionError('network called')):
                again, date = k.collect_one(facility(), 'secret', Path(tmp), {'used': 0, 'remaining': 0}, 0, 1)
                self.assertEqual(again, result)
                self.assertEqual(date, observed)
            self.assertNotIn('secret', next(Path(tmp).glob('*.json')).read_text())

    def test_partial_pagination_not_cached(self):
        with tempfile.TemporaryDirectory() as tmp:
            page = {'documents': [], 'meta': {'is_end': False, 'total_count': 16, 'pageable_count': 16}}
            with patch.object(k, 'request_page', return_value=page):
                with self.assertRaises(RuntimeError):
                    k.collect_one(facility(), 'secret', Path(tmp), {'used': 0, 'remaining': 1}, 0, 1)
            self.assertEqual(list(Path(tmp).glob('*.json')), [])

    def test_public_map_evidence_preserves_empty_api_response_and_rechecks_identity(self):
        evidence = json.loads((Path(__file__).parent / 'fixtures/kakao-public-map-dongtan.json').read_text())
        f = facility(name='동탄휴치과의원', address='경기도 화성시 동탄구 동탄면 동탄기흥로 147-13, 304호')
        response = {'documents': [], 'queriedAt': '2026-11-03T00:44:02+00:00', 'verifiedSupplements': [evidence]}
        docs, observed = k.place_evidence(f, response)
        self.assertEqual(response['documents'], [])
        self.assertEqual(observed, evidence['verifiedAt'])
        result = k.decide(f, docs)
        self.assertEqual(result['status'], 'matched')
        self.assertEqual(result['match']['placeId'], '26416862')
        self.assertEqual(k.selected_point(f, result), ([127.09023781321257, 37.1728614035725], 'kakao'))
        self.assertEqual(k.decide(facility(), docs)['status'], 'no_unique_match')
        for field, value in [('facilityKey', 'other'), ('detailUrl', 'https://place.map.kakao.com/other')]:
            changed = json.loads(json.dumps(response))
            changed['verifiedSupplements'][0][field] = value
            with self.assertRaises(ValueError):
                k.place_evidence(f, changed)
        evidence['document']['x'] = '128'
        with self.assertRaises(ValueError):
            k.place_evidence(f, response)

    def test_prepare_does_not_mutate_db_or_call_api(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / 'source.sqlite'
            with sqlite3.connect(db) as con:
                con.executescript('CREATE TABLE raw_files(source,observed_at); CREATE TABLE facilities(facility_key,name,address,latitude,longitude,raw_json,last_seen,status,facility_type);')
                con.execute('INSERT INTO raw_files VALUES (?,?)', ('hira_snapshot_2026_06', '2026-06-30'))
                con.execute('INSERT INTO raw_files VALUES (?,?)', ('hira_closures', '2026-09-16'))
                f = facility()
                con.execute('INSERT INTO facilities VALUES (?,?,?,?,?,?,?,?,?)', ('a', f['name'], f['address'], 37.5, 127., '{}', '2026-06-30', 'OPEN', 'DENTAL_CLINIC'))
            before = db.read_bytes()
            args = argparse.Namespace(db=db, output=Path(tmp)/'output', collect=False, max_requests=1, delay=0, timeout=1)
            with patch.object(k, 'request_page', side_effect=AssertionError('network called')), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(k.run(args), 0)
            self.assertEqual(before, db.read_bytes())
            summary = json.loads((args.output/'summary.json').read_text())
            self.assertFalse(summary['complete'])
            self.assertEqual(summary['hiraAsOf'], '2026-06-30')


if __name__ == '__main__':
    unittest.main()
