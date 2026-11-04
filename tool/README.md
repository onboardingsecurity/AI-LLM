# 사이트를 새로 만드는 장치

새 기록을 넣고 실행하면 사이트의 **숫자 페이지**와 **이야기 페이지**, 그리고 능력별 **문단 후보**를 다시 만듭니다.

- Python 3.9 이상만 있으면 됩니다. 따로 설치할 것이 없습니다.
- AI 서비스를 부르지 않고, 인터넷에 연결하지 않으며, 키가 필요 없습니다.
- 입력 파일은 읽기만 합니다. 결과는 `--out`으로 지정한 폴더 안에만 씁니다.
- 같은 입력으로 돌리면 같은 결과가 나옵니다(결과에 시각을 넣지 않습니다).

## 돌리는 방법 (세 단계)

1. 이 `tool` 폴더에서 터미널을 엽니다.
2. 아래 명령을 실행합니다. 샘플 기록으로 돌아가며, 두 번 만들어 서로 같은지도 비교합니다.

   ```
   python refresh.py --history sample/ritual-history.sample.json --manual sample/manual.sample.json --out out --twice
   ```

3. `out` 폴더를 엽니다. `out/compare.txt`에 "모두 같음"이 있으면 정상입니다.

| 만들어지는 파일 | 내용 |
|---|---|
| `out/site/numbers.html` | 숫자 페이지. 숫자마다 출처(내 출석 기록, 리추얼 기록, 내 제출 현황)가 붙습니다 |
| `out/site/story.html` | 이야기 페이지. `approved/story.json`의 문장으로 만듭니다 |
| `out/candidates.md` | 능력별 문단 후보. 날짜와 근거가 붙고, 승인 여부가 적힙니다 |
| `out/numbers.json` | 계산된 숫자 전체 |
| `out/compare.txt` | 같은 입력으로 두 번 만든 결과 비교(`--twice`일 때) |

## 내 기록으로 돌릴 때

`--history`에 리추얼 기록 JSON을, `--manual`에 `input/manual.json`을 줍니다. 출석 기록과 제출 현황은 파일이 아니라 화면에서 옮겨 적은 값이라서 `input/manual.json`에 직접 고칩니다(날짜와 과제 이름, 출석 일수).

```
python refresh.py --history <리추얼 기록.json> --manual input/manual.json --out result --twice
```

만들어진 `result/site/numbers.html`, `result/site/story.html`을 사이트 폴더(`site/`)에 복사하면 사이트가 새로워집니다.

## 어떤 문장이 사이트에 들어가나

사용자가 승인한 문장만 들어갑니다.

- 이야기는 `approved/story.json`에 있는 문장 그대로입니다.
- 능력별 문단 후보는 `out/candidates.md`에 나오고, 처음에는 모두 "미승인"입니다. 사이트에 넣으려면 후보의 `id`와 `sha`를 `approved/candidates.json`에 적고 다시 실행합니다.
- 기록이 늘어 후보 문장이 달라지면 `sha`가 달라져서 "승인 후 문장이 바뀜"으로 표시되고, 다시 승인하기 전까지 사이트에 들어가지 않습니다.

## 폴더

| 위치 | 내용 |
|---|---|
| `refresh.py` | 장치 본체 |
| `approved/` | 승인된 이야기와 후보 목록 |
| `input/manual.json` | 출석 기록과 제출 현황을 옮겨 적은 값 |
| `sample/` | 가상의 샘플 입력(실제 기록이 아님) |
| `result/` | 마지막으로 만든 결과와 두 번 실행 비교 |

## 환경 변수와 키

필요하지 않습니다. 이 장치는 키를 읽지 않습니다.
