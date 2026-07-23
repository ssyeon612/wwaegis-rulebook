// SQLite (better-sqlite3) — 문서·룰셋·룰 저장
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'rulebook.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  format TEXT,
  content TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS rulesets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  version TEXT DEFAULT '0.1.0',
  status TEXT DEFAULT 'draft',            -- draft | published
  ruleset_id TEXT,                        -- 게시 시 발급 (RSET...)
  panel_id TEXT,
  aggregate_method TEXT DEFAULT 'WEIGHTED',
  block_threshold INTEGER DEFAULT 3,
  engine TEXT,
  document_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  published_at TEXT,
  FOREIGN KEY(document_id) REFERENCES documents(id)
);
CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruleset_id INTEGER NOT NULL,
  order_idx INTEGER DEFAULT 0,
  tag TEXT,
  title TEXT,
  severity TEXT DEFAULT 'MEDIUM',
  speaker TEXT DEFAULT 'advisor',
  source_rule_id TEXT,
  internal_source TEXT,                   -- 📄 내규 출처
  law_basis TEXT,                         -- ⚖ 법령 근거 (AI 제공)
  knowledge TEXT,
  status TEXT DEFAULT 'draft',            -- draft | approved
  rule_uid TEXT,                          -- 게시 시 발급 (RULE...)
  FOREIGN KEY(ruleset_id) REFERENCES rulesets(id) ON DELETE CASCADE
);

-- ── 법령 (국가법령정보센터 OPEN API 수집) ────────────────────────────
-- 조문 단위로 보관한다. 룰이 조문을 참조하므로 개정 시 영향 범위를 역추적할 수 있다.
CREATE TABLE IF NOT EXISTS laws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  law_key TEXT NOT NULL,                  -- 법령ID(MST) — API 재조회 키
  law_name TEXT NOT NULL,                 -- 금융소비자 보호에 관한 법률
  article_no TEXT NOT NULL,               -- 제19조
  article_title TEXT,                     -- 설명의무
  content TEXT,                           -- 조문 본문
  effective_date TEXT,                    -- 시행일
  promulgation_date TEXT,                 -- 공포일
  source_url TEXT,
  content_hash TEXT,                      -- 개정 감지용 (본문 해시)
  fetched_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'active',           -- active | superseded
  UNIQUE(law_key, article_no)
);

-- 조문 스냅샷 — 개정될 때마다 append. 과거 시점 조문을 복원할 수 있다. (요구사항 5)
CREATE TABLE IF NOT EXISTS law_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  law_id INTEGER NOT NULL,
  content TEXT,
  effective_date TEXT,
  content_hash TEXT,
  captured_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(law_id) REFERENCES laws(id) ON DELETE CASCADE
);

-- 갱신 승인 큐 — 스케줄러가 개정을 감지하면 pending으로 쌓고, 승인 전에는 룰에 반영하지 않는다. (요구사항 4)
CREATE TABLE IF NOT EXISTS law_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  law_id INTEGER NOT NULL,
  old_hash TEXT,
  new_hash TEXT,
  old_content TEXT,
  new_content TEXT,
  affected_rules INTEGER DEFAULT 0,       -- 이 개정이 건드리는 룰 수 (승인 판단 근거)
  status TEXT DEFAULT 'pending',          -- pending | approved | rejected
  detected_at TEXT DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewed_by TEXT,
  note TEXT,
  FOREIGN KEY(law_id) REFERENCES laws(id) ON DELETE CASCADE
);

-- 법령 점검 실행 기록 — 자동/수동 업데이트가 언제 돌았고 무엇이 바뀌었나.
-- 메모리 변수로만 두면 서버 재시작 시 '마지막 업데이트' 날짜가 사라져 영속화한다.
CREATE TABLE IF NOT EXISTS law_check_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT,                             -- scheduler | manual
  started_at TEXT,
  finished_at TEXT,
  checked INTEGER DEFAULT 0,              -- 재조회한 법령 수
  changed INTEGER DEFAULT 0,             -- 개정 감지된 조문 수
  added INTEGER DEFAULT 0,               -- 신규 조문 수
  errors INTEGER DEFAULT 0
);

-- 룰 ↔ 조문 연결 (N:M). law_basis 자유문자열을 대체하는 참조. (요구사항 3)
CREATE TABLE IF NOT EXISTS rule_laws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL,
  law_id INTEGER NOT NULL,
  cited_text TEXT,                        -- 룰에 표시할 인용 문구
  linked_by TEXT DEFAULT 'ai',            -- ai | user
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(rule_id, law_id),
  FOREIGN KEY(rule_id) REFERENCES rules(id) ON DELETE CASCADE,
  FOREIGN KEY(law_id) REFERENCES laws(id) ON DELETE CASCADE
);

-- 룰 변경 이력 — 사용자 편집과 법령 반영을 같은 테이블에 남긴다. (요구사항 5)
CREATE TABLE IF NOT EXISTS rule_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER,
  ruleset_id INTEGER,
  field TEXT,                             -- title | knowledge | law_basis | status ...
  old_value TEXT,
  new_value TEXT,
  source TEXT DEFAULT 'user_edit',        -- ai_extract | user_edit | law_update
  law_update_id INTEGER,                  -- source=law_update일 때 근거
  actor TEXT,
  changed_at TEXT DEFAULT (datetime('now'))
);

