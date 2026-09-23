#!/usr/bin/env bash
# 이 프로젝트의 모든 검증 스크립트를 순서대로 돌리고 통과/실패 요약을 보여준다.
# 실제 네트워크 호출을 하는 건 fetch_weather.py뿐이다(나머지는 합성값 또는 이미 저장된 파일만 씀).

set -u
cd "$(dirname "$0")/.."
export PYTHONIOENCODING=utf-8

PY=python3
python3 -c "" >/dev/null 2>&1 || PY=python

CHECKS=(
  "scripts/test_daily_dedup.py:$PY"
  "scripts/test_failure_replays.mjs:node"
  "scripts/replay_t04_fixtures.mjs:node"
  "scripts/verify_asset_manifest.mjs:node"
  "scripts/verify_fixture_sync.mjs:node"
  "scripts/verify_daily_records_sync.mjs:node"
)

FAIL_COUNT=0
echo "=== T04 전체 검증 시작 ==="
for entry in "${CHECKS[@]}"; do
  file="${entry%%:*}"
  runner="${entry##*:}"
  echo ""
  echo "--- $file ---"
  if "$runner" "$file"; then
    echo "PASS — $file"
  else
    echo "FAIL — $file"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

echo ""
echo "=== 요약: ${#CHECKS[@]}개 스크립트 중 실패 ${FAIL_COUNT}건 ==="
exit $([ "$FAIL_COUNT" -eq 0 ] && echo 0 || echo 1)
