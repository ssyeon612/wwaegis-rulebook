# Rulebook Admin — 규정관리(03) 콘솔

회사 **내규 파일(엑셀·PDF·CSV·텍스트)** 을 업로드하면 → AI가 **도메인을 자동 감지**하고 → **관련 법령을 자동으로 붙여** → **편집 가능한 룰셋을 자동 생성**하는 온프레미스 지향 관리자 콘솔.

생성된 룰셋은 검토·승인·게시하면 **ST·STT가 소비하는 RS API**(`listRuleSets`/`loadRuleSet`)로 노출된다.

## 스택
- **프론트**: React + Vite (관리자 콘솔 · 사이드바 레이아웃)
- **백엔드**: Node + Express
- **DB**: SQLite (better-sqlite3)
- **파싱**: SheetJS(xlsx) · pdf.js(pdf, 한국어 CID 폰트 CMap 포함) — 서버측이라 CSP 제약 없음
- **LLM**: provider 어댑터 — `ruleBased`(기본·오프라인) / `local`(사내 호스팅) / `gemini` / `claude`

## 실행

```bash
# 1) 의존성 설치
npm run install:all        # 또는 각 폴더에서 npm install

# 2) 서버 환경설정
cp server/.env.example server/.env   # 기본 LLM_PROVIDER=ruleBased (키 불필요)

# 3) 개발 실행 (서버 :4300 + 웹 :5300 동시)
npm install                # 루트 concurrently
npm run dev
```

- 웹: http://localhost:5300  · API: http://localhost:4300
- Vite dev 서버가 `/api`를 백엔드로 프록시한다.

## 화면 (관리자 콘솔)
- **대시보드** — 현황·도메인·엔진
- **룰셋 생성** — 내규 업로드/붙여넣기 → 자동 감지 → 편집 가능한 룰셋
- **룰셋 관리** — 목록 · 상세(룰 편집: 📄내규 출처 + ⚖법령 근거(AI 제공) + 판단근거, 승인·게시)
- **RS API** — listRuleSets/loadRuleSet 탐색기
- **설정** — LLM provider 전환 안내

## LLM provider 전환 (온프레미스 정합)
`server/.env`의 `LLM_PROVIDER` 한 줄로 전환 (재시작):
- `ruleBased` — 오프라인 규칙기반. 폐쇄망에서 즉시 동작. **기본값**
- `local` — 사내 자체 호스팅(Ollama/vLLM·Gemma). **진짜 온프레미스 권장** (데이터 외부 반출 없음)
- `gemini` / `claude` — 클라우드. **데이터가 외부로 나가므로 준법 승인 후에만**(F1-6). 실패 시 자동으로 ruleBased 폴백.

## 도메인 팩 확장
`server/src/knowledge/`에 도메인 모듈(키워드맵 + 지식/법령 + 예시)을 추가하고 `index.js`의 `PACKS`에 등록하면, 자동 감지 대상에 바로 포함된다. (현재: 금융·자동차)

## 데이터
SQLite 파일: `server/data/rulebook.db` (자동 생성). 테이블: `documents` · `rulesets` · `rules`.

## API 요약
| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/rulesets/extract` | 내규 업로드(multipart) 또는 text → 자동 감지·룰셋 생성 |
| GET | `/api/rulesets` | 룰셋 목록 |
| GET | `/api/rulesets/:id` | 룰셋 상세(룰 포함) |
| PATCH | `/api/rulesets/rules/:ruleId` | 룰 수정 |
| POST | `/api/rulesets/:id/publish` | 게시(승인 룰만) |
| POST | `/api/rs/listRuleSets` | (ST·STT) 목록 |
| POST | `/api/rs/loadRuleSet` | (ST) 본문 전체 |

> ※ 규칙기반 분석·내장 법령은 데모용 스냅샷이며, 법령 인용·문구는 검토 필요(초안). 실운영은 `local` LLM 연결 권장.
