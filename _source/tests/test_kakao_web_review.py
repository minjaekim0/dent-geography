import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import reconcile_kakao_locations as matcher
import review_kakao_web_searches as review
import convert_kakao_web_routes as coords
import apply_kakao_web_review as apply_review


class WebReviewTests(unittest.TestCase):
    def setUp(self):
        self.f = {'facility_key': 'a', 'name': '예시치과의원', 'address': '서울 강남구 예시로 10', 'phone': '', 'longitude': 127, 'latitude': 37}
        self.d = {'id': '123', 'place_name': '예시치과의원', 'road_address_name': '서울 강남구 예시로 10', 'category_name': '치과', 'phone': ''}

    def test_identity_review_does_not_fabricate_a_selected_coordinate(self):
        self.assertEqual(len(review.identity_candidates(self.f, [self.d])), 1)
        self.assertEqual(matcher.decide(self.f, [self.d])['status'], 'no_unique_match')
        other = {**self.d, 'road_address_name': '부산 해운대구 예시로 10'}
        self.assertEqual(review.identity_candidates(self.f, [other]), [])

    def test_later_empty_search_keeps_earlier_identity_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder/'queue.json').write_text(json.dumps([self.f]))
            records = [{'facilityKey': 'a', 'query': '서울 예시치과', 'queriedAt': '2026-11-06', 'totalText': '1', 'documents': [self.d]},
                       {'facilityKey': 'a', 'query': '예시치과', 'queriedAt': '2026-11-07', 'totalText': '0', 'documents': []}]
            (folder/'searches.jsonl').write_text('\n'.join(map(json.dumps, records)))
            result = review.summarize(folder)
            self.assertEqual(result['searched'], 1)
            self.assertEqual(result['searchQueries'], 2)
            self.assertEqual(result['uniqueIdentityCandidate'], 1)

    def test_public_route_cannot_supply_another_places_coordinates(self):
        evidence = json.loads((Path(__file__).parent/'fixtures/kakao-public-map-dongtan.json').read_text())
        p = evidence['transform']['input']
        route = {'placeId': '26416862', 'routeUrl': evidence['routeUrl'], 'inputX': p['x'], 'inputY': p['y']}
        self.assertEqual(coords.route_input(route), p)
        for changed in [{**route, 'placeId': 'other'}, {**route, 'inputX': 0}]:
            with self.assertRaises(ValueError):
                coords.route_input(changed)
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)/'26416862.json'
            target.write_text(json.dumps(evidence['transform']))
            with patch.object(coords.urllib.request, 'urlopen', side_effect=AssertionError('network called')):
                self.assertEqual(coords.convert(route, 'secret-key', Path(tmp)), evidence['transform'])
            self.assertNotIn('secret-key', target.read_text())

    def test_application_requires_search_detail_and_coordinates_to_agree(self):
        evidence = json.loads((Path(__file__).parent/'fixtures/kakao-public-map-dongtan.json').read_text())
        d = evidence['document']
        f = {**self.f, 'name': d['place_name'], 'address': d['road_address_name']}
        c = {'document': d, 'query': d['place_name'], 'queriedAt': evidence['verifiedAt']}
        raw = evidence['transform']['input']
        r = {'placeId': d['id'], 'inputX': raw['x'], 'inputY': raw['y'], 'routeUrl': evidence['routeUrl'],
             'detailName': d['place_name'], 'detailAddress': d['road_address_name'],
             'detailUrl': evidence['detailUrl'], 'verifiedAt': evidence['verifiedAt']}
        result = apply_review.build_supplement(f, c, r, evidence['transform'])
        self.assertEqual(result['document']['id'], d['id'])
        for changed in [{**r, 'detailName': '다른치과의원'}, {**r, 'detailAddress': '경기 화성시 다른로 10'}]:
            with self.assertRaises(ValueError):
                apply_review.build_supplement(f, c, changed, evidence['transform'])


if __name__ == '__main__':
    unittest.main()
