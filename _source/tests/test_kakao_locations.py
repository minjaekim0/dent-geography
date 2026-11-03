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
    def test_exact_match_prefers_kakao_even_when_hira_differs(self):
        f = facility()
        r = k.decide(f, [place()])
        self.assertEqual(r['status'], 'matched')
        self.assertEqual(k.selected_point(f, r), ([127.01, 37.51], 'kakao'))
        self.assertTrue(r['largeDifferenceReview'])

    def test_branch_name_not_ignored(self):
        self.assertEqual(k.decide(facility(), [place(place_name='예시치과의원 강남점')])['status'], 'no_unique_match')

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
        self.assertEqual(k.decide(facility(), [place(), place(id='456', place_name='예시치과')])['status'], 'ambiguous_review')

    def test_missing_phone_can_match_exact_name_and_building(self):
        self.assertEqual(k.decide(facility(), [place(phone='')])['status'], 'matched')

    def test_multiple_places_not_accepted(self):
        self.assertEqual(k.decide(facility(), [place(), place(id='456')])['status'], 'ambiguous_review')

    def test_truncated_search_not_accepted(self):
        self.assertEqual(k.decide(facility(), [place()], True)['status'], 'truncated_review')

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
