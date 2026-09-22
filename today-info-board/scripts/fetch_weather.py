#!/usr/bin/env python3
"""
오늘의 실제 정보판 - T04: 값 하나 조회/저장

Open-Meteo(api.open-meteo.com) 공개 API에서 서울의 현재 기온을 조회한다.
- API 키 불필요 (비밀키 없는 호출 경로)
- 개인정보 없음: 위치는 서울(공개 지점 좌표)로 고정, 개인 계정/기기 정보 없음

원자료(raw_response)를 그대로 보존하고, 화면 표시에 쓸 값만 뽑아
stored 블록으로 정규화해서 함께 저장한다. (T04-C10: 원자료·저장값 일치 근거)
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

API_URL = (
    "https://api.open-meteo.com/v1/forecast"
    "?latitude=37.5665&longitude=126.9780"
    "&current=temperature_2m,relative_humidity_2m,weather_code"
    "&timezone=Asia%2FSeoul"
)
SOURCE_NAME = "Open-Meteo (api.open-meteo.com)"


def fetch_raw():
    with urllib.request.urlopen(API_URL, timeout=10) as resp:
        return json.loads(resp.read())


def build_record(raw: dict, query_time_utc: str) -> dict:
    current = raw["current"]
    units = raw["current_units"]
    tz_name = raw["timezone"]
    utc_offset_seconds = raw["utc_offset_seconds"]

    # 출처 시각(current.time)은 API가 이미 timezone 파라미터 기준 지역시간으로 내려줌.
    # 오프셋을 붙여 명확한 ISO8601(+09:00 등)로 정규화한다.
    offset_hours = utc_offset_seconds // 3600
    offset_minutes = (abs(utc_offset_seconds) % 3600) // 60
    offset_str = f"{'+' if offset_hours >= 0 else '-'}{abs(offset_hours):02d}:{offset_minutes:02d}"
    source_time_local = f"{current['time']}:00{offset_str}"

    stored = {
        "value": current["temperature_2m"],
        "unit": units["temperature_2m"],
        "source": SOURCE_NAME,
        "source_url": API_URL,
        "source_time": source_time_local,
        "query_time_utc": query_time_utc,
        "reference_timezone": tz_name,
    }

    return {
        "raw_response": raw,
        "stored": stored,
    }


def save_record(out_dir: str, record: dict) -> tuple[str, str, dict]:
    """일별 고유키(source_time의 Asia/Seoul 날짜)로 upsert한다.

    T04-C20: 같은 날짜에 여러 번 저장해도 파일은 1개 유지, 최신값으로 갱신(합치기).
    T04-C21: 날짜가 다르면 새 파일 생성.

    출처 시각(source_time) 기준으로 날짜 키를 만드는 이유: 조회 시각(query_time_utc)은
    자정 근처에서 실행 시점에 따라 출처 시각과 다른 날짜로 어긋날 수 있기 때문
    (막히는 지점 대응: 기준 시간대 확인 → 날짜 키 생성 위치 확인 → UTC와 화면 날짜 대조).
    """
    os.makedirs(out_dir, exist_ok=True)
    date_key = record["stored"]["source_time"][:10]
    out_path = os.path.join(out_dir, f"{date_key}.json")

    if os.path.exists(out_path):
        with open(out_path, "r", encoding="utf-8") as f:
            existing = json.load(f)
        prior_meta = existing.get("daily_meta", {})
        merged = dict(record)
        merged["daily_meta"] = {
            "date_key": date_key,
            "first_seen_query_time_utc": prior_meta.get("first_seen_query_time_utc", existing["stored"]["query_time_utc"]),
            "last_seen_query_time_utc": record["stored"]["query_time_utc"],
            "revision_count": prior_meta.get("revision_count", 1) + 1,
        }
        action = "updated"
    else:
        merged = dict(record)
        merged["daily_meta"] = {
            "date_key": date_key,
            "first_seen_query_time_utc": record["stored"]["query_time_utc"],
            "last_seen_query_time_utc": record["stored"]["query_time_utc"],
            "revision_count": 1,
        }
        action = "created"

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    return out_path, action, merged


def main():
    query_time_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    raw = fetch_raw()
    record = build_record(raw, query_time_utc)

    out_dir = os.path.join(os.path.dirname(__file__), "..", "data", "weather")
    out_path, action, merged = save_record(out_dir, record)

    print(f"[{action}] {out_path} (revision_count={merged['daily_meta']['revision_count']})", file=sys.stderr)
    print(json.dumps(merged, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
