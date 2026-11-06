"""Summarize observed public-map UI searches without assigning unverified coordinates."""
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from reconcile_kakao_locations import ROOT, compact, compatible_locality, dental_place, identity_strength, name_match_evidence, same_building_address

FOLDER = ROOT / 'data/processed/kakao-reconciliation/current/web-review-2026-11-06'


def identity_candidates(f, docs):
    candidates = {}
    for d in docs:
        if not d.get('id'):
            continue
        address = d.get('road_address_name') or d.get('address_name') or ''
        same = same_building_address(f['address'], d.get('road_address_name'))
        evidence = name_match_evidence(f['name'], d.get('place_name'), f['address'], address, same)
        if not evidence or not dental_place(d, same) or not (same or compatible_locality(f['address'], address)):
            continue
        phone = lambda x: re.sub(r'\D', '', x or '')
        candidates[d['id']] = {'document': d, 'sameBuilding': same, 'nameEvidence': evidence,
            'literalNameAgrees': compact(f['name']) == compact(d['place_name']),
            'categoryCorroboratedByNameAndAddress': '치과' not in d.get('category_name', ''),
            'telephoneAgrees': bool(phone(f.get('phone')) and phone(f.get('phone')) == phone(d.get('phone')))}
    values = list(candidates.values())
    exact = [c for c in values if c['sameBuilding']]
    values = exact or values
    if values:
        strength = max(map(identity_strength, values))
        values = [c for c in values if identity_strength(c) == strength]
    return values


def summarize(folder=FOLDER):
    queue = json.loads((folder / 'queue.json').read_text())
    facilities = {f['facility_key']: f for f in queue}
    records = defaultdict(list)
    for r in map(json.loads, (folder / 'searches.jsonl').read_text().splitlines()):
        records[r['facilityKey']].append(r)
    ready, pending = [], []
    counts = Counter()
    for key, observations in records.items():
        documents = {d['id']: d for r in observations for d in r['documents'] if d.get('id')}
        candidates = identity_candidates(facilities[key], list(documents.values()))
        limited = lambda r: int(r['totalText'].replace(',', '') or 0) > len(r['documents'])
        complete = len(candidates) == 1 and any(not limited(r) and any(d.get('id') == candidates[0]['document']['id'] for d in r['documents']) for r in observations)
        r = observations[-1]
        if len(candidates) == 1 and (candidates[0]['sameBuilding'] or complete):
            counts['uniqueIdentityCandidate'] += 1
            r = next(o for o in reversed(observations) if any(d.get('id') == candidates[0]['document']['id'] for d in o['documents']))
            ready.append({'facilityKey': key, 'query': r['query'], 'queriedAt': r['queriedAt'], **candidates[0]})
        else:
            reason = 'multipleCandidates' if len(candidates) > 1 else 'morePages' if candidates else 'differentIdentityOrAddress' if documents else 'noResults'
            counts[reason] += 1
            pending.append({'facilityKey': key, 'reason': reason, 'query': r['query']})
        counts['limitedQueries'] += sum(map(limited, observations))
    (folder / 'identity-candidates.json').write_text(json.dumps(ready, ensure_ascii=False, indent=2) + '\n')
    (folder / 'pending-search-review.json').write_text(json.dumps(pending, ensure_ascii=False, indent=2) + '\n')
    report = {'total': len(queue), 'searched': len(records), 'searchQueries': sum(map(len, records.values())), **counts}
    (folder / 'progress.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    return report


if __name__ == '__main__':
    print(json.dumps(summarize(), ensure_ascii=False))
