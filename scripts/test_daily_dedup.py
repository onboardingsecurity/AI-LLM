#!/usr/bin/env python3
"""
T04-C20, T04-C21: 일별 고유키·갱신 규칙을 합성 시계로 시험한다.

같은 합성 날짜(2099-02-01) 세 번 성공 + 다음 합성 날짜(2099-02-02) 한 번 성공을
실제 운영 코드(fetch_weather.build_record / save_record)에 그대로 통과시켜,
- C20: 같은 날짜 세 번 후에도 파일(일별 기록)이 1개인지
- C21: 다음 날짜 한 번 후에 파일이 2개로 늘어나는지
를 확인한다. 실제 data/weather/ 폴더는 건드리지 않고 임시 디렉터리에서만 시험한다.
"""
import json
import sys
import tempfile
import os

sys.path.insert(0, os.path.dirname(__file__))
from fetch_weather import build_record, prune_old_records, save_record  # noqa: E402

fail_count = 0


def check(label, condition, detail=None):
    global fail_count
    status = "PASS" if condition else "FAIL"
    print(f"{status} — {label}")
    if detail is not None:
        print(f"   {detail}")
    if not condition:
        fail_count += 1


def make_raw(time_str: str, temperature: float) -> dict:
    return {
        "current": {"time": time_str, "temperature_2m": temperature},
        "current_units": {"temperature_2m": "°C"},
        "timezone": "Asia/Seoul",
        "utc_offset_seconds": 32400,
    }


with tempfile.TemporaryDirectory(prefix="t04-c20-c21-") as tmp_dir:
    print(f"임시 저장소: {tmp_dir}\n")

    # 같은 합성 날짜(2099-02-01) 세 번, 서로 다른 시각·다른 값
    same_day_calls = [
        ("2099-02-01T09:00", 10.0, "2099-02-01T00:00:00Z"),
        ("2099-02-01T09:15", 10.5, "2099-02-01T00:15:00Z"),
        ("2099-02-01T09:30", 11.0, "2099-02-01T00:30:00Z"),
    ]

    print("=== 같은 날짜 세 번 (C20) ===")
    last_merged = None
    for i, (time_str, temp, query_time) in enumerate(same_day_calls, start=1):
        raw = make_raw(time_str, temp)
        record = build_record(raw, query_time, "https://fixtures.invalid/synthetic")
        out_path, action, merged = save_record(tmp_dir, record)
        expected_action = "created" if i == 1 else "updated"
        check(f"{i}번째 호출: action={expected_action}", action == expected_action, f"실제: {action}")
        last_merged = merged

    files_after_same_day = sorted(os.listdir(tmp_dir))
    check("세 번 호출 후 파일 정확히 1개", len(files_after_same_day) == 1, f"파일 목록: {files_after_same_day}")
    check("파일명이 합성 날짜(2099-02-01.json)", files_after_same_day == ["2099-02-01.json"])
    check("revision_count=3 (세 번 다 반영)", last_merged["daily_meta"]["revision_count"] == 3,
          f"실제: {last_merged['daily_meta']['revision_count']}")
    check("최종 저장값은 마지막(3번째) 호출의 값(11.0)", last_merged["stored"]["value"] == 11.0,
          f"실제: {last_merged['stored']['value']}")
    check("first_seen_query_time_utc는 1번째 호출 시각 그대로 보존",
          last_merged["daily_meta"]["first_seen_query_time_utc"] == "2099-02-01T00:00:00Z")

    print("\n=== 다음 날짜 한 번 (C21) ===")
    raw_next = make_raw("2099-02-02T09:00", 12.0)
    record_next = build_record(raw_next, "2099-02-02T00:00:00Z", "https://fixtures.invalid/synthetic")
    out_path2, action2, merged2 = save_record(tmp_dir, record_next)
    check("다음 날짜 호출: action=created (새 파일)", action2 == "created", f"실제: {action2}")

    files_after_next_day = sorted(os.listdir(tmp_dir))
    check("다음 날짜 호출 후 파일 정확히 2개", len(files_after_next_day) == 2, f"파일 목록: {files_after_next_day}")
    check("기존 2099-02-01.json은 그대로 남아있음 (덮어써지지 않음)",
          "2099-02-01.json" in files_after_next_day)
    check("새 2099-02-02.json 생성됨", "2099-02-02.json" in files_after_next_day)

    with open(os.path.join(tmp_dir, "2099-02-01.json"), encoding="utf-8") as f:
        day1_final = json.load(f)
    check("day1 파일 값은 여전히 11.0 (day2 저장이 day1을 건드리지 않음)",
          day1_final["stored"]["value"] == 11.0, f"실제: {day1_final['stored']['value']}")

    print("\n=== 어제·오늘만 남기기 (오래된 날짜 삭제) ===")
    open(os.path.join(tmp_dir, "notes.json"), "w").write("{}")  # 날짜 형식이 아닌 파일은 지우면 안 된다
    removed_now = prune_old_records(tmp_dir, "2099-02-02")
    check("어제·오늘만 있을 때는 아무것도 지우지 않음", removed_now == [], f"삭제: {removed_now}")

    raw_third = make_raw("2099-02-03T09:00", 13.0)
    record_third = build_record(raw_third, "2099-02-03T00:00:00Z", "https://fixtures.invalid/synthetic")
    save_record(tmp_dir, record_third)
    removed = prune_old_records(tmp_dir, "2099-02-03")
    files_after_prune = sorted(os.listdir(tmp_dir))
    check("3번째 날짜 저장 후 가장 오래된 2099-02-01.json만 삭제", removed == ["2099-02-01.json"], f"삭제: {removed}")
    check("어제(02-02)·오늘(02-03) 파일은 남음",
          "2099-02-02.json" in files_after_prune and "2099-02-03.json" in files_after_prune, f"목록: {files_after_prune}")
    check("날짜 형식이 아닌 notes.json은 건드리지 않음", "notes.json" in files_after_prune)

    print(f"\n같은 날 재실행 전후 행 수: 세 번 재실행 후 1건 → 다음 날짜 1번 후 2건")