-- 지식그래프 층 (요구사항 B) — 내규 문서를 청크로 쪼개 룰의 근거 청크를 역추적한다.
-- 서빙 룰셋(RS-2)은 그대로 두고, 이 층은 "어느 문서·청크·법령·개념에서 왔나"만 설명한다.
CREATE TABLE IF NOT EXISTS doc_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  idx INTEGER,                            -- 문서 내 순번
  text TEXT,
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON doc_chunks(document_id);

-- 지식그래프(AutoSchemaKG 방법론) — 트리플 추출 + 개념화로 스키마 유도.
-- 엔티티/이벤트 노드, (주어-관계-목적어) 트리플, 유도된 스키마(개념 타입·관계 타입).
-- 서빙 룰셋과 독립. 근거(provenance)는 chunk_id·rule_id로 역추적.
CREATE TABLE IF NOT EXISTS kg_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruleset_id INTEGER NOT NULL,
  name TEXT,                              -- 엔티티/이벤트 이름
  etype TEXT,                             -- 주체 | 개념 | 법령 | 이벤트
  concept TEXT,                           -- 유도된 상위 개념(스키마 타입)
  chunk_id INTEGER, rule_id INTEGER
);
CREATE TABLE IF NOT EXISTS kg_triples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruleset_id INTEGER NOT NULL,
  subject TEXT, relation TEXT, object TEXT,
  deontic TEXT,                           -- 의무 유형(고지의무·설명의무·금지·확인)
  severity TEXT, rule_id INTEGER, chunk_id INTEGER
);
CREATE TABLE IF NOT EXISTS kg_schema (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruleset_id INTEGER NOT NULL,
  kind TEXT,                              -- node(개념 타입) | relation(관계 타입)
  name TEXT,
  UNIQUE(ruleset_id, kind, name)
);
CREATE INDEX IF NOT EXISTS idx_kg_ent_rs ON kg_entities(ruleset_id);
CREATE INDEX IF NOT EXISTS idx_kg_tri_rs ON kg_triples(ruleset_id);

-- AI 스키마 제안(AutoSchemaKG 방법론)에서 사용자가 "무시"한 개념 — 다시 제안하지 않도록.
-- 채택하면 룰이 생겨 자동으로 제안에서 빠지므로 accepted는 따로 기록하지 않는다.
CREATE TABLE IF NOT EXISTS kg_dismissed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruleset_id INTEGER NOT NULL,
  tag TEXT,
  dismissed_at TEXT DEFAULT (datetime('now')),
  UNIQUE(ruleset_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_rule_laws_law ON rule_laws(law_id);
CREATE INDEX IF NOT EXISTS idx_rule_laws_rule ON rule_laws(rule_id);
CREATE INDEX IF NOT EXISTS idx_law_updates_status ON law_updates(status);
CREATE INDEX IF NOT EXISTS idx_rule_history_rule ON rule_history(rule_id);
CREATE INDEX IF NOT EXISTS idx_laws_key ON laws(law_key);
`);

// 기존 DB에 없는 컬럼만 추가한다 (ALTER는 중복 실행 시 에러라 존재 확인 후 실행).
function addColumn(table, column, decl) {
  const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}
addColumn('documents', 'hint', 'TEXT');           // 업로드 시 담당자 보충 설명
addColumn('rulesets', 'source_hint', 'TEXT');     // 추출에 사용된 보충 설명 스냅샷
addColumn('rules', 'chunk_id', 'INTEGER');        // 이 룰의 근거 청크 (지식그래프 층)
addColumn('rulesets', 'product_id', 'TEXT');      // 외부 상품마스터 코드(선택) — 매칭 키 아님, STT 표시·참조용
addColumn('rulesets', 'product_name', 'TEXT');    // STT 상품 목록 표시명 (없으면 룰셋명 사용)
addColumn('rules', 'action_tags', 'TEXT');        // 행위태그 JSON 배열 (의미태그와 별개)
addColumn('rules', 'law_compare', 'TEXT');        // 내규↔수집법령 대조 노트 (근거 확인/공백 표시)

// 룰셋별 태그 사전 — 표준을 복제해와 룰셋 안에서 편집(옵션3). 룰셋마다 독립.
db.exec(`
CREATE TABLE IF NOT EXISTS ruleset_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruleset_id INTEGER NOT NULL,
  kind TEXT NOT NULL,                     -- meaning | action
  code TEXT NOT NULL,
  name TEXT,
  grp TEXT,                               -- 대분류 key (의미태그)
  output INTEGER DEFAULT 1,               -- 모델 출력 ● (의미태그)
  active INTEGER DEFAULT 1,               -- 사용/보류
  origin TEXT DEFAULT 'standard',         -- standard(복제) | custom(룰셋 신설)
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(ruleset_id, kind, code),
  FOREIGN KEY(ruleset_id) REFERENCES rulesets(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ruleset_tags ON ruleset_tags(ruleset_id, kind);
`);

export default db;
