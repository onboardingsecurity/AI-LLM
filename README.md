# AI-LLM
AI LLM 활용을 위한 저장소

## 9번 과제: 나를 말하는 에이전트

매일 아침저녁 리추얼 기록에서 내 강점과 이야기를 찾는 에이전트 규칙(프롬프트 한 벌)을 만들고, 자기소개서 초안과 포트폴리오 뼈대를 서사 문서 한 개로 완성합니다.

| 파일 | 내용 |
|---|---|
| [NARRATIVE.md](NARRATIVE.md) | 제출하는 서사 문서 |
| [agent/AGENT-PROMPT.md](agent/AGENT-PROMPT.md) | 무료 AI 서비스의 새 대화에 붙이는 규칙과 질문 |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | 요구사항 명세서(T09-C01~C26) |
| [docs/SECURITY-CHECKLIST.md](docs/SECURITY-CHECKLIST.md) | 보안 점검 리스트 |
| [records/](records/README.md) | 리추얼 기록 원문 자리. 저장소에 올라가지 않음 |

### 점검

```bash
node scripts/check.mjs        # 요구사항과 보안 모두
node scripts/check.mjs req    # 요구사항만
node scripts/check.mjs sec    # 보안만
```

점검 스크립트는 읽기 전용이며 외부 연결과 설치할 패키지가 없습니다. Node 20 이상이 필요합니다.