# 자정 경계: 일별 키는 조회 시각(UTC)이 아니라 출처 시각의 Asia/Seoul 날짜여야 한다.
with tempfile.TemporaryDirectory(prefix="t04-midnight-") as tmp_dir:
    print("\n=== 자정 근처 날짜 키 (UTC 날짜와 Asia/Seoul 날짜가 어긋나는 시각) ===")
    midnight_calls = [
        # (출처 시각 KST, 조회 시각 UTC, 기대 파일)
        ("2099-03-01T23:50", "2099-03-01T14:50:00Z", "2099-03-01.json"),  # KST 3/1 23:50 = UTC 3/1
        ("2099-03-02T00:05", "2099-03-01T15:05:00Z", "2099-03-02.json"),  # KST 3/2 00:05 = UTC 3/1 (UTC 날짜는 그대로 3/1)
        ("2099-03-02T08:30", "2099-03-01T23:30:00Z", "2099-03-02.json"),  # 같은 KST 3/2, UTC는 3/1 → 새 파일이 아니라 3/2에 합쳐져야 함
    ]
    for time_str, query_time, expected_file in midnight_calls:
        record = build_record(make_raw(time_str, 10.0), query_time, "https://fixtures.invalid/synthetic")
        out_path, _, _ = save_record(tmp_dir, record)
        check(f"출처 {time_str}(KST) / 조회 {query_time}(UTC) → {expected_file}",
              os.path.basename(out_path) == expected_file, f"실제: {os.path.basename(out_path)}")
    files_midnight = sorted(os.listdir(tmp_dir))
    check("자정 경계 3회 후 파일 정확히 2개(KST 3/1, 3/2)", files_midnight == ["2099-03-01.json", "2099-03-02.json"],
          f"목록: {files_midnight}")

print(f"총 실패 {fail_count}건")

sys.exit(0 if fail_count == 0 else 1)
