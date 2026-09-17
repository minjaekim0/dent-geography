"""Low-rate HIRA specialty collector suitable for a scheduled GitHub Action."""
from __future__ import annotations

import argparse
import csv
import json
import re
import socket
import time
import urllib.parse
import urllib.request
from pathlib import Path

SPECIALTIES = {
    "구강악안면외과", "치과보철과", "치과교정과", "소아치과", "치주과", "치과보존과",
    "구강내과", "영상치의학과", "구강병리과", "예방치과", "통합치의학과",
}


def parse(html: str) -> dict[str, int]:
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))
    values: dict[str, int] = {}
    for specialty, count in re.findall(r"([가-힣]+과)\s*\(\s*(\d+)\s*\)", text):
        if specialty in SPECIALTIES:
            values[specialty] = values.get(specialty, 0) + int(count)
    return values


def fetch(ykiho: str, timeout: int) -> str:
    query = urllib.parse.urlencode({"isNewWindow": "Y", "ykiho": ykiho, "isPopupYn": "Y"})
    req = urllib.request.Request(
        "https://www.hira.or.kr/ra/hosp/hospInfoAjax.do?" + query,
        headers={"User-Agent": "Mozilla/5.0 (compatible; dental-geography/1.0)", "Accept-Language": "ko-KR,ko;q=0.9"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read().decode("utf-8", "replace")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--targets", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--limit", type=int, default=25)
    ap.add_argument("--delay", type=float, default=2)
    ap.add_argument("--timeout", type=int, default=25)
    args = ap.parse_args()
    try:
        socket.getaddrinfo("www.hira.or.kr", 443, type=socket.SOCK_STREAM)
    except OSError as exc:
        print(json.dumps({"blocked": "HIRA DNS lookup failed", "error": str(exc)}, ensure_ascii=False))
        return

    with args.targets.open(encoding="utf-8", newline="") as fh:
        targets = list(csv.DictReader(fh))
    existing: list[dict[str, str]] = []
    if args.output.exists():
        with args.output.open(encoding="utf-8", newline="") as fh:
            existing = list(csv.DictReader(fh))
    done = {row["facility_key"] for row in existing}
    pending = [row for row in targets if row["facility_key"] not in done][:args.limit]
    result = {"requested": len(pending), "saved": 0, "noSpecialty": 0, "failed": []}
    for index, target in enumerate(pending):
        if index:
            time.sleep(args.delay)
        try:
            values = parse(fetch(target["ykiho"], args.timeout))
            if values:
                existing.extend({"facility_key": target["facility_key"], "observed_at": "2026-06-30", "specialty": specialty, "specialist_count": str(count)} for specialty, count in values.items())
            else:
                existing.append({"facility_key": target["facility_key"], "observed_at": "2026-06-30", "specialty": "__NONE__", "specialist_count": "0"})
                result["noSpecialty"] += 1
            done.add(target["facility_key"])
            result["saved"] += 1
        except Exception as exc:
            result["failed"].append({"name": target["name"], "error": str(exc)})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["facility_key", "observed_at", "specialty", "specialist_count"])
        writer.writeheader()
        writer.writerows(existing)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
